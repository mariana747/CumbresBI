# iam-service — Cloud SQL + Secret Manager

- [x] Cuenta de servicio `iam-service-956@cyp-cumbres-461220.iam.gserviceaccount.com` creada
- [x] Código: patrón `IAM_DB_SOCKET_DIR` ya implementado en `services/iam-service/config/settings.py`
- [ ] Crear/confirmar contraseña real del usuario de BD de `iam-service` en Cloud SQL
- [ ] Crear secreto `IAM_DB_PASSWORD` en Secret Manager
- [ ] Otorgar rol "Secret Manager Secret Accessor" sobre `IAM_DB_PASSWORD` únicamente a
      `iam-service-956@...` (NO a `iam-service@...`, que es de otro uso del negocio, no de este proyecto)
