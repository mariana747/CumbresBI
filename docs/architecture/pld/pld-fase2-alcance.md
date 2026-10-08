# CumbresBI — Alcance para cerrar Fase 2 (PLD / Cumplimiento) 

**Cumbres Consultoría y Proyectos** · Documento de alcance previo a escribir
código, mismo criterio que se usó para `roles-y-permisos.md` — evitar
construir sobre supuestos equivocados. Rama de trabajo:
`feature/pld-drive-integracion`.

> **Estado al 08/Oct/2026: Fase 2 completa (secciones 1–3 y 5–6 cerradas).** Las seis pendientes originales quedaron resueltas. Lo que sigue abierto es backlog regulatorio nuevo (monitoreo transaccional, UIF, validación externa KYC) — ver `pendiente.md` sección PLD.

## 0. Hallazgo importante antes de empezar

Los comentarios en el código (`docint/drive.py`, `docint/views.py`) dicen
que la integración con Drive está bloqueada porque "depende del proyecto
GCP (Actividad 1, bloqueada)". Pero `Estado del proyecto` (Fase 0)
ya marca el proyecto GCP real (`cyp-cumbres-461220`) como resuelto desde
hace tiempo — Cloud SQL, Secret Manager y OIDC ya funcionan contra él.

**Este bloqueo de los comentarios está desactualizado.** El obstáculo real
hoy no es "no existe el proyecto GCP", es que nadie ha escrito el cliente
de Drive todavía (sección 1). Vale la pena confirmarlo para no repetir el
comentario viejo en el código nuevo.

## 1. Integración real con Google Drive

### ✅ RESUELTO (ago–sep/2026)

Drive real funciona con domain-wide delegation. `docint/drive.py` implementado (`upload_bytes`/`download_bytes`/`list_files`). Subida real de documentos en `PldContraparteDocViewSet` (acción `subir`). `PldContraparteDoc` tiene `drive_file_id`, `mime_type`, `tamano_bytes`. Formularios públicos (`PldTicketCliente`) suben a Drive con reCAPTCHA v2. Carpeta `PLD/Nuevos Clientes/<id_contraparte>/` sin subcarpeta por tipo (decisión 07/Sep/2026).

### 1.1 Qué existía antes (todo simulado/stub — referencia histórica)

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

### 1.2 Decisiones ya tomadas ( 11/Ago/2026)

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

## 2. Formularios públicos con reCAPTCHA + Drive API ✅ RESUELTO (sep/2026)

`pld-ticket/[token]/page.tsx`: formulario completo — subida de documentos y edición de datos KYC (`actualizar_datos`). reCAPTCHA v2. Subida real a Drive vía `docint`. Rate limiting no implementado (se dejó pendiente, no bloqueó). `PldTicketClienteViewSet.subir_documento` y `actualizar_datos` son los endpoints públicos; no consumen `uses_count` al subir (solo al validar el link).

## 3. Workflow de estados del expediente KYC ✅ RESUELTO (ago/2026)

Patrón híbrido implementado para `estado_llenado` y `categoria_cumplimiento`:
- Se recalculan automáticamente en `post_save` de `PldContraparteDoc` y en `save()` del KYC.
- Un PATCH manual prende el flag `*_manual`; a partir de ahí el recálculo se suspende hasta que el analista use `reactivar_auto_estado` / `reactivar_auto_categoria`.
- `grado_riesgo` usa el mismo patrón desde oct/2026 (scoring EBR + `grado_riesgo_manual` + acción `evaluar_riesgo`).

Estados vigentes: `PENDIENTE → INCOMPLETO → ENTREGADO` (expediente); `PENDIENTE → INCOMPLETO → ENTREGADO → APROBADO` (documento). 18 tests cubren el workflow.

## 4. Reportes de cumplimiento PLD/AML ⚠️ PARCIAL

Bitácora de auditoría (`/admin/reportes`) cubre los eventos de PLD vía `audit-service`. Tab "Historial de auditoría" en el expediente (tab 4) con filtros Desde/Hasta/Acción/búsqueda. Exportar a CSV/PDF específico de PLD: sin construir. Reporte regulatorio UIF: sin construir (ver `pendiente.md`).

## 5. Auditoría específica del Motor Documental dentro de PLD ✅ RESUELTO (ago–oct/2026)

Todos los eventos clave emiten a `audit-service` (bitácora general, sin tabla propia en `pld-service`):

| Acción | Cuándo |
|---|---|
| `pld_contrapartes_kyc.confirmar_extraccion` | Al confirmar campos extraídos por IA |
| `pld_contrapartes_kyc.editar` | PATCH de campos del expediente |
| `pld_contrapartes_kyc.evaluar_riesgo` | Al guardar grado de riesgo (manual o recalculado) |
| `pld_contrapartes_docs.subir` | Subida de documento (actor "externo" si es ticket público) |
| `pld_contrapartes_docs.eliminar_por_solicitud` | Al aprobar solicitud de eliminación |
| `pld_solicitudes_eliminacion_doc.solicitar` | Al crear solicitud de eliminación |
| `pld_solicitudes_eliminacion_doc.rechazar` | Al rechazar solicitud de eliminación |

Filtro `?accion=` exacto añadido a `audit-service` para que el tab 4 del expediente filtre por tipo de evento.

## 6. Módulo Contrapartes (catálogo propio) ✅ RESUELTO (sep/2026)

`id_contraparte` se reconcilió con `tesoreria-service` (no se creó un servicio aparte). Flujo:
- **Alta con `id_contraparte` existente:** PLD valida contra `tesoreria-service` y toma el `id_contraparte` sobreviviente (en caso de fusión).
- **Alta autónoma (sin id):** `_crear_contraparte_minima_en_tesoreria` crea la contraparte en Tesorería y usa su id real; si `TESORERIA_INTERNAL_SECRET` está vacío o el servicio está caído, cae al id local (fail-open).
- `nombre_completo` se llena desde los datos de Tesorería al crear (persona física = nombre+apellidos, moral = razón social; se descarta el placeholder "Pendiente de completar (alta autónoma PLD)").
- `sociedad_rfc` obligatorio; se valida contra `iam-service` y guarda `sociedad_nombre` como snapshot de solo lectura.

## Estado al 08/Oct/2026

| Sección | Estado |
|---|---|
| 1. Drive | ✅ Resuelto |
| 2. Formularios públicos + reCAPTCHA | ✅ Resuelto |
| 3. Workflow de estados | ✅ Resuelto |
| 4. Reportes AML/UIF | ⚠️ Parcial (bitácora general sí, reporte regulatorio no) |
| 5. Auditoría Motor Documental | ✅ Resuelto |
| 6. Módulo Contrapartes | ✅ Resuelto |
| Evaluación de riesgo EBR | ✅ Nuevo — oct/2026 (`grado_riesgo`, `evaluar_riesgo`, migración 0026) |

## Backlog regulatorio abierto — análisis de brechas (06/Oct/2026)

Fuera del alcance original de Fase 2. Ver `pendiente.md` sección PLD.

### 1. Validación en listas — NO construido

La norma exige cruzar PEP, listas vinculadas y REFIPRES/jurisdicciones antes de iniciar la relación comercial. Hoy `es_pep` es un boolean manual que llena el analista. No hay integración con ninguna lista ni proveedor externo.

### 2. Identificación e integración de expedientes — Parcial

Campos de identidad y documentos por categoría: ✅. Lo que falta:
- Cuestionario KYC estructurado (preguntas/respuestas en BD, no PDF a subir)
- Cuestionario Beneficiario Controlador estructurado — `PldRepresentanteLegal` tiene los campos del representante pero no el formato de cuestionario que exige la norma como documento estructurado separado

### 3. Perfil transaccional y matriz de riesgo — Parcial

| Requisito | Estado |
|---|---|
| Clasificación BAJO/MEDIO/ALTO automática | ✅ Construido (scoring por atributos) |
| Perfil operativo inicial | ✅ Construido |
| Monitoreo/seguimiento continuo | ❌ NO construido |
| Histórico de cambios en `grado_riesgo` (10 años) | ❌ NO — no hay tabla de historial |
| Metodología formal de evaluación de riesgos | ❌ NO — scoring actual es heurístico simple |

### 4. Alertas, avisos y acumulación — TODO sin construir

| Requisito | Estado |
|---|---|
| Alertas por umbrales de aviso | ❌ NO |
| Acumulación 6 meses por cliente | ❌ NO |
| Monitoreo de operaciones fuera de perfil | ❌ NO |
| Monitoreo de efectivo / metales preciosos | ❌ NO |
| Alertas automáticas por alto riesgo / PEP / jurisdicción | ❌ NO |
| Generación de Avisos (general + 24h) | ❌ NO |
| Evidencia de presentación de avisos | ❌ NO |
| Control de vencimientos de documentos | ✅ Construido (manual) |

### Conclusión

Lo construido cubre bien el **expediente digital** (KYC/KYB, documentos, Drive, auditoría, magic link). El scoring de riesgo existe pero es básico y heurístico.

La mitad del documento regulatorio — transacciones reales, acumulación, alertas automáticas y avisos a la UIF — requiere construirse desde cero, y probablemente un **proveedor externo KYC/AML** para las listas (PEP/OFAC/REFIPRES).
