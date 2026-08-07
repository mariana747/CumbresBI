# audit-service — Cloud SQL + Secret Manager

**Cumbres Consultoría y Proyectos** · Infraestructura GCP, proyecto `cyp-cumbres-461220`

## Cuenta de servicio

`audit-service@cyp-cumbres-461220.iam.gserviceaccount.com` — creada el 2026-08-07, descripción "Cuenta
de servicio de audit-service - acceso solo a AUDIT-DB-PASSWORD". No se le agregaron principales con
acceso adicionales (no hay ningún caso hoy que requiera que una persona impersone esta cuenta para
pruebas locales).

## Código

El patrón `AUDIT_DB_SOCKET_DIR` (conexión a Cloud SQL vía Auth Proxy/socket Unix) se implementó en
`services/audit-service/config/settings.py` — rama
`feature/docint-cloud-sql-socket-v2-audit-service`, replicando el mismo patrón ya usado en
`document-intelligence-service`.

## Cloud SQL

El usuario de BD `audit_app` se creó en la instancia `db-cypcumbres` y se acotó a la base
`cumbresbi_audit_service` — ver el detalle de bases/privilegios en [`cloud-sql.md`](cloud-sql.md).

## Secret Manager

Con la contraseña real de `audit_app` ya confirmada en Cloud SQL, se creó el secreto
`AUDIT_DB_PASSWORD` (tipo "Otras credenciales de bases de datos") y se otorgó el rol "Usuario con
acceso a secreto" sobre ese secreto a `audit-service@cyp-cumbres-461220.iam.gserviceaccount.com`
únicamente.

## Pendiente

Verificar en Docker local que `migrate` corre sin errores contra la conexión por socket antes de dar por
cerrado el soporte de Cloud SQL Auth Proxy para este servicio.
