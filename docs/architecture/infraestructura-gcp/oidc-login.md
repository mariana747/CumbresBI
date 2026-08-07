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

## Pendiente

`iam-service` todavía no lee `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` desde Secret Manager ni implementa el
flujo Authorization Code + PKCE — el login interno sigue siendo una sesión simulada en localStorage
(`docs/CumbresBI_estado.md`, Fase 1). Ese código, junto con el ajuste de producto ya confirmado de que
el login sea **SSO silencioso sin botón intermedio** para usuarios internos, queda para cuando arranque
formalmente la Fase 1.

## Drive (relacionado, en pausa)

La integración de `document-intelligence-service` con Google Drive API debe usar esa misma cuenta de
Workspace de Cumbres (no un Drive personal) — en pausa, no urgente hasta Fase 2.
