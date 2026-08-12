# CumbresBI — Alcance para cerrar Fase 2 (PLD / Cumplimiento) 

**Cumbres Consultoría y Proyectos** · Documento de alcance previo a escribir
código, mismo criterio que se usó para `roles-y-permisos.md` — evitar
construir sobre supuestos equivocados. Rama de trabajo:
`feature/pld-drive-integracion`.

> **Estado al 11/Ago/2026: Fase 2 al ~55%.** Seis pendientes quedan para
> llegar a 100% (ver `docs/CumbresBI_estado.md`). Este documento cubre los
> seis, pero prioriza el primero — **integración real con Google Drive** —
> porque es el bloqueo explícito para subir el proyecto a Cloud Run
> (decisión de Mariana, 11/Ago/2026: "no podemos subir al proyecto a cloud
> hasta que esté la conexión a Drive").

## 0. Hallazgo importante antes de empezar

Los comentarios en el código (`docint/drive.py`, `docint/views.py`) dicen
que la integración con Drive está bloqueada porque "depende del proyecto
GCP (Actividad 1, bloqueada)". Pero `docs/CumbresBI_estado.md` (Fase 0)
ya marca el proyecto GCP real (`cyp-cumbres-461220`) como resuelto desde
hace tiempo — Cloud SQL, Secret Manager y OIDC ya funcionan contra él.

**Este bloqueo de los comentarios está desactualizado.** El obstáculo real
hoy no es "no existe el proyecto GCP", es que nadie ha escrito el cliente
de Drive todavía (sección 1). Vale la pena confirmarlo para no repetir el
comentario viejo en el código nuevo.

## 1. Integración real con Google Drive

### 1.1 Qué existe hoy (todo simulado/stub)

- `docint/drive.py` — función `fetch_bytes(file_id)` que **siempre lanza
  `NotImplementedError`**. Nunca se llama desde ningún lado.
- `docint/contracts.py` — `DriveFileRef(file_id, web_view_link)` existe
  como forma de dato, pero se llena con `file_id="dev-upload"` hardcodeado
  (`docint/views.py`), nunca con un ID real de Drive.
- El botón **"Confirmar envío a Drive"** del Motor Documental
  (`MotorDocumentalDialog.tsx`) no sube nada — solo escribe una fila en la
  bitácora de auditoría (`audit-service`) diciendo que el usuario le dio
  clic. No toca Drive ni pld-service.
- Los archivos que se analizan con el Motor Documental **no se guardan en
  ningún lado** — los bytes se leen, se mandan a Gemini, y se descartan.
  Solo queda el log de la solicitud (metadata/resultado), no el archivo.
- Ni `pld-service` ni `document-intelligence-service` tienen instalada
  ninguna librería de Google (`google-api-python-client`, `google-auth`,
  `google-auth-oauthlib`) — ni siquiera para ejecutar el stub.
- El login OIDC de empleados (`iam-service`) pide el scope `openid email
  profile` — nada de Drive.
- Los modelos de PLD (`PldContraparteKyc.link_documento_pld`,
  `PldContraparteDoc.link_documento`, etc.) son `CharField` de URL
  genérica — no hay columna para `drive_file_id`, tipo MIME, tamaño ni
  checksum.

**Conclusión: hay que construir esto desde cero, no hay nada real que
extender.**

### 1.2 Decisiones ya tomadas (Mariana, 11/Ago/2026)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿De quién es el Drive? | **Workspace de Cumbres**, vía cuenta de servicio — no cuentas personales |
| 2 | ¿Método de autenticación? | **Cuenta de servicio con domain-wide delegation** — un solo secreto en Secret Manager, sin pantalla de consentimiento para nadie |
| 3 | ¿Estructura de carpetas? | `CumbresBI/PLD/<id_contraparte>/` para esta parte — **pero Drive NO es exclusivo de PLD**: también se va a usar para **contratos** (Tesorería, Fase 4) y para **subir/descargar Excels** (importación/exportación de hojas de cálculo). La carpeta raíz `CumbresBI/` debe quedar organizada por módulo desde ahora (`CumbresBI/PLD/...`, `CumbresBI/Contratos/...`, `CumbresBI/Excels/...`), no asumir que todo es PLD |
| 4 | ¿Quién sube el archivo? | **Ambos**: el analista/aprobador (sesión OIDC, `/pld`) y el cliente externo (formulario público via `PldTicketCliente`, sección 2) — mismo endpoint de subida por debajo para los dos casos |
| 5 | ¿Streaming o descarga-y-reenvío? | **Streaming Drive→Gemini directo**, como ya sugería el diagrama de `README.md` sec. 10 — más trabajo inicial, pero es lo que se decidió, no la opción simple |
| 6 | ¿Quién es dueño del cliente de Drive? | `document-intelligence-service` — ya tiene el stub (`docint/drive.py`) y ya habla con Gemini (streaming necesita que el mismo servicio orqueste ambos lados). **Importante:** dado el punto 3, este cliente de Drive debe construirse como una capacidad genérica de docint (subir/bajar/leer archivos de cualquier carpeta), no algo hardcodeado a "documentos de PLD" — Tesorería y Excels lo van a reusar |

### 1.3 Implicación de arquitectura: Drive es transversal, no exclusivo de PLD

Antes de escribir código hay que diseñar el cliente de Drive pensando en
los 3 consumidores conocidos desde ya (PLD, Contratos de Tesorería,
Excels), no solo en el caso de hoy:

- `docint/drive.py` debe exponer funciones genéricas por **ruta/carpeta**
  (ej. `upload_bytes(carpeta, nombre, contenido)`,
  `download_bytes(file_id)`, `list_files(carpeta)`), no funciones con
  nombres o lógica específica de KYC.
- El folder raíz `CumbresBI/` y sus subcarpetas por módulo se crean/
  resuelven una sola vez (¿al desplegar? ¿on-demand la primera vez que un
  módulo las necesita?) — pendiente de definir, no bloquea el trabajo de
  PLD pero sí conviene dejarlo pensado para no rehacer el cliente cuando
  le toque a Tesorería.
- El caso de Excels (subir/descargar hojas de cálculo) es lectura/
  escritura de archivos planos, no pasa por Gemini — confirma que el
  cliente de Drive de docint necesita separar claramente "leer/escribir
  bytes de Drive" (genérico, lo usan los 3 casos) de "streaming a Gemini"
  (específico de análisis de documentos, solo lo usan PLD y futuro
  Compras/facturas).

### 1.4 Trabajo técnico

- Agregar `google-api-python-client`, `google-auth` a
  `document-intelligence-service/requirements.txt`.
- **Paso manual, fuera de código — alguien con acceso de administrador al
  Workspace de Cumbres necesita:**
  1. Crear la cuenta de servicio en GCP (proyecto `cyp-cumbres-461220`).
  2. Habilitar domain-wide delegation para esa cuenta de servicio en la
     consola de administración de Google Workspace.
  3. Autorizar el scope `https://www.googleapis.com/auth/drive` (o
     `drive.file`, más acotado) para esa cuenta de servicio.
  4. Compartir/crear la carpeta raíz `CumbresBI/` en Drive con esa cuenta
     de servicio.
  5. Generar la llave JSON de la cuenta de servicio y subirla a Secret
     Manager (mismo patrón que `DOCINT_DB_PASSWORD`).
- Implementar `docint/drive.py` de verdad: `upload_bytes`/`download_bytes`/
  `list_files` genéricos + una función de streaming Drive→Gemini para el
  caso de análisis de documentos.
- Migración en `pld-service`: agregar `drive_file_id`, `mime_type`,
  `tamaño_bytes`, `subido_en` a `PldContraparteDoc` (mantener
  `link_documento` como el `web_view_link` legible, para no romper lo que
  ya lo consume).
- Endpoint nuevo en `PldContraparteDocViewSet` (o una acción) que reciba
  el archivo, lo suba a Drive vía docint, y guarde la referencia en el
  documento correspondiente — hoy no existe ningún endpoint que conecte
  "subir archivo" con "expediente KYC".
- Reemplazar el botón "Confirmar envío a Drive" (simulado, solo bitácora)
  por la subida real — la confirmación en bitácora se puede quedar como
  auditoría *adicional*, no como reemplazo de la subida real.

## 2. Formularios públicos con reCAPTCHA + Drive API

Hoy `pld-ticket/[token]/page.tsx` y `magic-link/[token]/page.tsx` **solo
validan el token y muestran una confirmación** — no existe ningún
formulario, campo de archivo, ni widget de reCAPTCHA en ningún lado del
frontend.

**Decisiones que hacen falta:**
1. ¿Qué campos lleva el formulario público? (¿solo subir documentos, o
   también datos personales del expediente KYC — nombre, CURP, etc.?)
2. reCAPTCHA v2 ("no soy un robot") o v3 (score invisible)? — `README.md`
   sec. 11.3 ya reserva un lugar para el secret key, pero no dice cuál.
3. ¿El archivo subido aquí va al mismo flujo de Drive de la sección 1, o
   es una superficie separada? (Debería ser la misma, reutilizando el
   endpoint de subida — evita construir dos veces la misma lógica.)
4. Rate limiting del lado del servidor (mencionado para Vivienda en
   `CumbresBI_estado.md` línea 129 como patrón a replicar) — ¿aplica
   igual aquí, dado que es acceso público sin cuenta?

**Depende de la sección 1** (necesita el endpoint de subida real primero).

## 3. Workflow de estados del expediente KYC

- `PldContraparteKyc.estado_llenado`: `PENDIENTE` → `INCOMPLETO` →
  `ENTREGADO` (3 estados, sin `APROBADO` a este nivel — la aprobación es
  un campo aparte, `aprobado_por`/`aprobado_en`).
- `PldContraparteDoc.status`: `PENDIENTE` → `INCOMPLETO` → `ENTREGADO` →
  `APROBADO` (4 estados, uno más que el expediente).
- Hoy el modelo/API soportan estos valores pero **nada los orquesta
  automáticamente** — cambiar de estado es manual (PATCH directo), no hay
  reglas de "cuándo pasa de PENDIENTE a ENTREGADO" (¿automático al subir
  todos los documentos requeridos? ¿manual, el analista lo marca?).

**Pregunta abierta:** ¿el estado del expediente (`estado_llenado`) debería
derivarse automáticamente del estado de sus documentos (`PldContraparteDoc.
status` de todos los documentos asociados), o seguir siendo independiente
y manual? Afecta si hace falta una señal (`post_save` o similar) que
recalcule el expediente cuando cambia un documento.

## 4. Reportes de cumplimiento PLD/AML

No existe nada construido todavía. Preguntas abiertas:
1. ¿Qué reportes exactos pide el negocio? (¿expedientes por estado,
   por sociedad, por analista, por antigüedad? ¿algún reporte regulatorio
   específico de AML en México — ej. formato de la UIF?)
2. ¿Exportable a CSV/PDF, igual que la Bitácora de Auditoría
   (`/admin/reportes`)? Mismo patrón ya construido ahí, se podría
   reutilizar el componente.

## 5. Auditoría específica del Motor Documental dentro de PLD

Hoy la bitácora general (`audit-service`) ya registra el "confirmar envío
a Drive" simulado. Falta decidir:
1. ¿Qué eventos adicionales, específicos de PLD + Motor Documental, hacen
   falta más allá de lo que ya cubre la bitácora general? (ej. "documento
   clasificado automáticamente como X con Y% de confianza", "extracción
   de datos falló", etc.)
2. ¿Vive en `audit-service` (bitácora general) o en un log propio de
   `pld-service`?

## 6. Módulo Contrapartes (catálogo propio)

`pld_contrapartes_kyc.id_contraparte` ya referencia un "dueño real:
`contrapartes-service`" en un comentario del modelo, pero ese servicio no
existe. Hoy es un `CharField` libre, sin catálogo ni validación.

**Preguntas abiertas:**
1. ¿Contrapartes es un servicio nuevo aparte (como sugiere el comentario),
   o un módulo dentro de `pld-service`?
2. ¿Qué datos lleva una contraparte más allá del `id_contraparte` que ya
   se usa? (¿nombre, tipo de persona física/moral, RFC/CURP, contacto?)
3. ¿Se comparte entre PLD y el futuro `tesoreria_contrapartes` de Fase 4
   (`CumbresBI_estado.md` línea 132 ya anota esta reconciliación pendiente)
   o son catálogos independientes?

Es el pendiente más grande y menos definido de los seis — probablemente
merece su propio documento de alcance cuando le toque el turno, en vez de
resolverse aquí de pasada.

## Orden sugerido de trabajo

1. **Confirmar las 6 decisiones de la sección 1.2** (con Mariana/cliente)
   — nada de código hasta tener esto.
2. Integración real de Drive (sección 1) — desbloquea el deploy.
3. Workflow de estados (sección 3) — es barato una vez que ya hay
   documentos reales fluyendo por Drive.
4. Formularios públicos (sección 2) — reutiliza el endpoint de subida de
   la sección 1.
5. Auditoría específica (sección 5) y Reportes (sección 4) — encima de lo
   anterior, relativamente mecánico.
6. Módulo Contrapartes (sección 6) — el más grande, se separa a su propio
   documento de alcance cuando le toque.

## Preguntas abiertas para el cliente (resumen, todas las secciones)

1. Drive: ¿cuenta de servicio o Workspace delegado? ¿Estructura de
   carpetas?
2. Formulario público: ¿qué campos lleva, más allá de subir documentos?
3. Workflow: ¿el estado del expediente se deriva automático de sus
   documentos, o sigue siendo manual?
4. Reportes: ¿cuáles exactamente pide el negocio (¿formato UIF)?
5. Contrapartes: ¿servicio nuevo o módulo dentro de pld-service?
   ¿Comparte catálogo con Tesorería (Fase 4)?
