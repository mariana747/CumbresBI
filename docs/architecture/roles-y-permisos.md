# CumbresBI — Catálogo de Roles, Permisos y Reglas de RLS por Rol

**Cumbres Consultoría y Proyectos** · Anexo al documento de arquitectura v2.0 (microservicios)

> **Estado: catálogo de roles confirmado por el cliente — se van a crear estos roles.** Dos decisiones adicionales confirmadas: (1) **un usuario puede tener varios roles activos en la misma sesión** (ver ajuste a la sección 4 — el alcance efectivo es la unión de todos sus roles, no uno solo); (2) **el nivel GRUPO (holding de sociedades) queda sin decidir** — el cliente no tiene aún certeza de si debe crearse como valor de `scope_type`, así que se documenta como pendiente y se propone una vía interina que no bloquea la Fase 0/1 (ver sección 5, pregunta 1). El resto de este documento (matriz de permisos y reglas de RLS por rol) se mantiene como base de trabajo para la implementación en `iam_permissions`/`iam_role_permissions`.

## 1. Niveles de alcance 

Los cuatro niveles documentados en la arquitectura (`GLOBAL`, `SOCIEDAD`, `PROYECTO`, `CENTRO`/`CONTRATO` como grants planos) no cubren todos los casos reales del esquema. Al construir este catálogo aparecieron dos patrones adicionales que **no son parte de `iam_user_roles.scope_type`** y que deben tratarse como mecanismos de RLS distintos, no como bugs a forzar dentro del mismo modelo:

- **Alcance por GRUPO** — `general_sociedades.grupo` (columna `varchar(50)`) existe en el esquema y sugiere una agrupación de sociedades (ej. un holding con varias razones sociales) por encima de SOCIEDAD y por debajo de GLOBAL. Hoy `iam_user_roles.scope_type` no tiene un valor `GRUPO`. Un rol tipo "Contralor/CFO" que debe ver el consolidado de varias sociedades del mismo grupo, pero no de otros grupos, no se puede modelar limpiamente hoy — o es GLOBAL (ve todo) o es una lista de `sociedad_rfcs` individuales (frágil si el grupo crece). **Ver pregunta abierta en sección 5.**
- **Alcance por IDENTIDAD (self-service)** — casos donde el filtro correcto no es jerárquico sino "el registro me pertenece a mí": un empleado en el portal MiCumbres viendo su propio expediente (`rrhh_empleados` vía `iam_users.employee_id`), o un usuario de `tickets` viendo los tickets donde `asignado_a = mi user_id`. Esto **no es** GLOBAL/SOCIEDAD/PROYECTO/CENTRO — es un filtro por igualdad directa contra el usuario autenticado, y debe implementarse como una regla de `ScopedManager` distinta (`SCOPE_FIELD_IDENTITY`), no forzada dentro de los mismos claims jerárquicos del JWT.

## 2. Catálogo de roles (confirmado — se van a crear)

| Rol | `role_key` sugerido | Servicio(s) principal(es) | Alcance | Evidencia |
|---|---|---|---|---|
| Super Admin | `SUPER_ADMIN` | Todos (`iam-service` y transversal) | GLOBAL | Rol de plataforma implícito en cualquier sistema con RLS; explícitamente **no** exento de la regla de auditoría inmutable ("ningún rol, ni siquiera Super Admin, puede alterar la bitácora") |
| Administrador IAM | `IAM_ADMIN` | `iam-service` | GLOBAL | Gestiona usuarios, roles, permisos e invitaciones — no implica acceso a datos de negocio de otros servicios |
| Auditor / Compliance Officer | `AUDITOR` | `audit-service` (lectura), resto (solo lectura de reportes) | GLOBAL o SOCIEDAD | Necesario para el "visor de bitácora... filtrable, exportable a CSV/PDF" y las validaciones de UAT del plan de trabajo |
| Analista PLD/KYC | `PLD_ANALISTA` | `pld-compliance-service` | GLOBAL o SOCIEDAD (a confirmar — PLD es transversal a todas las sociedades) | Gestiona `pld_contrapartes_kyc`/`pld_contrapartes_docs`, estados PENDIENTE/EN REVISIÓN |
| Aprobador PLD (Compliance Manager) | `PLD_APROBADOR` | `pld-compliance-service` | GLOBAL o SOCIEDAD | `pld_contrapartes_kyc.aprobado_por` — rol distinto del analista (segregación de funciones: quien captura no aprueba) |
| Asesor de Ventas | `VENTAS_ASESOR` | `ventas-vivienda-service` | **PROYECTO** | Confirmado literalmente en el plan: *"un asesor no ve expedientes de otro proyecto salvo asignación explícita"* |
| Gerente de Ventas/Proyecto | `VENTAS_GERENTE` | `ventas-vivienda-service`, `materiales-service` | PROYECTO o SOCIEDAD | Supervisa varios asesores dentro de sus proyectos; aprueba presupuesto/firmas |
| Coordinador de Obra | `OBRA_COORDINADOR` | `materiales-service` | PROYECTO | Reporta avance de obra, gestiona consumo de materiales contra presupuesto |
| Finance Manager | `FINANZAS_MANAGER` | `tesoreria-service`, `compras-service` | **SOCIEDAD** | Confirmado literalmente en el plan: *"Finance Manager de la Empresa A no ve datos de la Empresa B"* |
| Analista de Tesorería | `TESORERIA_ANALISTA` | `tesoreria-service` | SOCIEDAD | Opera flujos/conciliación bajo supervisión del Finance Manager; sin permiso de autorización de pago |
| Comprador / Analista de Compras | `COMPRAS_ANALISTA` | `compras-service`, `materiales-service` | SOCIEDAD o PROYECTO | Gestiona proveedores y órdenes de compra; reutiliza el Motor Documental para cotizaciones |
| Contralor / CFO | `CONTRALOR` | `tesoreria-service`, `facturacion-cfdi-service` | **GRUPO** (ver hallazgo §1 — hoy solo aproximable como GLOBAL o lista de sociedades) | Necesita consolidado multi-sociedad de un mismo grupo — caso que motiva la pregunta abierta de §5 |
| Supervisor de Centro | `RRHH_SUPERVISOR_CENTRO` | `rrhh-service` | **CENTRO** | Confirmado literalmente en el plan: *"un supervisor de centro no ve empleados de otro centro"* |
| Administrador RRHH | `RRHH_ADMIN` | `rrhh-service` | GLOBAL o SOCIEDAD | Onboarding, nómina, integración Firmenti/DocuSeal |
| Empleado (portal MiCumbres) | `EMPLEADO_SELF` | `rrhh-service` | **IDENTIDAD** (ver hallazgo §1) | Ve únicamente su propio expediente/nómina — nunca el de otro empleado, sin importar su alcance jerárquico |
| Responsable de Proyecto (Tickets) | `TICKETS_RESPONSABLE` | `tickets-service` | PROYECTO | `tickets_proyectos.responsable` / `tickets_subproyectos.responsable` |
| Participante de Ticket | `TICKETS_PARTICIPANTE` | `tickets-service` | **IDENTIDAD** + PROYECTO | Ve los tickets donde `asignado_a` = su propio `user_id`, dentro de los proyectos donde participa |
| Cliente / Prospecto (externo) | *(no es un rol de `iam_roles`)* | `pld-compliance-service`, `ventas-vivienda-service` | Acotado por token (Magic Link), no por `scope_type` | Autenticación vía `pld_ticket_cliente` o equivalente — fuera del sistema de roles interno |
<!--| Proveedor (externo) | *(no es un rol de `iam_roles`)* | `compras-service` | Acotado por token (Magic Link), si aplica | A confirmar si Compras expone algún formulario público para proveedores (no está explícito en el plan) |-->
## 3. Matriz de permisos por servicio (resumen)

`L` = Leer · `C` = Crear · `E` = Editar · `A` = Aprobar/Autorizar · `—` = sin acceso

| Rol | iam | contrapartes | pld-compliance | ventas-vivienda | materiales | rentas | tesoreria | facturacion-cfdi | compras | rrhh | tickets | audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Super Admin | LCEA | LCEA | LCEA | LCEA | LCEA | LCEA | LCEA | LCEA | LCEA | LCEA | LCEA | L *(nunca E/borrado)* |
| Administrador IAM | LCEA | — | — | — | — | — | — | — | — | — | — | L |
| Auditor | L | L | L | L | L | L | L | L | L | L | L | L |
| Analista PLD | L | L | LCE | — | — | — | — | — | — | — | — | — |
| Aprobador PLD | L | L | LEA | — | — | — | — | — | — | — | — | — |
| Asesor de Ventas | L | L | — | LCE *(solo su PROYECTO)* | L | — | — | — | — | — | — | — |
| Gerente de Ventas | L | L | — | LCEA *(sus PROYECTOs)* | LE | — | L | — | — | — | — | — |
| Coordinador de Obra | L | — | — | LE | LCE | — | — | — | — | — | — | — |
| Finance Manager | L | LCE | — | L | L | LCE | LCEA | LCE | LCEA | — | — | — |
| Analista de Tesorería | L | L | — | — | — | — | LCE | LC | — | — | — | — |
| Comprador | L | L | — | — | LCE | — | L | — | LCEA | — | — | — |
| Contralor/CFO | L | L | — | L | L | L | L *(su GRUPO)* | L | L | — | — | L |
| Supervisor de Centro | L | — | — | — | — | — | — | — | — | LE *(su CENTRO)* | — | — |
| Administrador RRHH | L | — | — | — | — | — | — | — | — | LCEA | — | — |
| Empleado (MiCumbres) | — | — | — | — | — | — | — | — | — | L *(solo su registro)* | L *(solo asignados a mí)* | — |
| Responsable de Proyecto (Tickets) | L | — | — | — | — | — | — | — | — | — | LCEA *(su PROYECTO)* | — |
| Participante de Ticket | — | — | — | — | — | — | — | — | — | — | L *(solo asignados a mí)*, C *(comentarios)* | — |

## 4. Reglas de RLS por rol (cómo `ScopedManager` aplica el filtro)

**Confirmado por el cliente: un usuario puede tener varios roles activos en la misma sesión.** Esto cambia cómo `iam-service` calcula `EffectiveScope` respecto al ejemplo de un-rol-por-vez de la tabla siguiente: cuando un usuario tiene, por ejemplo, `VENTAS_ASESOR` (proyectos P1, P2) **y** `TICKETS_RESPONSABLE` (proyecto P3) al mismo tiempo, el JWT no lleva un solo rol — lleva el **alcance efectivo agregado**:

- Cada claim de alcance (`sociedad_rfcs`, `proyecto_ids`, `centro_ids`, `contrato_ids`) es la **unión** de lo que aportan todos los roles activos del usuario (`iam_user_roles` con `revoked_at IS NULL`), no la intersección ni el de un solo rol seleccionado. Ejemplo: el usuario del párrafo anterior recibe `proyecto_ids=["P1","P2","P3"]` en un único JWT.
- Si **cualquiera** de los roles del usuario trae `is_global=true`, el claim agregado es `is_global=true` — GLOBAL domina sobre cualquier restricción más estrecha de otro rol del mismo usuario (un usuario no queda más restringido por tener además un rol acotado).
- Los **permisos** (qué puede hacer, no qué puede ver) también se agregan por unión: si `VENTAS_ASESOR` da `LCE` sobre `ventas-vivienda` y `TICKETS_RESPONSABLE` da `LCEA` sobre `tickets`, el usuario tiene ambos simultáneamente — no hay que "cambiar de rol activo" en la sesión para operar en cualquiera de sus dos ámbitos.
- **Consecuencia para `cumbresbi-scope`:** `iam-service` debe calcular este agregado una sola vez al emitir el JWT (no cada servicio por separado), igual que ya especificaba el diseño original — lo único que cambia es que la fuente ya no es "el rol del usuario" (singular) sino "todos los roles activos del usuario" (plural, con `UNION` de claims). Esto no rompe el contrato de `EffectiveScope` ya documentado en la arquitectura (sigue siendo un solo conjunto de claims por sesión); solo aclara cómo se calcula cuando hay más de un rol de origen.

Cada rol individual aporta su propia combinación de claims al agregado anterior. La librería compartida `cumbresbi-scope` interpreta esos claims ya agregados de la misma forma en los 13 servicios — la diferencia entre roles no está en el mecanismo, está en *qué claims aporta cada uno antes de agregarse*.

| Rol (ejemplo) | Claims resueltos por `iam-service` | `WHERE` resultante (ejemplo sobre `tesoreria_contratos`) |
|---|---|---|
| Super Admin | `is_global=true` | Sin filtro (`all_objects`-equivalente, pero vía `is_global`, no vía escape hatch manual) |
| Finance Manager (Sociedad "ABC") | `sociedad_rfcs=["ABC123456XYZ"]` | `WHERE sociedad IN ('ABC123456XYZ')` |
| Asesor de Ventas (Proyectos P1, P2) | `proyecto_ids=["P1","P2"]` | `WHERE proyecto IN ('P1','P2')` (vía join a `vivienda_proyectos`/`tesoreria_contratos.proyecto`) |
| Supervisor de Centro (Centro C7) | `centro_ids=["C7"]` | `WHERE centro_id IN ('C7')` (requiere que `rrhh_puestos` u homólogo exponga `centro_id` di   recto, ver nota de la v1.0 sobre columnas de alcance faltantes) |
| Empleado (MiCumbres) | `identity_user_id="u123"` *(claim nuevo, no existía en el diseño original)* | `WHERE id_empleado = (SELECT employee_id FROM iam_users WHERE user_id='u123')` |
| Participante de Ticket | `identity_user_id="u123"` + `proyecto_ids=[...]` | `WHERE asignado_a = 'u123' AND id_subproyecto IN (proyectos del usuario)` — combina IDENTIDAD y PROYECTO en el mismo `ScopedManager` |

<!--**Cambio recomendado a la librería `cumbresbi-scope` (no estaba en el diseño original):** agregar un quinto campo de alcance, `SCOPE_FIELD_IDENTITY`, análogo a los cuatro ya definidos (`SCOPE_FIELD_SOCIEDAD/PROYECTO/CENTRO/CONTRATO`), para los modelos donde el filtro correcto es "este registro me pertenece" en vez de una jerarquía organizacional. Esto afecta el contrato de `EffectiveScope` documentado en la arquitectura — es una extensión, no una ruptura, del diseño ya aprobado.-->

## 5. Hallazgos y preguntas para el negocio

Estas preguntas son además de las ya planteadas sobre CENTRO/CONTRATO y el dominio raíz de cookies:

1. **Sin decidir (confirmado por el cliente: "no sé si se debe crear un valor de GRUPO").** 

Mientras se resuelve, la vía interina recomendada para no bloquear la Fase 0/1: mantener el rol `CONTRALOR` con alcance `sociedad_rfcs` como **lista explícita** de las sociedades del grupo que le correspondan (asignada manualmente al crear el usuario, vía `iam_user_roles` múltiples con `scope_type='SOCIEDAD'`, uno por sociedad), en vez de agregar `GRUPO` al ENUM. Es más frágil si el grupo crece (hay que actualizar la lista de roles del usuario cada vez que se agregue una sociedad al holding), pero no requiere migración de esquema y es reversible: si más adelante se confirma que se necesita `GRUPO` como nivel formal, se migra sin romper lo ya construido. Confirmar con el cliente si esta vía interina es aceptable para el arranque o si prefiere resolver la pregunta de fondo antes de la Fase 1 (IAM).

2. **¿El catálogo de roles de arriba corresponde a los roles reales de Cumbres**, o hay roles adicionales (ej. ¿existe un rol específico para RRHH que gestione solo nómina sin ver expedientes completos? ¿hay un rol "auditor externo" con acceso temporal?) que debamos agregar antes de construir la matriz de permisos en Django/`iam_permissions`?


3. **¿Quién debe poder ver el consolidado multi-sociedad** (rol "Contralor/CFO" propuesto) — ¿es un rol formal hoy en Cumbres, o hoy esa visibilidad solo la tiene Dirección de forma manual/informal? Esto determina si vale la pena el ajuste de esquema del punto 1.


4. **¿El portal MiCumbres requiere que el empleado vea también documentos de terceros relacionados** (ej. un supervisor que además es empleado viendo su propio expediente Y los de su equipo en la misma sesión), o son dos roles y dos vistas completamente separadas? Afecta si `SCOPE_FIELD_IDENTITY` y `SCOPE_FIELD_CENTRO` deben poder combinarse en el mismo usuario simultáneamente (como en el ejemplo de "Participante de Ticket" arriba).


5. **¿Los clientes/proveedores externos (Magic Link) necesitan algún permiso granular más allá de "ver/completar su propio expediente"**, o el modelo de token de un solo uso ya cubre el 100% de sus casos de uso? Confirma si Compras requiere un formulario público para proveedores (no estaba explícito en el Plan de Trabajo).
6. **Segregación de funciones en PLD** (Analista vs. Aprobador) y en Compras (Comprador vs. quien autoriza el pago en Tesorería) — ¿son roles obligatoriamente distintos por política interna de Cumbres, o pueden recaer en la misma persona en equipos pequeños? Afecta si el sistema debe *impedir* técnicamente que un mismo usuario tenga ambos roles sobre el mismo registro, o solo registrarlo en auditoría.

---

**Referencia:** este catálogo complementa la sección 8 (Arquitectura de RLS) de [`README.md`](README.md) y no reemplaza ninguna decisión ya tomada allí — extiende el contrato de `EffectiveScope` con `SCOPE_FIELD_IDENTITY`, con soporte explícito para múltiples roles activos por sesión (unión de claims, sección 4), y deja abierta la decisión de un nivel `GRUPO` (sección 5, pregunta 1) con una vía interina que no bloquea el arranque de la Fase 0/1.
