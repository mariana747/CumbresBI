# CumbresBI — Catálogo de Roles, Permisos y Reglas de RLS por Rol

**Cumbres Consultoría y Proyectos** · Anexo al documento de arquitectura v2.0 (microservicios)

> **Estado: catálogo de roles confirmado por el cliente — se van a crear estos roles.** Dos decisiones adicionales confirmadas: (1) **un usuario puede tener varios roles activos en la misma sesión** (ver ajuste a la sección 4 — el alcance efectivo es la unión de todos sus roles, no uno solo); (2) **el nivel GRUPO (holding de sociedades) NO se crea** (decisión final, 10/Ago/2026 — ver sección 5, pregunta 1, ya cerrada). El sistema se queda con los **4 niveles de alcance** confirmados en el onboarding de Dylan: GLOBAL, SOCIEDAD, PROYECTO, CENTRO. El resto de este documento (matriz de permisos y reglas de RLS por rol) se mantiene como base de trabajo para la implementación en `iam_permissions`/`iam_role_permissions`.

## 1. Niveles de alcance 

Los cuatro niveles documentados en la arquitectura (`GLOBAL`, `SOCIEDAD`, `PROYECTO`, `CENTRO`/`CONTRATO` como grants planos) no cubren todos los casos reales del esquema. Al construir este catálogo aparecieron dos patrones adicionales que **no son parte de `iam_user_roles.scope_type`** y que deben tratarse como mecanismos de RLS distintos, no como bugs a forzar dentro del mismo modelo:

- **Alcance por GRUPO — descartado (decisión final, 10/Ago/2026).** `general_sociedades.grupo` (columna `varchar(50)`) existe en el esquema, pero se confirmó que **no se crea GRUPO como `scope_type`** — el sistema se queda con los 4 niveles del onboarding oficial (GLOBAL/SOCIEDAD/PROYECTO/CENTRO). Un rol tipo "Contralor/CFO" que necesite ver el consolidado de varias sociedades se resuelve con la vía interina ya propuesta abajo: una lista explícita de `sociedad_rfcs` (varias asignaciones `SOCIEDAD` para el mismo usuario), no con un nivel nuevo. **Ver sección 5, pregunta 1 (cerrada).**
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
| Contralor / CFO | `CONTRALOR` | `tesoreria-service`, `facturacion-cfdi-service` | **SOCIEDAD** (lista explícita, varias sociedades del mismo grupo — ver §5 pregunta 1, cerrada) | Necesita consolidado multi-sociedad de un mismo grupo, sin nivel GRUPO formal |
| Supervisor de Centro | `RRHH_SUPERVISOR_CENTRO` | `rrhh-service` | **CENTRO** | Confirmado literalmente en el plan: *"un supervisor de centro no ve empleados de otro centro"* |
| Administrador RRHH | `RRHH_ADMIN` | `rrhh-service` | GLOBAL o SOCIEDAD | Onboarding, nómina, integración Firmenti/DocuSeal |
| Empleado (portal MiCumbres) | `EMPLEADO_SELF` | `rrhh-service` | **IDENTIDAD** (ver hallazgo §1) | Ve únicamente su propio expediente/nómina — nunca el de otro empleado, sin importar su alcance jerárquico |
| Responsable de Proyecto (Tickets) | `TICKETS_RESPONSABLE` | `tickets-service` | PROYECTO | `tickets_proyectos.responsable` / `tickets_subproyectos.responsable` |
| Participante de Ticket | `TICKETS_PARTICIPANTE` | `tickets-service` | **IDENTIDAD** + PROYECTO | Ve los tickets donde `asignado_a` = su propio `user_id`, dentro de los proyectos donde participa |
| Cliente / Prospecto (externo, acción puntual) | *(no es un rol de `iam_roles`)* | `pld-compliance-service`, `ventas-vivienda-service` | Acotado por token (Magic Link, `IamMagicLink`), no por `scope_type` | Autenticación vía `pld_ticket_cliente`/Magic Link — sin `IamUser` real, fuera del sistema de roles interno |
| Colaborador externo (14/Ago/2026, `IamExternalCollaborator`) | Cualquier rol existente (ej. hipotético "Contador") | El que se le asigne | El que se le asigne (GLOBAL/SOCIEDAD/PROYECTO/CENTRO, igual que un colaborador interno) | A diferencia del Magic Link, este mecanismo **sí** crea un `IamUser` real (`access_mode=RESTRICTED`) — un IAM Admin le asigna roles reales en `/admin/usuarios`, no está "fuera del sistema de roles interno". Link permanente, revocable a mano — ver `docs/architecture/README.md` sec. 6.3 |
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
| Finance Manager | L | LCE | — | L | L | LCE | LCEA | L | LCEA | — | — | — |
| Analista de Tesorería | L | L | — | — | — | — | LCE | L | — | — | — | — |
| Comprador | L | L | — | — | LCE | — | L | — | LCEA | — | — | — |
| Contralor/CFO | L | L | — | L | L | L | L *(lista de sociedades)* | L | L | — | — | L |
| Supervisor de Centro | L | — | — | — | — | — | — | — | — | LE *(su CENTRO)* | — | — |
| Administrador RRHH | L | — | — | — | — | — | — | — | — | LCEA | — | — |
| Empleado (MiCumbres) | — | — | — | — | — | — | — | — | — | L *(solo su registro)* | L *(solo asignados a mí)* | — |
| Responsable de Proyecto (Tickets) | L | — | — | — | — | — | — | — | — | — | LCEA *(su PROYECTO)* | — |
| Participante de Ticket | — | — | — | — | — | — | — | — | — | — | L *(solo asignados a mí)*, C *(comentarios)* | — |

`facturacion-cfdi` solo tiene `L` para todos los roles salvo Super Admin
(decisión 26/Ago/2026, `finanzas.md` sec. "General Notes": *"The user
cannot create, delete or modify invoices, just see, export and link them
to transactions"*). Super Admin conserva `LCEA` como excepción operativa.

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

1. **Cerrado (decisión final, 10/Ago/2026): NO se crea GRUPO.** El sistema se queda con los 4 niveles del onboarding oficial de Dylan (GLOBAL/SOCIEDAD/PROYECTO/CENTRO).

Vía definitiva (ya no interina): el rol `CONTRALOR` recibe alcance `sociedad_rfcs` como **lista explícita** de las sociedades del grupo que le correspondan (asignada manualmente al crear el usuario, vía `iam_user_roles` múltiples con `scope_type='SOCIEDAD'`, uno por sociedad) — sin agregar `GRUPO` al ENUM. Es más manual si el grupo crece (hay que actualizar la lista de roles del usuario cada vez que se agregue una sociedad al holding), pero no requiere migración de esquema. Confirmado por el cliente (10/Ago/2026) como la solución definitiva, no un parche temporal.

2. **¿El catálogo de roles de arriba corresponde a los roles reales de Cumbres**, o hay roles adicionales (ej. ¿existe un rol específico para RRHH que gestione solo nómina sin ver expedientes completos? ¿hay un rol "auditor externo" con acceso temporal?) que debamos agregar antes de construir la matriz de permisos en Django/`iam_permissions`?


3. **¿Quién debe poder ver el consolidado multi-sociedad** (rol "Contralor/CFO" propuesto) — ¿es un rol formal hoy en Cumbres, o hoy esa visibilidad solo la tiene Dirección de forma manual/informal? Esto determina si vale la pena el ajuste de esquema del punto 1.


4. **¿El portal MiCumbres requiere que el empleado vea también documentos de terceros relacionados** (ej. un supervisor que además es empleado viendo su propio expediente Y los de su equipo en la misma sesión), o son dos roles y dos vistas completamente separadas? Afecta si `SCOPE_FIELD_IDENTITY` y `SCOPE_FIELD_CENTRO` deben poder combinarse en el mismo usuario simultáneamente (como en el ejemplo de "Participante de Ticket" arriba).


5. ~~¿Los clientes/proveedores externos (Magic Link) necesitan algún permiso granular más allá de "ver/completar su propio expediente"?~~ **Respondido parcialmente (14/Ago/2026):** para quien sí necesita permisos granulares reales (no solo una acción puntual), existe `IamExternalCollaborator` — crea un `IamUser` real con roles asignables normalmente, ver sección 2 y `README.md` sec. 6.3. Magic Link se queda para la acción puntual sin cuenta. Sigue pendiente: confirmar si Compras requiere un formulario público para proveedores (no estaba explícito en el Plan de Trabajo).
6. **Segregación de funciones en PLD** (Analista vs. Aprobador) y en Compras (Comprador vs. quien autoriza el pago en Tesorería) — ¿son roles obligatoriamente distintos por política interna de Cumbres, o pueden recaer en la misma persona en equipos pequeños? Afecta si el sistema debe *impedir* técnicamente que un mismo usuario tenga ambos roles sobre el mismo registro, o solo registrarlo en auditoría.

---

**Referencia:** este catálogo complementa la sección 8 (Arquitectura de RLS) de [`README.md`](README.md) y no reemplaza ninguna decisión ya tomada allí — extiende el contrato de `EffectiveScope` con `SCOPE_FIELD_IDENTITY`, con soporte explícito para múltiples roles activos por sesión (unión de claims, sección 4). La decisión de un nivel `GRUPO` (sección 5, pregunta 1) queda **cerrada: no se crea**, el sistema opera con los 4 niveles de alcance del onboarding oficial.

## 6. Cómo el frontend traduce permisos en pantalla

Las secciones 1-5 dicen qué puede **hacer** cada rol (el catálogo de
permisos, fuente de negocio). Esta sección explica qué **ve** cada rol en
la UI — la traducción de `perm_keys`/`role_keys` a sidebar, panel y
botones de escritura no siempre es "un permiso, una pantalla" (ver el
caso de `AUDITOR` más abajo), y quedaba solo en comentarios de código
dispersos hasta que se juntó aquí (11/Ago/2026).

El sidebar y el panel (`/`) se arman en tiempo real a partir de la sesión
(`/api/me` → `role_keys` + `perm_keys`, unión de todos los roles activos
del usuario — sección 4), **no** hay una lista fija por `role_key`. Casi
todo se decide por `perm_keys` (para que un rol nuevo con los permisos
correctos "simplemente funcione" sin tocar el frontend); solo el caso de
`AUDITOR` mira `role_keys` directamente.

Los botones de escritura (crear/editar/aprobar/revocar) dentro de cada
pantalla siguen el mismo criterio: visibles siempre, pero deshabilitados
si falta el `perm_key` exacto que exige el backend — nunca ocultos.
Excepción confirmada (11/Ago/2026): los bloques de **generar/subir**
(crear un recurso desde cero — Magic Link, ticket, invitación, sociedad,
documento) se **ocultan por completo** para quien no tiene el `perm_key`
de `.crear`, en vez de mostrarse deshabilitados — mostrar un formulario
vacío que no lleva a nada confundía más que ayudar. Las acciones sobre un
recurso ya existente (Editar/Borrar/Revocar/Otorgar) siguen el criterio
original: visibles, deshabilitadas.

Código fuente de estas reglas: [`AppShell.tsx`](../../frontend/src/components/AppShell.tsx)
(`buildNavItems`) y [`lib/auth.ts`](../../frontend/src/lib/auth.ts) (los
helpers `puedeAdministrarIam`, `tieneAccesoIam`, `tieneAccesoPld`,
`puedeVerBitacora`, `tieneAlgunPermiso`). Suite que lo prueba
automáticamente: [`AppShell.test.ts`](../../frontend/src/components/AppShell.test.ts)
(18/18 en verde al 11/Ago/2026).

### 6.1 Sidebar, regla por regla

| Si la sesión tiene... | Ve en el sidebar | Por qué |
|---|---|---|
| `iam.crear` o `iam.editar` | **Admin (IAM)** completo — Usuarios, Invitaciones, Permisos, Reportes, Organización, y "Bitácora" anidada adentro | Solo quien puede escribir en IAM administra IAM de verdad (`puedeAdministrarIam`) |
| `iam.leer` solamente, y **no** es `AUDITOR` | **Administración (solo lectura)** — mismas 4 pantallas menos Reportes/Bitácora, todo deshabilitado adentro | Decisión 11/Ago/2026: reusar las pantallas existentes en vez de construir un directorio aparte para "puede ver pero no tocar" (`tieneAccesoIam`); nombre distinto a propósito para no verse igual que el menú completo |
| `role_keys` incluye `AUDITOR` | **Auditar** (solo "Bitácora") — **no** ve Admin(IAM), aunque también tenga `iam.leer` | Caso especial por `role_keys`, no por `perm_keys` — evita que Auditor caiga en el menú completo de IAM (bug corregido 11/Ago/2026) |
| Algún `pld-compliance.*` | **PLD / Cumplimiento** (etiqueta cambia a "Analista PLD"/"Aprobador PLD" según el rol exacto) | `tieneAccesoPld` |
| Algún `contrapartes.*` | **Contrapartes** — clickeable, pantalla "en desarrollo" | Servicio sin backend propio todavía |
| Algún `ventas-vivienda.*` o `materiales.*` | **Ventas / Vivienda** — clickeable, "en desarrollo" | Fase 3, sin construir |
| Algún `tesoreria.*`, `compras.*` o `facturacion-cfdi.*` | **Compras / Tesorería** — clickeable, "en desarrollo" | Fase 4, sin construir |
| Algún `rrhh.*` | **RRHH y Talento** — clickeable, "en desarrollo" | Fase 5, sin construir |
| Algún `tickets.*` | **Tickets** — clickeable, "en desarrollo" | Sin backend todavía (hallazgo de `AppShell.test.ts`, resuelto 11/Ago/2026 agregando el apartado) |
| Algún `rentas.*` | **Rentas** — clickeable, "en desarrollo" | Sin backend todavía (mismo hallazgo — antes pasaba desapercibido porque `FINANZAS_MANAGER`/`CONTRALOR` ya veían "Compras/Tesorería" por otros permisos) |
| Cualquier sesión válida | **Panel** y **MiCumbres** siempre | No dependen de ningún permiso |

### 6.2 Tabla concreta: qué ve cada uno de los 17 roles

Generada corriendo `buildNavItems` real contra la matriz de
`services/iam-service/iam/permission_matrix.py` (mismo fixture que usa
`AppShell.test.ts`), no a mano — para regenerarla si la matriz cambia,
ver el fixture `roleAccessMatrix.json` y correr `buildNavItems` con cada
rol (con `is_global=false`, que es el caso que importa para esta tabla —
con `is_global=true` cualquier rol suma "Bitácora" adentro de su
apartado de IAM/Auditar, ver 6.3).

| `role_key` | Apartados del sidebar (en orden) |
|---|---|
| `SUPER_ADMIN` | Panel · **Super Admin** (IAM completo) · PLD / Cumplimiento · Contrapartes · Ventas / Vivienda · Compras / Tesorería · RRHH y Talento · Tickets · Rentas · MiCumbres |
| `IAM_ADMIN` | Panel · **Admin IAM** (IAM completo) · MiCumbres |
| `AUDITOR` | Panel · **Auditar** · PLD / Cumplimiento · Contrapartes · Ventas / Vivienda · Compras / Tesorería · RRHH y Talento · Tickets · Rentas · MiCumbres *(tiene `L` en todo el catálogo — ve los placeholders también)* |
| `PLD_ANALISTA` | Panel · Administración (solo lectura) · **Analista PLD** · Contrapartes · MiCumbres |
| `PLD_APROBADOR` | Panel · Administración (solo lectura) · **Aprobador PLD** · Contrapartes · MiCumbres |
| `VENTAS_ASESOR` | Panel · Administración (solo lectura) · Contrapartes · Ventas / Vivienda · MiCumbres |
| `VENTAS_GERENTE` | Panel · Administración (solo lectura) · Contrapartes · Ventas / Vivienda · Compras / Tesorería · MiCumbres |
| `OBRA_COORDINADOR` | Panel · Administración (solo lectura) · Ventas / Vivienda · MiCumbres |
| `FINANZAS_MANAGER` | Panel · Administración (solo lectura) · Contrapartes · Ventas / Vivienda · Compras / Tesorería · Rentas · MiCumbres |
| `TESORERIA_ANALISTA` | Panel · Administración (solo lectura) · Contrapartes · Compras / Tesorería · MiCumbres |
| `COMPRAS_ANALISTA` | Panel · Administración (solo lectura) · Contrapartes · Ventas / Vivienda · Compras / Tesorería · MiCumbres |
| `CONTRALOR` | Panel · Administración (solo lectura) · Contrapartes · Ventas / Vivienda · Compras / Tesorería · Rentas · MiCumbres |
| `RRHH_SUPERVISOR_CENTRO` | Panel · Administración (solo lectura) · RRHH y Talento · MiCumbres |
| `RRHH_ADMIN` | Panel · Administración (solo lectura) · RRHH y Talento · MiCumbres |
| `EMPLEADO_SELF` | Panel · RRHH y Talento · Tickets · MiCumbres *(sin `iam.leer` — no le toca ni el modo solo-lectura)* |
| `TICKETS_RESPONSABLE` | Panel · Administración (solo lectura) · Tickets · MiCumbres |
| `TICKETS_PARTICIPANTE` | Panel · Tickets · MiCumbres *(sin `iam.leer` — el más "vacío" del catálogo aparte de Tickets)* |

### 6.3 Panel (`/`)

- Tarjeta "Sociedades registradas": siempre visible (catálogo abierto),
  pero solo **clickeable** si `puedeAdministrarIam` (si no, el dato es
  público pero la pantalla de administración detrás no le toca).
- Tarjeta "Usuarios sin rol" / "Invitaciones pendientes": solo si
  `puedeAdministrarIam`.
- Tarjeta "Expedientes KYC": solo si `tieneAccesoPld`.
- "Bitácora reciente": `puedeVerBitacora` = `is_global === true` **o**
  `role_keys` incluye `AUDITOR` — **no** depende de `iam.leer` ni de
  `audit.leer`. Importante: `is_global` se prende con que **cualquier**
  rol activo del usuario tenga `scope_type=GLOBAL` (`scope_utils.py`),
  sin importar cuál rol sea — un rol de alcance `SOCIEDAD`/`PROYECTO` no
  la prende aunque el rol en sí no tenga nada que ver con auditoría.

### 6.4 Botones de escritura dentro de cada pantalla

Mismo `perm_key` que exige el backend (`require_permission` en cada
`ViewSet.get_permissions`), replicado en el frontend para no mostrar un
botón que va a fallar con 403:

| Pantalla | Botón | `perm_key` exigido | Visible-deshabilitado u oculto si falta |
|---|---|---|---|
| `/admin/organizacion` | Nueva sociedad | `iam.crear` | Oculto |
| `/admin/organizacion` | Editar / Borrar | `iam.editar` | Visible-deshabilitado |
| `/admin/permisos` | Switch "Modo edición" + otorgar/revocar en la matriz | `iam.editar` | Oculto |
| `/admin/invitaciones` (14/Ago/2026, reorganizado en 3 pestañas: Temporales/Colaboradores) | Generar Magic Link / Carga masiva / Invitar Workspace / Dar acceso externo | `iam.crear` | Oculto |
| `/admin/invitaciones` | Revocar / Reenviar | `iam.editar` | Visible-deshabilitado |
| `/admin/usuarios` (3 pestañas: Directorio/Pendientes/Suspendidos) | Menú "Editar" (Cambiar empresa, Gestionar roles) | — (los diálogos internos gatean por su cuenta) | Siempre visible |
| `/admin/usuarios` | Suspender / Eliminar / Reactivar (menú "Editar", con diálogo de confirmación) | `iam.editar` | Visible-deshabilitado |
| `/admin/usuarios` (pestaña Pendientes) | Revocar (invitación o acceso externo pendiente) | `iam.editar` | Visible-deshabilitado |
| `/admin/reportes` (pestaña "Usuarios eliminados", 14/Ago/2026) | — solo lectura | — | Sin gate propio (mismo criterio que el resto de Reportes) |
| `RoleAssignmentDialog` / `EmpresaAssignmentDialog` | Otorgar / Revocar rol o empresa | `iam.crear` / `iam.editar` | Visible-deshabilitado |
| `/pld` | Cargar documento | `pld-compliance.crear` | Oculto |
| `/pld` | Aprobar expediente | `pld-compliance.aprobar` | Visible-deshabilitado |
| `/pld/tickets` | Generar ticket | `pld-compliance.crear` | Oculto |
| `/pld/tickets` | Revocar ticket | `pld-compliance.editar` | Visible-deshabilitado |

### 6.5 Huecos conocidos (no son bugs de gating, son módulos sin construir)

- **Contrapartes, Ventas/Vivienda, Compras/Tesorería, RRHH, Tickets,
  Rentas**: tienen apartado en el sidebar (clickeable, "en desarrollo")
  pero ninguna pantalla real todavía.
- **`EMPLEADO_SELF` / `TICKETS_PARTICIPANTE`**: su alcance real es
  `IDENTIDAD` ("solo mis propios registros"), que no existe como
  mecanismo en `iam-service` todavía (sección 1) — el gating de
  sidebar/botones ya funciona igual que cualquier otro rol, lo que falta
  es el filtro de datos (RLS) por identidad en los servicios de negocio,
  no en el frontend.
- **Herramientas de depuración ya quitadas**: el bloque "Probar
  validación" (pegar un token y ver el JWT/resultado) que existía en
  `/admin/invitaciones` y `/pld/tickets` se eliminó por completo
  (11/Ago/2026) — era una herramienta de desarrollo sin permiso asociado,
  no una pantalla de producto.
