"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { MoreVertical, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  IamPermission,
  IamRole,
  IamRoleTipo,
  activateRole,
  createRole,
  deactivateRole,
  deleteRole,
  grantRolePermission,
  listPermissions,
  listRoles,
  revokeRolePermission,
} from "@/lib/iam";

// Matriz de permisos roles x servicios (Fase 1, Semana 5) - editable: un
// admin con sesion real puede otorgar/revocar un permiso especifico a un
// rol directo desde esta pantalla (antes solo se veia, no se editaba). El
// actor de auditoria es el usuario real logueado (getSession(), via
// iam-service/auth_views.py) - primer lugar del frontend que usa la
// sesion real para algo mas que solo mostrar el nombre.
//
// Cada IamPermission.perm_key tiene la forma "<servicio>.<accion>" (ver
// iam/migrations/0004_seed_permisos_matriz.py). En vez de una casilla por
// permiso individual (18 roles x ~40 permisos seria una tabla enorme e
// ilegible), se agrupa por servicio y se muestra que acciones (L/C/E/A)
// tiene el rol en ese servicio - mismo formato que
// docs/architecture/roles-y-permisos.md sec. 3, que el cliente ya conoce.
// En "modo edicion" cada celda se abre en 4 checkboxes (uno por accion).
const LETRA_POR_ACCION: Record<string, string> = {
  leer: "L",
  crear: "C",
  editar: "E",
  aprobar: "A",
};

const NOMBRE_POR_ACCION: Record<string, string> = {
  leer: "Leer",
  crear: "Crear",
  editar: "Editar",
  aprobar: "Aprobar/autorizar",
};

// Orden fijo L-C-E-A (no alfabetico) para que coincida con la convencion
// del documento fuente.
const ORDEN_ACCIONES = ["leer", "crear", "editar", "aprobar"];

// Nicknames de area/servicio para mostrar en pantalla - el valor crudo
// (prefijo de IamPermission.perm_key, ver
// iam/migrations/0004_seed_permisos_matriz.py) sigue siendo el que se usa
// para filtrar/agrupar, esto es solo la etiqueta visible. Catalogo fijo:
// un area nueva que todavia no tenga nickname se muestra tal cual (nunca
// se oculta informacion por no tener traduccion).
const AREA_LABELS: Record<string, string> = {
  iam: "IAM",
  contrapartes: "Contrapartes",
  "pld-compliance": "PLD / Cumplimiento",
  "ventas-vivienda": "Ventas / Vivienda",
  materiales: "Materiales",
  rentas: "Rentas",
  tesoreria: "Tesorería",
  "facturacion-cfdi": "Facturación CFDI",
  compras: "Compras",
  rrhh: "RRHH",
  tickets: "Tickets",
  audit: "Auditoría",
  docint: "Motor Documental",
  "pld-documentos": "PLD / Archivos",
  obra: "Obra",
  "solicitud-pago": "Solicitud de Pago",
};

function friendlyAreaName(area: string): string {
  return AREA_LABELS[area] ?? area;
}

function agruparPorServicio(permisos: string[]): Map<string, Set<string>> {
  const porServicio = new Map<string, Set<string>>();
  for (const permKey of permisos) {
    const [servicio, accion] = permKey.split(".");
    if (!servicio || !accion) continue;
    if (!porServicio.has(servicio)) porServicio.set(servicio, new Set());
    porServicio.get(servicio)!.add(accion);
  }
  return porServicio;
}

function CeldaAcciones({ acciones }: { acciones: Set<string> | undefined }) {
  if (!acciones || acciones.size === 0) {
    return (
      <Typography variant="body2" color="text.secondary" align="center">
        —
      </Typography>
    );
  }
  const presentes = ORDEN_ACCIONES.filter((a) => acciones.has(a));
  return (
    <Tooltip title={presentes.map((a) => NOMBRE_POR_ACCION[a]).join(", ")}>
      <Typography
        variant="body2"
        align="center"
        sx={{ fontFamily: "monospace", letterSpacing: 1, fontWeight: "bold" }}
      >
        {presentes.map((a) => LETRA_POR_ACCION[a]).join("")}
      </Typography>
    </Tooltip>
  );
}

// Celda editable: 4 checkboxes chiquitos (L/C/E/A), uno de-/marcado segun si
// existe el perm_key "<servicio>.<accion>" en el catalogo Y en el rol. Un
// checkbox no aparece clicable si ese perm_key no existe en el catalogo
// completo (no se puede otorgar un permiso que no existe).
function CeldaAccionesEditable({
  servicio,
  role,
  permisoIdPorKey,
  disabled,
  onToggle,
}: {
  servicio: string;
  role: IamRole;
  permisoIdPorKey: Map<string, string>;
  disabled: boolean;
  onToggle: (permissionId: string, checked: boolean) => void;
}) {
  const rolePermSet = new Set(role.permisos);
  return (
    <Stack direction="row" spacing={0} justifyContent="center">
      {ORDEN_ACCIONES.map((accion) => {
        const permKey = `${servicio}.${accion}`;
        const permissionId = permisoIdPorKey.get(permKey);
        if (!permissionId) {
          return <Typography key={accion} variant="caption" sx={{ width: 28 }} />;
        }
        const checked = rolePermSet.has(permKey);
        return (
          <Tooltip key={accion} title={NOMBRE_POR_ACCION[accion]}>
            <Checkbox
              size="small"
              checked={checked}
              disabled={disabled}
              onChange={(e) => onToggle(permissionId, e.target.checked)}
              sx={{ p: 0.5 }}
            />
          </Tooltip>
        );
      })}
    </Stack>
  );
}

export default function MatrizPermisosPage() {
  const [roles, setRoles] = useState<IamRole[]>([]);
  const [permisos, setPermisos] = useState<IamPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [editando, setEditando] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  // Filtro por area/servicio (Fase 1, Semana 5) - [] = sin filtro, se
  // muestran todas las areas. No se filtra en el backend: el catalogo
  // completo (roles + permisos) ya se trae una sola vez, filtrar aqui
  // evita ir y venir al servidor por cada cambio de seleccion.
  const [areasFiltro, setAreasFiltro] = useState<string[]>([]);
  // Filtro por rol (04/Sep/2026, pedido de Mariana: "pon un filtro por
  // rol, como administradores, etc") - mismo patron que areasFiltro:
  // multi-select sobre role_id, [] = sin filtro. Util para aislar, por
  // ejemplo, solo los roles "*_ADMIN"/SUPER_ADMIN en una tabla que ya
  // tiene muchas filas.
  const [rolesFiltro, setRolesFiltro] = useState<string[]>([]);

  // Crear rol nuevo (31/Ago/2026, pedido de Mariana: "super admin debe
  // poder crear roles para colaboradores externos") - antes de esto solo
  // se podian editar los permisos de un rol ya existente en el catalogo.
  const [openNuevoRol, setOpenNuevoRol] = useState(false);
  const [nuevoRoleTipo, setNuevoRoleTipo] = useState<IamRoleTipo>("INTERNO");
  const [nuevoRoleKey, setNuevoRoleKey] = useState("");
  const [nuevoRoleName, setNuevoRoleName] = useState("");
  const [nuevoRoleDesc, setNuevoRoleDesc] = useState("");
  const [creandoRol, setCreandoRol] = useState(false);
  const [errorNuevoRol, setErrorNuevoRol] = useState<string | null>(null);

  // tipo preseleccionado (31/Ago/2026): cada tarjeta (Internos/Externos)
  // tiene su propio boton "Nuevo Rol", ya viene con el tipo correcto - no
  // hace falta elegirlo a mano dentro del dialogo.
  function abrirNuevoRol(tipo: IamRoleTipo) {
    setNuevoRoleTipo(tipo);
    setOpenNuevoRol(true);
  }

  function cerrarNuevoRol() {
    setOpenNuevoRol(false);
    setNuevoRoleKey("");
    setNuevoRoleName("");
    setNuevoRoleDesc("");
    setErrorNuevoRol(null);
  }

  async function handleCrearRol() {
    if (!nuevoRoleKey || !nuevoRoleName) {
      setErrorNuevoRol("Clave y nombre del rol son obligatorios.");
      return;
    }
    setCreandoRol(true);
    setErrorNuevoRol(null);
    try {
      // Convencion del catalogo existente (PLD_ANALISTA, TESORERIA_ANALISTA,
      // etc.): MAYUSCULAS_CON_GUION_BAJO - se normaliza aqui para no
      // depender de que quien lo crea lo escriba bien a mano.
      const roleKey = nuevoRoleKey.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
      await createRole(roleKey, nuevoRoleName, nuevoRoleTipo, nuevoRoleDesc || undefined);
      cerrarNuevoRol();
      // Abre directo en modo edicion para que el admin le otorgue permisos
      // al rol recien creado sin tener que buscar el switch aparte - un rol
      // sin ningun permiso no sirve de nada por si solo.
      setEditando(true);
      cargar();
    } catch (err) {
      setErrorNuevoRol(err instanceof Error ? err.message : "Error al crear el rol");
    } finally {
      setCreandoRol(false);
    }
  }

  function cargar() {
    setLoading(true);
    setError(null);
    Promise.all([listRoles(), listPermissions()])
      .then(([rolesData, permisosData]) => {
        setRoles(rolesData);
        setPermisos(permisosData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    getSession().then((s) => {
      setSession(s);
      setActorUserId(s?.user_id ?? null);
    });
  }, []);

  // IamRoleViewSet.get_permissions: otorgar_permiso/revocar_permiso
  // requieren iam.editar (grantRolePermission/revokeRolePermission usan
  // el mismo endpoint - ver views.py, no hay iam.crear distinto aqui).
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;
  // Crear un rol nuevo requiere iam.crear (ver IamRoleViewSet.get_permissions,
  // mismo criterio que otorgar un rol a un usuario en RoleAssignmentDialog).
  const puedeCrearRol = session?.perm_keys.includes("iam.crear") ?? false;

  // Columnas = servicios distintos presentes en el catalogo completo de
  // permisos (no solo los que algun rol ya tiene), ordenados alfabeticamente.
  const todasLasAreas = Array.from(new Set(permisos.map((p) => p.perm_key.split(".")[0]))).sort();
  const servicios = areasFiltro.length > 0 ? todasLasAreas.filter((a) => areasFiltro.includes(a)) : todasLasAreas;

  const permisoIdPorKey = new Map(permisos.map((p) => [p.perm_key, p.permission_id]));

  // Con filtro activo, se ocultan los roles que no tengan ningun permiso
  // en ninguna de las areas elegidas - de otro modo quedarian filas con
  // puros "—", ruido sin informacion util para lo que se esta buscando.
  // En modo edicion se muestran todos los roles igual (podrias querer
  // OTORGAR el primer permiso de esa area a un rol que hoy no tiene nada).
  // Internos vs Externos (31/Ago/2026, pedido de Mariana: "en matriz de
  // permisos hay que dividir entre internos y externos") - misma
  // convencion visual que /admin/invitaciones (Temporales/Colaboradores).
  const [tipoTab, setTipoTab] = useState<IamRoleTipo>("INTERNO");

  const rolesVisibles = (
    areasFiltro.length > 0 && !editando
      ? roles.filter((role) => role.permisos.some((permKey) => areasFiltro.includes(permKey.split(".")[0])))
      : roles
  )
    .filter((role) => role.tipo === tipoTab)
    .filter((role) => rolesFiltro.length === 0 || rolesFiltro.includes(role.role_id));

  function handleRolesChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value;
    setRolesFiltro(typeof value === "string" ? value.split(",") : value);
  }

  function handleAreasChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value;
    setAreasFiltro(typeof value === "string" ? value.split(",") : value);
  }

  // Desactivar/reactivar (soft-delete) - separado de handleToggle porque
  // no toca la matriz de permisos, solo IamRole.activo. Menu de 3 puntos
  // (31/Ago/2026, pedido de Mariana) en vez de un boton ancho aparte -
  // mas compacto, no necesita columna propia.
  const [cambiandoActivo, setCambiandoActivo] = useState<string | null>(null);
  const [menuRoleId, setMenuRoleId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  async function handleToggleActivo(role: IamRole) {
    setCambiandoActivo(role.role_id);
    setError(null);
    try {
      const actualizado = role.activo ? await deactivateRole(role.role_id) : await activateRole(role.role_id);
      setRoles((prev) => prev.map((r) => (r.role_id === role.role_id ? actualizado : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCambiandoActivo(null);
    }
  }

  // Borrado real (31/Ago/2026) - el backend rechaza (400) si el rol tiene
  // alguna asignacion activa; ese mensaje llega tal cual a `error`, ya le
  // dice al admin que use "Desactivar" en su lugar.
  async function handleBorrarRol(role: IamRole) {
    if (!window.confirm(`¿Borrar el rol "${role.role_name}" de verdad? No se puede deshacer.`)) return;
    setCambiandoActivo(role.role_id);
    setError(null);
    try {
      await deleteRole(role.role_id);
      setRoles((prev) => prev.filter((r) => r.role_id !== role.role_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCambiandoActivo(null);
    }
  }

  async function handleToggle(role: IamRole, permissionId: string, checked: boolean) {
    if (!actorUserId) return;
    const toggleKey = `${role.role_id}:${permissionId}`;
    setSaving(toggleKey);
    setError(null);
    // Actualizacion optimista sobre la lista de roles en memoria - evita
    // recargar todo el catalogo por cada click.
    const permKey = permisos.find((p) => p.permission_id === permissionId)?.perm_key;
    setRoles((prev) =>
      prev.map((r) =>
        r.role_id !== role.role_id
          ? r
          : {
              ...r,
              permisos: checked
                ? [...r.permisos, permKey!].filter((v, i, arr) => arr.indexOf(v) === i)
                : r.permisos.filter((p) => p !== permKey),
            }
      )
    );
    try {
      if (checked) {
        await grantRolePermission(role.role_id, permissionId, actorUserId);
      } else {
        await revokeRolePermission(role.role_id, permissionId, actorUserId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      cargar(); // revertir el optimismo si fallo
    } finally {
      setSaving(null);
    }
  }

  return (
    <AppShell>
      {/* 31/Ago/2026 (pedido de Mariana: "quiero que se vea asi") - titulo
      solo a la izquierda; TODO lo demas (caja, Área, Nuevo Rol, Modo
      edicion) agrupado en un solo bloque que envuelve junto como unidad -
      antes cada uno envolvia por separado y quedaba chueco. */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "flex-start", md: "center" }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">Matriz de Permisos</Typography>

        {/* flex:1 + justifyContent center (31/Ago/2026, pedido de Mariana:
        "no esta centrado") - antes esto quedaba pegado a la derecha por
        el space-between del Stack padre; ahora usa el espacio sobrante
        junto al titulo y centra el grupo dentro de el. */}
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          justifyContent="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ flex: 1 }}
        >
          {/* 31/Ago/2026 (pedido de Mariana: "interno y externo se ve
          diferente") - la caja ya NO cambia de tamaño entre pestañas (antes
          le crecia una linea extra en Externos, corriendo toda la fila).
          El aviso de "nunca GLOBAL" vive aparte, debajo de las Tabs. */}
          <Paper variant="outlined" sx={{ p: 2, textAlign: "center", display: "inline-block" }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {editando
                ? "Modo edición: marca o desmarca una acción para otorgar/revocar ese permiso al rol."
                : "Permisos otorgados a cada rol, agrupados por servicio."}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: "bold" }}>
              L = leer, C = crear, E = editar, A = aprobar/autorizar.
            </Typography>
          </Paper>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="area-filter-label">Área</InputLabel>
            <Select
              labelId="area-filter-label"
              label="Área"
              multiple
              value={areasFiltro}
              onChange={handleAreasChange}
              renderValue={(selected) =>
                selected.length > 0 ? selected.map(friendlyAreaName).join(", ") : "Todas"
              }
            >
              {todasLasAreas.map((area) => (
                <MenuItem key={area} value={area}>
                  <Checkbox size="small" checked={areasFiltro.includes(area)} />
                  <ListItemText primary={friendlyAreaName(area)} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Filtro por rol (04/Sep/2026, pedido de Mariana: "pon un filtro
          por rol, como administradores, etc") - mismo patron que el filtro
          de Área; las opciones son los roles de la pestaña activa
          (Internos/Externos), asi no se puede elegir un rol que ya no se
          esta viendo. */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="rol-filter-label">Rol</InputLabel>
            <Select
              labelId="rol-filter-label"
              label="Rol"
              multiple
              value={rolesFiltro}
              onChange={handleRolesChange}
              renderValue={(selected) => {
                if (selected.length === 0) return "Todos";
                return roles
                  .filter((r) => selected.includes(r.role_id))
                  .map((r) => r.role_name)
                  .join(", ");
              }}
            >
              {roles
                .filter((r) => r.tipo === tipoTab)
                .map((role) => (
                  <MenuItem key={role.role_id} value={role.role_id}>
                    <Checkbox size="small" checked={rolesFiltro.includes(role.role_id)} />
                    <ListItemText primary={role.role_name} />
                  </MenuItem>
                ))}
            </Select>
          </FormControl>

          {/* Solo en modo edicion (31/Ago/2026, pedido de Mariana) - mismo
          criterio que los checkboxes de permisos y el menu de 3 puntos, que
          tampoco aparecen fuera de modo edicion. */}
          {puedeCrearRol && editando && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={16} strokeWidth={1.5} />}
              onClick={() => abrirNuevoRol(tipoTab)}
              sx={{ whiteSpace: "nowrap" }}
            >
              Nuevo Rol {tipoTab === "EXTERNO" ? "externo" : "interno"}
            </Button>
          )}
          {/* A diferencia del resto de la app (boton visible pero
          deshabilitado), este switch no tiene sentido ni mostrarlo a quien
          no tiene iam.editar: "activarlo" no hace nada por si mismo (los
          checkboxes de adentro ya estaban deshabilitados, ver puedeEditar
          mas abajo), pero visualmente parecia que SI se podia entrar a
          "modo edicion" - confuso para un rol de solo lectura (hallazgo
          11/Ago/2026, PLD_ANALISTA). Se oculta en vez de deshabilitar. */}
          {puedeEditar && (
            <FormControlLabel
              control={<Switch checked={editando} onChange={(e) => setEditando(e.target.checked)} />}
              label="Modo edición"
              sx={{ whiteSpace: "nowrap" }}
            />
          )}
        </Stack>
      </Stack>

      <Tabs
        value={tipoTab}
        onChange={(_e, v) => setTipoTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 3 }}
      >
        <Tab label={`Internos (${roles.filter((r) => r.tipo === "INTERNO").length})`} value="INTERNO" />
        <Tab label={`Externos (${roles.filter((r) => r.tipo === "EXTERNO").length})`} value="EXTERNO" />
      </Tabs>

      {editando && !actorUserId && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          No se pudo confirmar tu sesión — no podrás otorgar/revocar permisos hasta recargar la página.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ width: "auto" }}>
            <TableHead>
              <TableRow>
                <TableCell
                  rowSpan={editando ? 2 : 1}
                  sx={{ minWidth: 200, width: 200, fontWeight: 600, verticalAlign: "bottom" }}
                >
                  Rol
                </TableCell>
                {servicios.map((servicio) => (
                  <TableCell
                    key={servicio}
                    align="center"
                    colSpan={editando ? 1 : undefined}
                    sx={{ minWidth: editando ? 150 : 90, width: editando ? 150 : 90 }}
                  >
                    {friendlyAreaName(servicio)}
                  </TableCell>
                ))}
              </TableRow>
              {editando && (
                <TableRow>
                  {servicios.map((servicio) => (
                    <TableCell key={servicio} align="center" sx={{ py: 0.5 }}>
                      <Stack direction="row" spacing={0} justifyContent="center">
                        {ORDEN_ACCIONES.map((accion) => (
                          <Typography
                            key={accion}
                            variant="caption"
                            sx={{ width: 28, fontWeight: 700, color: "text.secondary" }}
                          >
                            {LETRA_POR_ACCION[accion]}
                          </Typography>
                        ))}
                      </Stack>
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={servicios.length + 1} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : rolesVisibles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={servicios.length + 1} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {areasFiltro.length > 0
                        ? "Ningún rol tiene permisos en las áreas seleccionadas."
                        : "Sin roles."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rolesVisibles.map((role) => {
                  const porServicio = agruparPorServicio(role.permisos);
                  return (
                    <TableRow key={role.role_id} hover sx={{ opacity: role.activo ? 1 : 0.6 }}>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Stack sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {role.role_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {role.role_key}
                            </Typography>
                            {!role.activo && (
                              <Chip size="small" label="Inactivo" color="default" sx={{ mt: 0.5, alignSelf: "flex-start" }} />
                            )}
                          </Stack>
                          {/* Menu de 3 puntos (31/Ago/2026, pedido de Mariana:
                          "usa los tres puntos a un lado de la columna de rol")
                          - solo en modo edicion, mismo criterio que los
                          checkboxes de permisos. */}
                          {puedeEditar && editando && (
                            <IconButton
                              size="small"
                              disabled={cambiandoActivo === role.role_id}
                              onClick={(e) => {
                                setMenuAnchor(e.currentTarget);
                                setMenuRoleId(role.role_id);
                              }}
                            >
                              {cambiandoActivo === role.role_id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <MoreVertical size={16} strokeWidth={1.5} />
                              )}
                            </IconButton>
                          )}
                        </Stack>
                      </TableCell>
                      {servicios.map((servicio) =>
                        editando ? (
                          <TableCell key={servicio}>
                            <CeldaAccionesEditable
                              servicio={servicio}
                              role={role}
                              permisoIdPorKey={permisoIdPorKey}
                              disabled={!actorUserId || saving !== null || !puedeEditar}
                              onToggle={(permissionId, checked) => handleToggle(role, permissionId, checked)}
                            />
                          </TableCell>
                        ) : (
                          <TableCell key={servicio}>
                            <CeldaAcciones acciones={porServicio.get(servicio)} />
                          </TableCell>
                        )
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            const role = roles.find((r) => r.role_id === menuRoleId);
            setMenuAnchor(null);
            if (role) handleToggleActivo(role);
          }}
        >
          {roles.find((r) => r.role_id === menuRoleId)?.activo ? "Desactivar" : "Reactivar"}
        </MenuItem>
        {/* Borrado real (31/Ago/2026) - el backend lo rechaza si el rol
        tiene alguna asignacion activa, ahi es cuando toca usar
        "Desactivar" en su lugar. */}
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            const role = roles.find((r) => r.role_id === menuRoleId);
            setMenuAnchor(null);
            if (role) handleBorrarRol(role);
          }}
        >
          Borrar
        </MenuItem>
      </Menu>

      <Dialog open={openNuevoRol} onClose={cerrarNuevoRol} fullWidth maxWidth="xs">
        <DialogTitle>Nuevo Rol</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Se crea sin permisos. Después de guardarlo se abre el modo edición para que le
              otorgues exactamente los permisos que necesita.
              {nuevoRoleTipo === "EXTERNO" &&
                " Al asignarlo a alguien, va a exigir acotarlo a una Sociedad y un Proyecto — nunca alcance GLOBAL."}
            </Typography>
            {errorNuevoRol && <Alert severity="error">{errorNuevoRol}</Alert>}
            {/* Editable dentro del dialogo (31/Ago/2026, pedido de Mariana:
            "al crear un nuevo rol que este la parte si es interno o
            externo") - el boton que lo abrio solo lo preselecciona segun
            la pestaña activa, aqui se puede cambiar antes de guardar. */}
            <FormControl size="small" fullWidth>
              <InputLabel id="nuevo-rol-tipo-label">Tipo</InputLabel>
              <Select
                labelId="nuevo-rol-tipo-label"
                label="Tipo"
                value={nuevoRoleTipo}
                onChange={(e) => setNuevoRoleTipo(e.target.value as IamRoleTipo)}
              >
                <MenuItem value="INTERNO">Interno</MenuItem>
                <MenuItem value="EXTERNO">Externo</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Nombre del rol"
              placeholder="Ej. PLD Externo"
              value={nuevoRoleName}
              onChange={(e) => setNuevoRoleName(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Clave interna"
              placeholder="Ej. PLD_EXTERNO"
              helperText="Se normaliza a MAYÚSCULAS_CON_GUIÓN_BAJO automáticamente."
              value={nuevoRoleKey}
              onChange={(e) => setNuevoRoleKey(e.target.value)}
              fullWidth
            />
            <TextField
              label="Descripción (opcional)"
              value={nuevoRoleDesc}
              onChange={(e) => setNuevoRoleDesc(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrarNuevoRol}>Cancelar</Button>
          <Button variant="contained" onClick={handleCrearRol} disabled={creandoRol}>
            {creandoRol ? <CircularProgress size={20} color="inherit" /> : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
