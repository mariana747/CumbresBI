# Infraestructura GCP (proyecto `cyp-cumbres-461220`)

Documentación de la infraestructura real de GCP para CumbresBI: Cloud SQL y Secret Manager (Tarea 1
"Dar de alta GCP + Cloud SQL" y Tarea 2 "Configurar Secret Manager" del correo original). Un archivo
por servicio/tema, para que cada sub-rama de código documente solo lo suyo sin pisar el trabajo de las
demás.

- [cloud-sql.md](cloud-sql.md) — decisión de reusar la instancia existente, convención de nombres,
  bases y usuarios creados, reglas de seguridad para no afectar el sistema en producción.
- [document-intelligence-service.md](document-intelligence-service.md) — cuenta de servicio, base de
  datos y secretos de `document-intelligence-service`.
- [audit-service.md](audit-service.md) — cuenta de servicio, base de datos y secretos de
  `audit-service`.
- [iam-service.md](iam-service.md) — cuenta de servicio de `iam-service`, la nota sobre la cuenta
  duplicada `iam-service@...` vs `iam-service-956@...`, y el flujo OIDC ya implementado.
- [oidc-login.md](oidc-login.md) — registro de la app OIDC en Google Workspace, cliente OAuth y
  secretos de credenciales.
- [mail-service.md](mail-service.md) — cuenta de servicio de `mail-service`, domain-wide delegation de
  Gmail API (resuelta 14/Ago/2026) y el secreto `GMAIL_SERVICE_ACCOUNT_JSON`.
