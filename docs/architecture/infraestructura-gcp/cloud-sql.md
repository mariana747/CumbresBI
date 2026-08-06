# Cloud SQL / bases de datos

- [x] Proyecto GCP (`CYP Cumbres`) dado de alta
- [x] **CORRECCIÓN (2026-08-06):** se había asumido que la instancia Cloud SQL ya estaba montada para
      CumbresBI. La única instancia que existe en el proyecto es la del sistema actual en producción
      (el que se está reemplazando, ver `docs/CumbresBI_estado.md`).
- [x] **Decisión de costo (2026-08-06):** NO se crea una instancia nueva (hubiera costado ~$10-40
      USD/mes aparte). Se usa la **misma instancia existente**, agregando bases de datos nuevas y
      separadas dentro de ella para `iam-service`, `audit-service` y `document-intelligence-service`.
      Esto comparte cómputo/IO con el sistema en producción — si CumbresBI genera carga pesada podría
      impactar el otro sistema; monitorear si esto se vuelve un problema más adelante.
- [ ] Crear, dentro de la instancia existente, las 3 bases de datos nuevas (una por servicio: revisar
      `*_DB_NAME` en cada `settings.py` para el nombre exacto esperado, ej. `iam_service`,
      `audit_service`, `docint_service`)
- [ ] Crear ahí los usuarios de BD de `iam-service`, `audit-service` y `document-intelligence-service`,
      cada uno con permisos SOLO sobre su propia base (no acceso a las bases del sistema en producción)
- [ ] Confirmar que también existe una base separada para datos de prueba, distinta de la base real de
      cada servicio (misma instancia, bases distintas — no una copia completa)
