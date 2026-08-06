# document-intelligence-service — Cloud SQL + Secret Manager

- [x] Cuenta de servicio `document-intelligence-service@cyp-cumbres-461220.iam.gserviceaccount.com`
      creada (descripción: "Acceso a Gemini y Drive")
- [x] Secreto `GEMINI_API_KEY` creado, con acceso otorgado
- [x] Código: patrón `DOCINT_DB_SOCKET_DIR` ya implementado en
      `services/document-intelligence-service/config/settings.py`
- [ ] Crear/confirmar contraseña real del usuario de BD de `document-intelligence-service` en Cloud SQL
- [ ] Crear secreto `DOCINT_DB_PASSWORD` en Secret Manager
- [ ] Otorgar rol "Secret Manager Secret Accessor" sobre `DOCINT_DB_PASSWORD` a
      `document-intelligence-service@...`
