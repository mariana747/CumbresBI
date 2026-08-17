# OIDC / login — registro de la app en Google Workspace

**Cumbres Consultoría y Proyectos** · Infraestructura GCP, proyecto `cyp-cumbres-461220`

> Actividad de la Fase 0, Semana 1: "Registro de la aplicación OIDC en Google Workspace para
> autenticación interna sin contraseñas." Este documento cubre el *registro* de la app — el código que
> consume estas credenciales (flujo Authorization Code + PKCE, ver README.md sección 6.1) es trabajo de
> Fase 1 sobre `iam-service`.

## Bloqueos de permisos resueltos en el camino

Para llegar a crear el cliente OAuth se necesitaron dos roles de IAM que Mariana no tenía por default:

- Acceso a **APIs y servicios → Credenciales / Google Auth Platform** en la consola.
- El rol **"Editor de configuración de OAuth"** (`roles/oauthconfig.editor`), sin el cual la consola
  bloquea la creación del cliente con el permiso faltante `clientauthconfig.brands.update`. Se
  solicitó y aprobó (mismo patrón que el acceso `root` de Cloud SQL: alguien con más privilegio en el
  proyecto, en este caso Arturo, lo otorgó).

## Pantalla de consentimiento de OAuth

Tipo de usuario: **Interno**. Esto restringe el login a cuentas del Workspace de Cumbres directamente
por configuración de Google — no hace falta validar el dominio (`hd=`) a mano en el código, como sí
sería necesario si el tipo fuera "Externo".

## Cliente OAuth creado

Cliente de tipo **"Aplicación web"**, nombre `iam-service-oidc` (creado 2026-08-07):

- **Orígenes autorizados de JavaScript:** `http://localhost:3000` (Next.js en desarrollo local).
- **URI de redireccionamiento autorizado:** `http://localhost:8000/auth/google/callback` (puerto de
  `iam-service` en `docker-compose.yml`, según el callback ya definido en el diagrama de flujo OIDC de
  README.md sección 6.1).

Falta agregar los orígenes/URIs reales de staging y producción cuando se defina el dominio productivo
(`app.<dominio>` / `api.<dominio>` — ver README.md, "Supuestos y puntos abiertos").

## Secret Manager

El "ID de cliente" y el "Secreto del cliente" que generó Google al crear el cliente OAuth se subieron
como dos secretos nuevos, tipo "Clave de acceso":

- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`

Ambos con acceso otorgado únicamente a `iam-service-956@cyp-cumbres-461220.iam.gserviceaccount.com` (la
cuenta correcta para este proyecto — ver la nota sobre la cuenta duplicada `iam-service@...` en
[`iam-service.md`](iam-service.md)).

## Estado del código (actualizado)

El flujo Authorization Code + PKCE ya está implementado en `iam-service` (`auth_views.py`:
`google_start`/`google_callback`/`_upsert_identity`), con SSO silencioso sin botón intermedio para
usuarios internos (`google_start` salta directo a Google, sin pantalla propia — ver README.md sec. 6.1).

Gate adicional sobre `IamUser.status` (14/Ago/2026): `google_callback` rechaza el login
(`redirect ?error=cuenta_suspendida`) si el usuario existente no está `ACTIVE` (`SUSPENDED`/`DELETED`),
además del gate de invitación formal ya documentado (`?error=sin_invitacion` si no hay `IamUser` ni
`IamInvitation` pendiente). Ver README.md sec. 6 para el diagrama completo y los tres mecanismos de
acceso (OIDC interno, Magic Link, colaborador externo `IamExternalCollaborator`).

## Drive y Gmail (misma cuenta de Workspace)

Tanto `document-intelligence-service`/`drive-service` (Google Drive API) como `mail-service` (Gmail API,
envío real de Magic Links/accesos externos/avisos de invitación) usan cuentas de servicio con
domain-wide delegation sobre este mismo Workspace de Cumbres (`cypcumbres.mx`), no un Drive/correo
personal. Drive ya corre en modo real (confirmado 13/Ago/2026); Gmail se autorizó el 14/Ago/2026 (scope
`gmail.send`, client ID `100894706899601697748`) — ver [`iam-service.md`](iam-service.md).
