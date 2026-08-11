"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  IamPermission,
  IamRole,
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
  "pld-compliance": "PLD / Compliance",
  "ventas-vivienda": "Ventas / Vivienda",
  materiales: "Materiales",
  rentas: "Rentas",
  tesoreria: "Tesorería",
  "facturacion-cfdi": "Facturación CFDI",
  compras: "Compras",
  rrhh: "RRHH",
  tickets: "Tickets",
  audit: "Auditoría",
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
  const rolesVisibles =
    areasFiltro.length > 0 && !editando
      ? roles.filter((role) => role.permisos.some((permKey) => areasFiltro.includes(permKey.split(".")[0])))
      : roles;

  function handleAreasChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value;
    setAreasFiltro(typeof value === "string" ? value.split(",") : value);
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5">Matriz de permisos</Typography>
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
          />
        )}
      </Stack>

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

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ mb: 3 }}
        alignItems="center"
        justifyContent="center"
        flexWrap="wrap"
      >
        <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {editando
              ? "Modo edición: marca o desmarca una acción para otorgar/revocar ese permiso al rol."
              : "Permisos otorgados a cada rol, agrupados por servicio."}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: "bold" }}>
            L = leer, C = crear, E = editar, A = aprobar/autorizar.
          </Typography>
        </Paper>

        <FormControl size="small" sx={{ minWidth: 260 }}>
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
      </Stack>

      <Stack direction="row" justifyContent="center">
      <Paper variant="outlined" sx={{ display: "inline-block", maxWidth: "100%" }}>
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
                    <TableRow key={role.role_id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {role.role_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {role.role_key}
                        </Typography>
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
      </Stack>
    </AppShell>
  );
}
