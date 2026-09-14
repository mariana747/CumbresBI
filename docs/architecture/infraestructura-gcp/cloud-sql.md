# Cloud SQL — bases de datos de CumbresBI en la instancia existente

**Cumbres Consultoría y Proyectos** · Infraestructura GCP, proyecto `cyp-cumbres-461220`

> **Contexto:** se había asumido (por el correo original y "el SQL ya está") que la instancia Cloud SQL
> ya estaba lista para CumbresBI. La única instancia que existe en el proyecto es `db-cypcumbres`, la
> del sistema actual en producción (el que CumbresBI está reemplazando — ver `docs/CumbresBI_estado.md`,
> el MySQL con los esquemas `iam_*`, `tesoreria_*`, `vivienda_*`, etc.).

## Decisión de costo: reusar la instancia, no crear una nueva

Crear una instancia Cloud SQL nueva hubiera costado ~$10–40 USD/mes aparte, corriendo 24/7. Se decidió
en su lugar crear **bases de datos nuevas dentro de la misma instancia existente**, una por
microservicio de CumbresBI que lo requiera — costo marginal (solo el disco que ocupen). La contrapartida
es que CumbresBI comparte cómputo/IO con el sistema en producción; si CumbresBI genera carga pesada
podría impactar al otro sistema. Se recomienda monitorear esto si se vuelve un problema conforme avancen
las fases.

## Reglas de seguridad — no afectar el sistema en producción

Esta instancia sigue sirviendo al sistema actual en producción, así que toda acción sobre ella respeta:

- **Solo `CREATE DATABASE` con nombre nuevo.** Nunca modificar, renombrar ni borrar las bases existentes
  (`iam_*`, `tesoreria_*`, `vivienda_*`, `rrhh_*`, `pld_*`, etc. del sistema actual).
- **Usuarios nuevos con permisos acotados por base**, nunca `GRANT ALL ON *.*`. Cada usuario de
  CumbresBI puede leer/escribir SOLO su propia base nueva.
- **No cambiar configuración de la instancia** (tamaño de máquina, versión, flags, reinicios) — eso sí
  causaría downtime al sistema en producción.
- Antes de crear cada base/usuario, se revisa la lista de bases y usuarios existentes en la instancia
  para confirmar que el nombre nuevo no choca con nada ya usado.

## Convención de nombres

Todas las bases de CumbresBI llevan el prefijo `cumbresbi_` para no confundirlas con `administracion`
(la base del sistema en producción): `cumbresbi_docint_service`, `cumbresbi_audit_service`,
`cumbresbi_test`. El nombre de base es configurable por variable de entorno (`DOCINT_DB_NAME`,
`AUDIT_DB_NAME`), así que no hace falta tocar código para aplicar la convención — solo definir esas
env vars con el nombre prefijado en vez del default (que solo es para Docker local).

## Estado al revisar la instancia (2026-08-06)

Ya existían `administracion` (sistema en producción, no tocar) y `cumbresbi-dev` (base de prueba
inicial, vacía — nunca se pudo usar por permisos). `cumbresbi-dev` se borró y se creó `cumbresbi_test`
en su lugar.

Para cerrar Fase 0 solo se necesitaban las bases de `document-intelligence-service` (Motor Documental)
y `audit-service` (tabla de auditoría). `iam-service` es Fase 1 — su base (`cumbresbi_iam_service`) se
crea cuando arranque esa fase formalmente, aunque su código ya está listo (`IAM_DB_SOCKET_DIR` ya
implementado en `services/iam-service/config/settings.py`).

## Bases creadas en `db-cypcumbres`

| Base | Uso | Charset | Intercalación |
|---|---|---|---|
| `cumbresbi_docint_service` | Motor Documental (`document-intelligence-service`) | `utf8mb4` | `utf8mb4_0900_ai_ci` |
| `cumbresbi_audit_service` | Auditoría (`audit-service`) | `utf8mb4` | `utf8mb4_0900_ai_ci` |
| `cumbresbi_test` | Datos de prueba (reemplaza a `cumbresbi-dev`) | `utf8mb4` | `utf8mb4_0900_ai_ci` |

## Usuarios de BD y acotamiento de privilegios

Se crearon los usuarios `docint_app` y `audit_app` directamente desde la consola de Cloud SQL, que por
default les asignó privilegios de superusuario (`ALL PRIVILEGES ON *.*`) sobre toda la instancia — un
riesgo real dado que la instancia también sirve al sistema en producción.

Se acotaron a su propia base (2026-08-07), ejecutado por Arturo vía Cloud Shell conectado como `root`
(Mariana no tiene ese acceso):

```sql
REVOKE ALL PRIVILEGES ON *.* FROM 'docint_app'@'%';
GRANT ALL PRIVILEGES ON cumbresbi_docint_service.* TO 'docint_app'@'%';

REVOKE ALL PRIVILEGES ON *.* FROM 'audit_app'@'%';
GRANT ALL PRIVILEGES ON cumbresbi_audit_service.* TO 'audit_app'@'%';

FLUSH PRIVILEGES;
```

Verificado con `SHOW GRANTS FOR 'docint_app'@'%';` / `SHOW GRANTS FOR 'audit_app'@'%';` — ninguno de
los dos conserva `ALL PRIVILEGES ON *.*` (solo queda el `GRANT USAGE ON *.*` implícito de MySQL, que no
es un privilegio real, más el `GRANT ALL PRIVILEGES` acotado a su propia base).

## Pendiente

`iam-service` no tiene todavía base ni usuario en Cloud SQL — se crea (`cumbresbi_iam_service` + su
usuario, con el mismo acotamiento de privilegios que arriba) cuando arranque formalmente la Fase 1. Ver
[`iam-service.md`](iam-service.md).
