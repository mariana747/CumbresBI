# iam-service — Cloud SQL + Secret Manager

**Cumbres Consultoría y Proyectos** · Infraestructura GCP, proyecto `cyp-cumbres-461220`

## Cuenta de servicio

`iam-service-956@cyp-cumbres-461220.iam.gserviceaccount.com` — descripción "Cuenta de servicio de
iam-service - acceso solo a IAM-DB-PASSWORD". Es la cuenta correcta a usar para este proyecto.

**Nota sobre la duplicidad de nombre:** existe también `iam-service@cyp-cumbres-461220.iam.gserviceaccount.com`
(sin sufijo, sin descripción). Confirmado con Mariana: esa cuenta **no se borra**, es necesaria para
otra parte del negocio ajena a CumbresBI. Cualquier secreto de este proyecto (`IAM_DB_PASSWORD`,
`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`) se otorga únicamente a `iam-service-956@...`, nunca a
`iam-service@...`.

## Código

El patrón `IAM_DB_SOCKET_DIR` (conexión a Cloud SQL vía Auth Proxy/socket Unix) ya está implementado en
`services/iam-service/config/settings.py`.

## Cloud SQL

`iam-service` es trabajo de Fase 1, no de Fase 0 — su base (`cumbresbi_iam_service`) y su usuario de BD
todavía no se crean en la instancia `db-cypcumbres`. Se crean formalmente cuando arranque esa fase; el
código ya está listo para consumirlos en cuanto existan. Ver [`cloud-sql.md`](cloud-sql.md).

## Secret Manager

Pendiente hasta que exista la contraseña real del usuario de BD de `iam-service` (Fase 1): crear el
secreto `IAM_DB_PASSWORD` y otorgar el rol "Usuario con acceso a secreto" únicamente a
`iam-service-956@...`.

Los secretos de OIDC (`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`) sí se crearon en Fase 0 — ver
[`oidc-login.md`](oidc-login.md) — con acceso otorgado también a `iam-service-956@...`, aunque el
código que los consuma (flujo Authorization Code + PKCE) sigue pendiente para Fase 1.
