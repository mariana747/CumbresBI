# document-intelligence-service — Cloud SQL + Secret Manager

**Cumbres Consultoría y Proyectos** · Infraestructura GCP, proyecto `cyp-cumbres-461220`

## Cuenta de servicio

`document-intelligence-service@cyp-cumbres-461220.iam.gserviceaccount.com` — descripción "Acceso a
Gemini y Drive". Ya tenía acceso al secreto `GEMINI_API_KEY` desde antes de este trabajo de Cloud SQL.

## Código

El patrón `DOCINT_DB_SOCKET_DIR` (conexión a Cloud SQL vía Auth Proxy/socket Unix, en vez de host/puerto
TCP) ya está implementado en `services/document-intelligence-service/config/settings.py` — rama
`feature/docint-cloud-sql-socket-v2`.

## Cloud SQL

El usuario de BD `docint_app` se creó en la instancia `db-cypcumbres` y se acotó a la base
`cumbresbi_docint_service` — ver el detalle de bases/privilegios en [`cloud-sql.md`](cloud-sql.md).

## Secret Manager

Con la contraseña real de `docint_app` ya confirmada en Cloud SQL, se creó el secreto
`DOCINT_DB_PASSWORD` (tipo "Otras credenciales de bases de datos") y se otorgó el rol "Usuario con
acceso a secreto" sobre ese secreto a `document-intelligence-service@cyp-cumbres-461220.iam.gserviceaccount.com`
— es la única cuenta con acceso a ese secreto, siguiendo el principio de mínimo privilegio (README.md,
sección 7: cada cuenta de servicio accede solo a sus propios secretos).
