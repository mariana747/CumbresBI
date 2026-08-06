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

- [x] Revisar la lista actual de bases y usuarios de la instancia `db-cypcumbres` (MySQL 8.4): ya
      existían `administracion` (sistema en producción, no tocar) y `cumbresbi-dev` (base de prueba
      inicial, vacía — nunca se pudo usar por permisos, se reemplaza por `cumbresbi_test`)
- [x] **Decisión de alcance (2026-08-06):** para cerrar Fase 0 (ver `docs/CumbresBI_estado.md`) solo se
      necesitan las bases de `document-intelligence-service` (Motor Documental) y `audit-service`
      (tabla de auditoría). `iam-service` es Fase 1 — su base se crea cuando arranque esa fase
      formalmente, aunque su código ya está listo.
- [x] **Convención de nombres (2026-08-06):** todas las bases de CumbresBI llevan el prefijo
      `cumbresbi_` para no confundirlas con `administracion` (producción): `cumbresbi_docint_service`,
      `cumbresbi_audit_service`, `cumbresbi_test` (datos de prueba). Como el nombre de base es
      configurable por variable de entorno (`DOCINT_DB_NAME`, `AUDIT_DB_NAME`), no hace falta tocar
      código — solo definir esas env vars con el nombre prefijado en vez de dejar el default.
- [ ] Borrar `cumbresbi-dev` (confirmado vacía) y crear `cumbresbi_test` en su lugar
- [ ] Crear base de datos `cumbresbi_docint_service` (charset `utf8mb4`) — configurar
      `DOCINT_DB_NAME=cumbresbi_docint_service` (el default en
      `services/document-intelligence-service/config/settings.py:89` es solo para Docker local)
- [ ] Crear base de datos `cumbresbi_audit_service` (charset `utf8mb4`) — configurar
      `AUDIT_DB_NAME=cumbresbi_audit_service` (el default en
      `services/audit-service/config/settings.py:71` es solo para Docker local)
- [ ] Crear usuario de BD para `document-intelligence-service`, con `GRANT` SOLO sobre
      `cumbresbi_docint_service` (verificar con `SHOW GRANTS` después de crear)
- [ ] Crear usuario de BD para `audit-service`, con `GRANT` SOLO sobre `cumbresbi_audit_service`
      (verificar con `SHOW GRANTS` después de crear)
- [ ] Pendiente para cuando arranque Fase 1: crear base `cumbresbi_iam_service` + su usuario
