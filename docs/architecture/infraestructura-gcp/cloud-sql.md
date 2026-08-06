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
## ⚠️ Reglas de seguridad — no afectar el sistema en producción

Esta instancia sigue sirviendo al sistema actual en producción. Antes de cualquier acción aquí:

- **Solo `CREATE DATABASE` con nombre nuevo.** Nunca modificar, renombrar ni borrar las bases
  existentes (`iam_*`, `tesoreria_*`, `vivienda_*`, `rrhh_*`, `pld_*`, etc. del sistema actual).
- **Usuarios nuevos con permisos acotados por base**, nunca `GRANT ALL ON *.*`. Cada usuario de
  CumbresBI debe poder leer/escribir SOLO su propia base nueva.
- **No cambiar configuración de la instancia** (tamaño de máquina, versión, flags, reinicios) — eso sí
  causaría downtime al sistema en producción.
- Antes de crear cada base/usuario, revisar la lista de bases y usuarios existentes en la instancia
  para confirmar que el nombre nuevo no choca con nada ya usado.

## Checklist

- [ ] Revisar la lista actual de bases y usuarios de la instancia (captura o anotación aquí) antes de
      crear nada nuevo
- [ ] Crear, dentro de la instancia existente, las 3 bases de datos nuevas (una por servicio: revisar
      `*_DB_NAME` en cada `settings.py` para el nombre exacto esperado, ej. `iam_service`,
      `audit_service`, `docint_service`)
- [ ] Crear ahí los usuarios de BD de `iam-service`, `audit-service` y `document-intelligence-service`,
      cada uno con `GRANT` SOLO sobre su propia base nueva (verificar con `SHOW GRANTS` después de
      crear cada usuario)
- [ ] Confirmar que también existe una base separada para datos de prueba, distinta de la base real de
      cada servicio (misma instancia, bases distintas — no una copia completa)
