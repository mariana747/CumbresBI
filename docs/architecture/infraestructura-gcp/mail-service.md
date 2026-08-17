# mail-service — Gmail API + Secret Manager

**Cumbres Consultoría y Proyectos** · Infraestructura GCP, proyecto `cyp-cumbres-461220`

## Qué hace

Único microservicio del proyecto con permiso para mandar correo real (mismo criterio que
`drive-service` para Google Drive: una sola cuenta de servicio con la credencial real, todo lo demás le
pide el envío vía HTTP a `POST /api/send/?perm=<perm_key>`). Consumido por `iam-service` (Magic Links,
acceso de colaborador externo, aviso de invitación Workspace — ver `iam/mail_utils.py`) y por
`pld-service` (tickets de cliente).

Gateado por `cumbresbi_scope`: el llamador debe reenviar el JWT/cookie de sesión de quien generó el
link/ticket (no una credencial de servicio propia), así el permiso exacto (`iam.crear`,
`pld-compliance.crear`) lo sigue decidiendo `mail-service`, no "cualquiera que le hable a este servicio
puede mandar correo a nombre de Cumbres".

## Cuenta de servicio

`mail-service@cyp-cumbres-461220.iam.gserviceaccount.com` — Client ID `100894706899601697748`. Sin rol
de IAM a nivel proyecto (correcto, no lo necesita — solo domain-wide delegation, ver abajo).

## Domain-wide delegation (RESUELTO 14/Ago/2026)

Autorizado en el Admin Console de **`cypcumbres.mx`** (la organización correcta — ver la nota sobre las
dos organizaciones de Workspace en `README.md` de este mismo directorio y en la memoria de sesión
"drive-dos-organizaciones-workspace"; autorizar en `.com` por error no funciona):

- Seguridad → Control de acceso a la API → Delegación en todo el dominio
- Client ID: `100894706899601697748`
- Alcance OAuth: `https://www.googleapis.com/auth/gmail.send` (solo envío, no lectura)

Antes de esto, `mail-service` corría en **modo simulado** (`GMAIL_SERVICE_ACCOUNT_JSON` vacío —
`gmailclient._modo_real()` regresa `False` — el correo solo se registraba en el log, nunca se mandaba de
verdad). Confirmado con un envío real de prueba (`message_id` real de Gmail API) el mismo día que se
autorizó la delegación.

## Secret Manager

- `GMAIL_SERVICE_ACCOUNT_JSON` — la clave JSON completa de la cuenta de servicio. Subido a Secret
  Manager con rol "Secret Manager Secret Accessor" otorgado a
  `mail-service@cyp-cumbres-461220.iam.gserviceaccount.com`.
- `GMAIL_SENDER_SUBJECT` — `mariana@cypcumbres.mx`. Una cuenta de servicio no tiene bandeja propia; este
  valor es a quién "impersona" (`credentials.with_subject(...)`) y por lo tanto quien aparece como
  remitente real para quien recibe el correo.

## Código

`services/mail-service/mail/gmailclient.py` — `send_email(to, subject, html_body)` regresa
`{"message_id": ...}` (real o `"sim-no-enviado"` en modo simulado). Import perezoso de
`google-api-python-client`/`google-auth` (solo hacen falta en modo real, no en pruebas unitarias). Todos
los tres correos que arma `iam-service` (`iam/mail_utils.py`, plantilla compartida
`_renderizar_correo()`, marca CumbresBI: azul `#1C75BC`, charcoal `#343741`) llegan aquí sin cambios en
la interfaz — el modo simulado/real es transparente para quien llama.
