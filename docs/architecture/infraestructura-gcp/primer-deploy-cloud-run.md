# Runbook: primer deploy de un servicio a Cloud Run

**Proyecto GCP:** `cyp-cumbres-461220` — **Región:** `northamerica-south1` — **Instancia Cloud SQL:** `db-cypcumbres`

Pasos para llevar un servicio de CumbresBI de "imagen en Artifact Registry" a "Cloud Run
funcionando de verdad" (BD conectada, migrado, respondiendo). Verificado sirviendo los 13
servicios reales el 15/Sep/2026 (ver `docs/PROGRESO-CLOUD-RUN.md`, nota local no versionada, para
el detalle de esa corrida específica). Este doc es la versión reutilizable para la próxima vez
(otro ambiente, staging, un servicio nuevo).

## 0. Prerrequisitos (una sola vez por proyecto GCP, no por servicio)

- `scripts/gcp_setup.sh` corrido (Workload Identity Federation, cuenta `cumbresbi-deployer`, las
  cuentas de servicio por microservicio, Artifact Registry).
- Los secrets de GitHub Actions cargados (`GCP_PROJECT_ID`, `GCP_REGION`,
  `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SA_EMAIL`, `GATEWAY_URL_DEV`).
- gcloud CLI local autenticado (`gcloud auth login`, `gcloud config set project cyp-cumbres-461220`).
  En Windows, instalar desde https://cloud.google.com/sdk/docs/install y **reiniciar la sesión de
  terminal (o la PC)** después - el PATH nuevo no siempre lo ven ventanas ya abiertas.
- Docker Desktop corriendo, si vas a construir una imagen a mano (normalmente no hace falta - el
  workflow de GitHub Actions ya sube las imágenes).

## 1. Confirmar que la base de datos existe

Cada servicio con BD propia tiene una base `cumbresbi_<servicio>` y un usuario `<servicio>_app` en
la instancia compartida `db-cypcumbres` (ver `cloud-sql.md`). Si no existen, crearlos desde la
consola (SQL → db-cypcumbres → Bases de datos / Usuarios), **nunca tocar las bases del sistema
en producción** (`administracion`, etc.).

## 2. Confirmar/crear los secrets en Secret Manager

Por convención cada servicio usa `<PREFIJO>_DB_PASSWORD` y `<PREFIJO>_DJANGO_SECRET_KEY`, más el
compartido `CUMBRESBI_SCOPE_JWT_PUBLIC_KEY`. Verificar cuáles ya existen:

```bash
gcloud secrets list --project=cyp-cumbres-461220 --format="value(name)" | grep -i <PREFIJO>
```

Crear los que falten (Django secret key, valor aleatorio):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))" | gcloud secrets create <PREFIJO>_DJANGO_SECRET_KEY --data-file=- --project=cyp-cumbres-461220
```

Para `<PREFIJO>_DB_PASSWORD`, la contraseña **tiene que ser exactamente la misma** que la del
usuario `<servicio>_app` en MySQL - ver sección "Password sync" abajo antes de asumir que un
secret viejo ya sirve.

## 3. Deploy del servicio (con BD propia)

```bash
gcloud run deploy <servicio>-dev \
  --image northamerica-south1-docker.pkg.dev/cyp-cumbres-461220/cumbresbi/<servicio>:<SHA-o-tag> \
  --region northamerica-south1 \
  --project cyp-cumbres-461220 \
  --platform managed \
  --service-account <servicio>@cyp-cumbres-461220.iam.gserviceaccount.com \
  --add-cloudsql-instances cyp-cumbres-461220:northamerica-south1:db-cypcumbres \
  --no-allow-unauthenticated \
  --set-env-vars "<PREFIJO>_DB_NAME=cumbresbi_<servicio_con_guion_bajo>,<PREFIJO>_DB_USER=<servicio>_app,<PREFIJO>_DB_SOCKET_DIR=/cloudsql/cyp-cumbres-461220:northamerica-south1:db-cypcumbres,DJANGO_DEBUG=False,DJANGO_ALLOWED_HOSTS=*" \
  --set-secrets "<PREFIJO>_DB_PASSWORD=<PREFIJO>_DB_PASSWORD:latest,DJANGO_SECRET_KEY=<PREFIJO>_DJANGO_SECRET_KEY:latest,CUMBRESBI_SCOPE_JWT_PUBLIC_KEY=CUMBRESBI_SCOPE_JWT_PUBLIC_KEY:latest" \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi
```

**Va a fallar la primera vez** con `Permission denied on secret ... secretAccessor` - es esperado,
`gcp_setup.sh` no da ese acceso. Dar el acceso y volver a correr el mismo comando:

```bash
gcloud secrets add-iam-policy-binding <SECRET> --member="serviceAccount:<servicio>@cyp-cumbres-461220.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --project=cyp-cumbres-461220
```

(una vez por cada secret que use el servicio)

Servicios **sin BD propia** (`drive-service`, `mail-service`, `api-gateway`, `frontend`): mismo
comando sin `--add-cloudsql-instances` ni las variables `*_DB_*`; revisar `settings.py` del
servicio para sus env vars/secrets específicos (ej. `DRIVE_SERVICE_ACCOUNT_JSON`,
`GATEWAY_ROUTE_*`). `api-gateway` y `frontend` sí llevan `--allow-unauthenticated` (son los únicos
puntos de entrada públicos reales).

## 4. Migrar la base de datos (solo servicios con BD)

Cloud Run Job de una sola vez, mismo servicio/secrets que el deploy:

```bash
gcloud run jobs create <servicio>-migrate \
  --image northamerica-south1-docker.pkg.dev/cyp-cumbres-461220/cumbresbi/<servicio>:<SHA-o-tag> \
  --region northamerica-south1 \
  --project cyp-cumbres-461220 \
  --service-account <servicio>@cyp-cumbres-461220.iam.gserviceaccount.com \
  --set-cloudsql-instances cyp-cumbres-461220:northamerica-south1:db-cypcumbres \
  --set-env-vars "<mismas que el deploy>" \
  --set-secrets "<mismos que el deploy>" \
  --command python \
  --args manage.py,migrate

gcloud run jobs execute <servicio>-migrate --region northamerica-south1 --project cyp-cumbres-461220 --wait
```

Si el job ya existe de una corrida anterior, usar `gcloud run jobs update` en vez de `create`, o
solo `execute` directo si no cambió nada.

## 5. Troubleshooting por código de error (orden real en que aparecen)

1. **`Permission denied on secret ... secretAccessor`** → dar el `add-iam-policy-binding` (paso 3)
   y reintentar.
2. **`OperationalError 1045 Access denied for user ... (using password: YES)`** → la contraseña
   del secret no coincide con la del usuario MySQL real. Pasó en 6 de los 13 servicios reales del
   15/Sep/2026, no hay forma de predecir cuál va a fallar de antemano.
   - Cambiar la contraseña del usuario en la consola (SQL → Usuarios → `<usuario>` → Cambiar
     contraseña) **o** por CLI: `gcloud sql users set-password <usuario> --instance=db-cypcumbres --project=cyp-cumbres-461220 --password="..."`.
   - Subir esa misma contraseña como versión nueva del secret:
     `echo -n "..." | gcloud secrets versions add <PREFIJO>_DB_PASSWORD --data-file=- --project=cyp-cumbres-461220`.
   - Para verificar que una contraseña es correcta SIN instalar cliente MySQL local, usar
     **Cloud SQL Studio** (consola → SQL → instancia → Cloud SQL Studio) - no requiere
     `gcloud components install cloud-sql-proxy` ni un cliente `mysql` en PATH.
   - **La consola de Cloud SQL a veces no aplica el cambio de contraseña la primera vez que se
     guarda** (confirmado 3 veces el 15/Sep/2026) - si sigue dando 1045 después de cambiarla,
     repetir el cambio de contraseña (no solo reintentar el job) suele arreglarlo. También puede
     ser solo un retraso de propagación de segundos/minutos - reintentar el job una vez antes de
     investigar más a fondo.
   - Evitar contraseñas con caracteres como `~ { } ^ \` $` al copiarlas a mano entre la consola y
     el secret - son válidos pero fáciles de transcribir mal.
3. **`OperationalError 1419` (`SUPER privilege ... binary logging is enabled`)** → falta la
   bandera de instancia `log_bin_trust_function_creators=on` en `db-cypcumbres`. Ya está activada
   desde el 14/Sep/2026 (ver `cloud-sql.md`), no debería volver a pasar; si aparece, revisar que no
   se haya sobreescrito con un `gcloud sql instances patch --database-flags=...` que no incluyera
   esta bandera (ese flag REEMPLAZA la lista completa, no es aditivo).
4. **`OperationalError 1146` (`Table ... doesn't exist`)** → faltan migraciones, correr el paso 4.
5. **500 al probar un endpoint real** (no la raíz, esa da 404/302 normal) → prender
   `DJANGO_DEBUG=True` temporal (`gcloud run services update <servicio>-dev --update-env-vars DJANGO_DEBUG=True`)
   para ver el traceback real vía `curl` (el log de Cloud Run no captura tracebacks de Django por
   default, solo el access log), luego regresar a `False`.

## 6. Verificar de verdad (no solo que el contenedor arrancó)

```bash
curl -s -m 15 -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  https://<servicio>-dev-<hash>.a.run.app/<endpoint-real>/
```

- Esperar `200` en un endpoint que sí toque la BD (no basta con la raíz, que puede dar 404/302 sin
  haber conectado a nada).
- Un `401`/`403`/`400`/`411` también cuenta como "arrancó bien" si el endpoint exige algo que no
  mandamos (JWT propio, un query param, un body) - lo que de verdad importa es que NO sea `500`
  (que sí indica que algo tronó, típicamente conexión a BD o import).
- En Windows/Git Bash, un `curl` con `-o /dev/null` a veces se cuelga por un detalle de
  renegociación TLS de `schannel` - si pasa, usar `-v` (verbose, sin `-o /dev/null`) para ver la
  respuesta real en la salida aunque el comando no cierre limpio.
- La URL del servicio sale de `gcloud run services list --project=cyp-cumbres-461220 --region=northamerica-south1 --format="table(metadata.name,status.url)"`.

## 7. `api-gateway` y `frontend` (van al final, dependen de todo lo demás)

- `api-gateway`: sus env vars `GATEWAY_ROUTE_<SERVICIO>` deben apuntar a la URL real de cada Cloud
  Run ya desplegado (no al `http://<servicio>:8080` del docker-compose local). Los servicios que
  aún no estén desplegados se quedan con su default, sin bloquear el arranque del gateway.
- `frontend`: `NEXT_PUBLIC_GATEWAY_URL` se hornea en **build time**, no es una env var de
  runtime - si la URL del gateway cambia, hay que reconstruir la imagen (`docker build --build-arg
  NEXT_PUBLIC_GATEWAY_URL=<url-real> -f frontend/Dockerfile frontend`), subirla
  (`gcloud auth configure-docker northamerica-south1-docker.pkg.dev --quiet` primero si el push da
  `Unauthenticated`) y recién ahí hacer el `gcloud run deploy frontend-dev --image ...`. El secret
  (bug real encontrado y corregido 15/Sep/2026: el Dockerfile/workflow usaban el nombre
  `NEXT_PUBLIC_API_BASE_URL`, pero el código del frontend lee `NEXT_PUBLIC_GATEWAY_URL` -
  `frontend/src/lib/gatewayUrl.ts` - por eso siempre caía al default `localhost:8080` sin
  importar qué se le pasara; verificar que ambos nombres coincidan si esto vuelve a pasar).
  El secret de GitHub `GATEWAY_URL_DEV` existe justo para que el workflow de CI lo haga automático en el
  siguiente push a `main` - si ese secret quedó vacío o desactualizado, el próximo build del
  workflow va a hornear una URL incorrecta.
