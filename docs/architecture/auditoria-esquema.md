# CumbresBI — Auditoría del Esquema Heredado

**Cumbres Consultoría y Proyectos** · Fase 0, Semana 2, Actividad "Auditoría completa del esquema actual"

> **Fuente:** [`schema.csv`](../../schema.csv), [`fk_relationships.csv`](../../fk_relationships.csv) y [`20260727_Cumbres_ERD.sql`](../../20260727_Cumbres_ERD.sql) — 49 tablas del esquema heredado de AppSheet. Metodología: se cargó el DDL completo en MySQL local (idéntico estructuralmente a Cloud SQL) y se corrió `inspectdb` + inspección manual columna por columna sobre las 49 tablas.

## 1. Cero llaves foráneas declaradas a nivel de motor de base de datos

Ninguna de las 49 tablas tiene una restricción `FOREIGN KEY` real en el DDL (`grep -c "FOREIGN KEY" *.sql` → 0). Las 110 relaciones documentadas en `fk_relationships.csv` son **documentales, no aplicadas por MySQL** — el motor nunca ha rechazado un `INSERT`/`UPDATE` por violar una de estas relaciones.

**Impacto:** es consistente con la regla de refactorización ya documentada ("declarar llaves foráneas explícitas... mapear con inspectdb y fijar `managed = False`"), pero confirma que la integridad referencial hoy depende 100% de la aplicación — nunca ha sido garantizada por la base de datos. No se recomienda agregar las 110 constraints reales de golpe (alto riesgo de romper datos existentes con inconsistencias ya presentes); se recomienda declararlas como `ForeignKey(..., db_constraint=False)` en Django donde el modelo lo amerite, documentando la relación sin forzarla a nivel de motor todavía.

## 2. FKs cruzadas entre servicios — ya no son una sola base, son 13 procesos separados

De las 110 relaciones en `fk_relationships.csv`, la gran mayoría cruzan lo que hoy son fronteras de microservicio distintas. Las más relevantes:

| Relación | De servicio | A servicio | Nota |
|---|---|---|---|
| `*.created_by` / `*.updated_by` → `iam_users.user_id` | Los 13 servicios | `iam-service` | **Patrón repetido en ~40 columnas** de las 49 tablas — todo el sistema referencia `iam_users` para auditoría de quién creó/modificó un registro. |
| `iam_user_contrato_access.id_contrato` → `tesoreria_contratos.id_contrato` | `iam-service` | `compras-tesoreria-service` | El otorgamiento de acceso por CONTRATO vive en IAM pero apunta a una tabla de otro servicio. |
| `iam_users.employee_id` → `rrhh_empleados.id_empleado` | `iam-service` | `rrhh-service` | Vínculo login↔expediente de empleado (necesario para el alcance IDENTIDAD de `EMPLEADO_SELF`, ver `roles-y-permisos.md`). |
| `pld_contrapartes_kyc.id_contraparte` → `tesoreria_contrapartes.id_contraparte` | `pld-compliance-service` | `contrapartes-service` | Ya documentado como dependencia diferida (contraparte maestra, Fase 4). |
| `rrhh_puestos.sociedad` → `general_sociedades.rfc` | `rrhh-service` | `iam-service` | `general_sociedades` vive en `iam-service` por diseño. |
| `tesoreria_flujos.id_empleado` → `rrhh_empleados.id_empleado` | `compras-tesoreria-service` | `rrhh-service` | Reembolsos de flujo referencian al empleado. |
| `vivienda_ventas_expedientes.id_contrato` → `tesoreria_contratos.id_contrato` | `ventas-vivienda-service` | `compras-tesoreria-service` | Ya cubierto por el patrón de saga documentado en la arquitectura. |

**Impacto:** ninguna de estas relaciones puede volver a ser una constraint real de MySQL bajo el diseño de microservicios (ni siquiera con la revisión v2.1 de base de datos única, porque el aislamiento ahora es de aplicación, no de esquema — un `ForeignKey` de Django solo puede apuntar a un modelo dentro de la misma app/servicio). Quedan como responsabilidad exclusiva de: (a) validación en el backend al escribir, y (b) reconciliación eventual vía eventos donde ya está documentada (contraparte maestra, sagas Tesorería↔Ventas/Rentas).

## 3. Columnas de auditoría faltantes — ya corregido

3 de las 49 tablas no traían `created_at`/`created_by`/`updated_at`/`updated_by` en el DDL heredado (todas las demás sí, desde AppSheet):

- `tesoreria_cuentas`
- `tesoreria_bancos`
- `tesoreria_saldos`

**Estado:** corregido vía migración versionada (`compras_tesoreria/migrations/0002_add_columnas_auditoria.py`, rama `feature/modelos-servicios-restantes`) — `AddField` autogenerado por `makemigrations` (reversible por default, Django genera el `ALTER TABLE` en ambas direcciones). Verificado contra MySQL real en contenedor: `migrate` aplicó la migración sobre la tabla ya existente y `DESCRIBE tesoreria_bancos` confirma las 4 columnas nuevas.

## 4. Inconsistencia de tipo en `created_by` / `updated_by`

`iam_users.user_id` (el valor que estas columnas deberían contener) es `char(8)`. Pero el tipo declarado de `created_by`/`updated_by` varía entre tablas sin un patrón claro:

- **`char(8)` (coincide con `iam_users.user_id`):** `iam_roles`, `iam_permissions`, `iam_role_permissions`, `pld_contrapartes_kyc`, `pld_contrapartes_docs`, `rentas_*`, `tickets*`, `vivienda_*`, `tesoreria_cortes_edc`.
- **`varchar(100)` (no coincide, sobredimensionado):** `rrhh_empleados`, `rrhh_puestos`, `general_sociedades`, `factura_*`, la mayoría de `tesoreria_*` (`contratos`, `facturas`, `flujos`, `notas_credito`, `complementos_pago`, `contrapartes`, `contrapartes_relacion`, `rec_nominas`).

**Impacto:** funcionalmente no rompe nada (ambos tipos pueden contener un `char(8)`), pero es evidencia de que las tablas se crearon en momentos distintos sin una convención compartida — y significa que un índice sobre estas columnas en las tablas `varchar(100)` es menos eficiente de lo necesario. **No se recomienda normalizar ahora** (cambiar el tipo de una columna con datos reales en producción es una migración de alto riesgo sin beneficio funcional inmediato) — se documenta como deuda técnica conocida, no como acción de Fase 0.

## 5. `iam_user_roles` — faltan las columnas de vigencia que pide el propio plan de trabajo

El DDL real de `iam_user_roles` es:

```sql
CREATE TABLE `iam_user_roles` (
  `assignment_id` char(8) PRIMARY KEY NOT NULL,
  `user_id` char(8) NOT NULL,
  `role_id` char(8) NOT NULL,
  `scope_type` ENUM ('GLOBAL', 'SOCIEDAD', 'PROYECTO') NOT NULL DEFAULT 'GLOBAL',
  `scope_id` varchar(255) NOT NULL DEFAULT '*',
  `granted_by` char(8),
  `granted_at` datetime,
  `revoked_at` datetime
);
```

Dos gaps confirmados a nivel de DDL (ya intuidos en `roles-y-permisos.md`, ahora verificados contra el esquema real):

- **No existe `CENTRO` en el `ENUM` de `scope_type`.** Confirma el gap ya documentado — hoy el alcance por CENTRO/CONTRATO solo puede modelarse como grant plano (`iam_user_centro_access`/`iam_user_contrato_access`), nunca como valor jerárquico de `scope_type`.
- **No existen `fecha_inicio`/`fecha_fin` (vigencia futura/programada)** — solo `granted_at`/`revoked_at`, que son de auditoría (cuándo se otorgó/revocó), no de vigencia planeada (ej. "este rol es válido del 1 al 30 de agosto"). El propio Plan de Trabajo (Semana 5: *"Lógica de asignación de roles con alcance... y fechas de vigencia"* y la tabla de refactorización: *"agregar columnas de vigencia (`fecha_inicio`, `fecha_fin`) en `iam_user_roles` si no existen"*) ya anticipaba este ajuste — queda confirmado como pendiente real para Fase 1 (Semana 5), no un supuesto.

## 6. `rrhh_empleados` no tiene columna de alcance propia

`rrhh_empleados` no declara `sociedad`, `proyecto` ni `centro_id` — el único vínculo organizacional pasa por `rrhh_puestos` (que sí trae `sociedad` y `proyecto`, vía `id_empleado`). Esto confirma el ajuste que ya anticipaba la tabla de refactorización de la arquitectura (*"agregar columna de `centro_id`/`proyecto_id` si el alcance de RLS lo requiere a nivel de empleado"*) — sigue sin resolverse. Es relevante para el rol `RRHH_SUPERVISOR_CENTRO` (alcance CENTRO): hoy filtrar empleados por centro requeriría un `JOIN` a `rrhh_puestos`, que `ScopedManager` (`cumbresbi-scope`) no resuelve directamente (solo filtra por columna propia del modelo, no por relación).

## 7. Tablas de Vivienda sin columna de PROYECTO propia (afecta RLS)

Solo `vivienda_proyectos` (es su propia PK) y `vivienda_listado` (`id_proyecto` directo) tienen columna de proyecto. El resto de la cadena de ventas — `vivienda_ventas_asesores`, `vivienda_ventas_expedientes`, `vivienda_ventas_expedientes_items`, `vivienda_rel_expediente_clientes` — solo llega al proyecto por cadena de FKs no declaradas (`expediente → vivienda → proyecto`). Ya documentado como gap explícito en `services/vivienda-service/vivienda/models.py` (comentarios de `SCOPE_FIELD_PROYECTO` ausente); esta auditoría lo confirma a nivel de esquema completo y lo deja señalado para su resolución en Fase 3 (Semana 11), cuando se defina formalmente la relación presupuesto↔vivienda↔proyecto.

## Resumen de hallazgos

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | Cero FKs reales a nivel de motor de BD | Media | Documentado — no se fuerza en Fase 0 |
| 2 | ~40 columnas `created_by`/`updated_by` + 6 relaciones de negocio cruzan fronteras de microservicio | Alta | Documentado — responsabilidad de aplicación, no de esquema |
| 3 | 3 tablas de Tesorería sin columnas de auditoría | Alta | ✅ Corregido (migración) |
| 4 | Tipo inconsistente `char(8)` vs `varchar(100)` en `created_by`/`updated_by` | Baja | Documentado como deuda técnica, sin acción en Fase 0 |
| 5 | `iam_user_roles` sin `CENTRO` en `scope_type` ni columnas de vigencia | Alta | Pendiente — Fase 1, Semana 5 |
| 6 | `rrhh_empleados` sin columna de alcance (centro/proyecto) propia | Media | Pendiente — Fase 5 |
| 7 | Cadena de ventas de Vivienda sin columna de PROYECTO propia (excepto proyectos/listado) | Media | Pendiente — Fase 3, Semana 11 |

**Regla aplicada en esta auditoría:** siguiendo la regla de refactorización del Plan de Trabajo ("si un requerimiento no encaja con las tablas existentes, se señala explícitamente antes de forzar el modelo — no se improvisan columnas temporales"), ningún hallazgo de esta auditoría se resolvió agregando columnas nuevas fuera de lo ya corregido en el punto 3 (que sí es un gap objetivo de auditoría, no una decisión de producto).
