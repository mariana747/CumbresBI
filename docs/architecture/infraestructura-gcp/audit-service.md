# audit-service — Cloud SQL + Secret Manager

- [ ] Crear cuenta de servicio `audit-service@cyp-cumbres-461220.iam.gserviceaccount.com`
      (descripción: "Cuenta de servicio de audit-service - acceso solo a AUDIT-DB-PASSWORD")
- [ ] Crear/confirmar contraseña del usuario de BD de `audit-service` en Cloud SQL (pestaña Usuarios)
- [ ] Crear secreto `AUDIT_DB_PASSWORD` en Secret Manager con esa contraseña
- [ ] Otorgar rol "Secret Manager Secret Accessor" sobre `AUDIT_DB_PASSWORD` a `audit-service@...`
- [ ] Código: aplicar patrón `AUDIT_DB_SOCKET_DIR` en `services/audit-service/config/settings.py`
      (rama `feature/docint-cloud-sql-socket-v2-audit-service`)
- [ ] Verificado en Docker local: `migrate` sin errores
