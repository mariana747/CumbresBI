"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Ban, Building2, Clock, PencilLine, RotateCcw, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import AppShell, { notifySinRolChanged } from "@/components/AppShell";
import EmpresaAssignmentDialog from "@/components/EmpresaAssignmentDialog";
import RoleAssignmentDialog from "@/components/RoleAssignmentDialog";
import { getSession, SessionUser } from "@/lib/auth";
import {
  IamExternalCollaborator,
  IamGroup,
  IamInvitation,
  IamRole,
  IamUser,
  deleteUser,
  listExternalCollaborators,
  listGroups,
  listInvitations,
  listRoles,
  listUsers,
  reactivateUser,
  revokeExternalCollaborator,
  suspendUser,
  revokeInvitation,
  scopeChipColor,
} from "@/lib/iam";

const STATUS_LABELS: Record<IamUser["status"], string> = {
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  DELETED: "Eliminado",
};

const STATUS_COLORS: Record<IamUser["status"], "success" | "warning" | "default"> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  DELETED: "default",
};

// Tipo de colaborador segun access_mode (ver iam/models.py, IamUser):
// STANDARD = interno (login con Google Workspace, alta via IamInvitation
// o ya existente), RESTRICTED = externo sin Workspace (alta via
// IamExternalCollaborator, ver /admin/invitaciones pestaña "Externos sin
// Workspace"). No es lo mismo que IamMagicLink (ese no crea IamUser).
const ACCESS_MODE_LABELS: Record<IamUser["access_mode"], string> = {
  STANDARD: "Interno",
  RESTRICTED: "Externo",
};

const ACCESS_MODE_COLORS: Record<IamUser["access_mode"], "default" | "info"> = {
  STANDARD: "default",
  RESTRICTED: "info",
};

// Directorio de usuarios (Fase 1, docs/architecture/CumbresBI_V2_Plan_de_
// Trabajo_y_Cronograma.md Semana 6): busqueda y filtro por estado/rol/
// empresa sobre iam_users. "Empresa" = IamGroup (se nombra como la razon
// social del colaborador, ej. "CUMBRES") - ver iam/views.py. El filtro de
// holding (GeneralGrupo) se quito por ser redundante con este, confirmado
// por el cliente.
// Desactivar/reactivar (escritura) sigue pendiente - el endpoint de
// iam-service es solo lectura para ese campo por ahora.
// Valor especial del selector de Rol para "sin rol asignado" - vive en el
// mismo dropdown que los roles reales en vez de un filtro aparte (decision
// de producto: acceso de empleados nuevos via login libre, no invitacion
// formal - ver memoria de sesion "iam-invitacion-alcance-incierto").
const SIN_ROL_VALUE = "__SIN_ROL__";

// useSearchParams() obliga a envolver en Suspense para el build de
// produccion (next build intenta pre-renderizar la pagina; sin este
// boundary, falla con "useSearchParams() should be wrapped in a suspense
// boundary" - descubierto al armar el pipeline de Cloud Run, ver
// docs/CumbresBI_estado.md).
export default function DirectorioUsuariosPage() {
  return (
    <Suspense fallback={null}>
      <DirectorioUsuariosPageContent />
    </Suspense>
  );
}

// Dividido en apartados (14/Ago/2026, pedido explicito): "Directorio"
// (usuarios reales, IamUser ya existente), "Pendientes" (invitaciones
// Workspace sin aceptar + accesos externos sin canjear todavia - ninguno
// de los dos tiene el mismo peso que un usuario real) y "Suspendidos"
// (usuarios reales con status=SUSPENDED - se les desactivan sus funciones,
// ver gate en auth_views.py, y necesitan un boton de reactivar explicito).
function DirectorioUsuariosPageContent() {
  const [tab, setTab] = useState(0);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Usuarios
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<Users size={16} strokeWidth={1.5} />} iconPosition="start" label="Directorio" />
        <Tab icon={<Clock size={16} strokeWidth={1.5} />} iconPosition="start" label="Pendientes" />
        <Tab icon={<Ban size={16} strokeWidth={1.5} />} iconPosition="start" label="Suspendidos" />
      </Tabs>

      <Box role="tabpanel" hidden={tab !== 0}>
        {tab === 0 && <DirectorioUsuariosContent session={session} />}
      </Box>
      <Box role="tabpanel" hidden={tab !== 1}>
        {tab === 1 && <PendientesTab session={session} />}
      </Box>
      <Box role="tabpanel" hidden={tab !== 2}>
        {tab === 2 && <SuspendidosTab session={session} />}
      </Box>
    </AppShell>
  );
}

function DirectorioUsuariosContent({ session }: { session: SessionUser | null }) {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<IamUser[]>([]);
  const [roles, setRoles] = useState<IamRole[]>([]);
  const [groups, setGroups] = useState<IamGroup[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  // "" = todos, SIN_ROL_VALUE = sin rol asignado, o un role_key real.
  const [roleFilter, setRoleFilter] = useState(
    searchParams.get("sinRol") === "true" ? SIN_ROL_VALUE : ""
  );
  const [group, setGroup] = useState("");
  const [accessMode, setAccessMode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managingUser, setManagingUser] = useState<IamUser | null>(null);
  const [managingEmpresaUser, setManagingEmpresaUser] = useState<IamUser | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<IamUser | null>(null);
  const [confirmandoSuspender, setConfirmandoSuspender] = useState<IamUser | null>(null);
  // Menu unificado de "Editar" por fila (14/Ago/2026, pedido explicito:
  // antes habia un lapiz suelto en Empresa, otro en Roles y un boton de
  // eliminar aparte en Acciones - ahora un solo boton abre las 3 acciones
  // juntas). menuAnchor+menuUser van de la mano: cual fila esta abierta.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuUser, setMenuUser] = useState<IamUser | null>(null);

  function cerrarMenu() {
    setMenuAnchor(null);
    setMenuUser(null);
  }

  // Mismo criterio de permiso que RoleAssignmentDialog/EmpresaAssignmentDialog
  // (iam.editar) - eliminar un usuario es tan "editar" como cambiarle el rol.
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;

  const sinRol = roleFilter === SIN_ROL_VALUE;
  const role = sinRol ? "" : roleFilter;

  // Si ya estamos en esta pantalla y se navega otra vez a
  // /admin/usuarios?sinRol=true (ej. desde la campana en AppShell.tsx),
  // Next.js no vuelve a montar el componente - el useState de arriba solo
  // lee la URL una vez al montar. Este efecto sincroniza el filtro cada
  // vez que cambian los parametros de la URL, sin depender del montaje.
  useEffect(() => {
    if (searchParams.get("sinRol") === "true") setRoleFilter(SIN_ROL_VALUE);
  }, [searchParams]);

  function refreshUsers() {
    listUsers({
      search: search || undefined,
      status: status || undefined,
      role: role || undefined,
      group: group || undefined,
      accessMode: accessMode || undefined,
      sinRol,
    }).then(setUsers);
    // Asignar/revocar un rol puede cambiar quien aparece en "sin rol
    // asignado" - se lo hacemos saber a la campana de AppShell.tsx.
    notifySinRolChanged();
  }

  // Confirmar en un dialogo propio en vez de window.confirm() (14/Ago/2026,
  // pedido explicito de un "seguro" antes de eliminar) - un confirm()
  // nativo del navegador es facil de tronar sin querer con Enter/doble
  // clic y no explica la consecuencia (revocar roles) con el mismo detalle
  // que un dialogo real.
  async function confirmarEliminar() {
    if (!confirmandoEliminar) return;
    const user = confirmandoEliminar;
    setConfirmandoEliminar(null);
    setEliminando(user.user_id);
    setError(null);
    try {
      await deleteUser(user.user_id, session?.user_id);
      refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setEliminando(null);
    }
  }

  async function handleReactivar(user: IamUser) {
    setEliminando(user.user_id); // reusa el mismo indicador de "fila ocupada"
    setError(null);
    try {
      await reactivateUser(user.user_id, session?.user_id);
      refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reactivar");
    } finally {
      setEliminando(null);
    }
  }

  // Suspender (14/Ago/2026, pedido explicito): a un colaborador Workspace
  // ya aceptado no se le puede revocar la invitacion (ver
  // IamInvitationViewSet.revocar) - esta es la forma real de cortarle el
  // acceso, reversible desde la pestaña "Suspendidos". Mismo criterio de
  // confirmar en dialogo propio que eliminar (pedido explicito).
  async function confirmarSuspender() {
    if (!confirmandoSuspender) return;
    const user = confirmandoSuspender;
    setConfirmandoSuspender(null);
    setEliminando(user.user_id);
    setError(null);
    try {
      await suspendUser(user.user_id, session?.user_id);
      refreshUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al suspender");
    } finally {
      setEliminando(null);
    }
  }

  useEffect(() => {
    listRoles().catch(() => undefined /* filtros opcionales, no bloquean el directorio */).then((data) => data && setRoles(data));
    listGroups().catch(() => undefined).then((data) => data && setGroups(data));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      listUsers({
        search: search || undefined,
        status: status || undefined,
        role: role || undefined,
        group: group || undefined,
        accessMode: accessMode || undefined,
        sinRol,
      })
        .then(setUsers)
        .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, status, role, group, accessMode, sinRol]);

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Usuarios registrados en iam-service. Búsqueda por correo/nombre y
        filtros por estado, rol y empresa.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Buscar por correo o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 360 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} strokeWidth={1.5} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="status-filter-label">Estado</InputLabel>
          <Select
            labelId="status-filter-label"
            label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="ACTIVE">Activo</MenuItem>
            <MenuItem value="SUSPENDED">Suspendido</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="role-filter-label">Rol</InputLabel>
          <Select
            labelId="role-filter-label"
            label="Rol"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value={SIN_ROL_VALUE}>
              <em>Sin rol asignado</em>
            </MenuItem>
            {roles.map((r) => (
              <MenuItem key={r.role_key} value={r.role_key}>
                {r.role_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="group-filter-label">Empresa</InputLabel>
          <Select labelId="group-filter-label" label="Empresa" value={group} onChange={(e) => setGroup(e.target.value)}>
            <MenuItem value="">Todas</MenuItem>
            {groups.map((g) => (
              <MenuItem key={g.group_id} value={g.group_id}>
                {g.alias || g.nombre}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="access-mode-filter-label">Tipo</InputLabel>
          <Select
            labelId="access-mode-filter-label"
            label="Tipo"
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="STANDARD">Interno</MenuItem>
            <MenuItem value="RESTRICTED">Externo</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Correo</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Empresa</TableCell>
                <TableCell>Roles</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin resultados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.user_id} hover>
                    <TableCell sx={{ width: 40 }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: "primary.main", fontSize: 12 }}>
                        {(user.display_name || user.primary_email).charAt(0).toUpperCase()}
                      </Avatar>
                    </TableCell>
                    <TableCell>{user.display_name || "—"}</TableCell>
                    <TableCell>{user.primary_email}</TableCell>
                    <TableCell>
                      <Chip size="small" label={STATUS_LABELS[user.status]} color={STATUS_COLORS[user.status]} />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={ACCESS_MODE_LABELS[user.access_mode]}
                        color={ACCESS_MODE_COLORS[user.access_mode]}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5} alignItems="center">
                        {user.empresas.length > 0 ? (
                          user.empresas.map((e) => (
                            <Typography key={e.nombre} variant="body2">
                              {e.nombre}
                            </Typography>
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Sin empresa
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5} alignItems="center">
                        {user.accesos.length > 0 ? (
                          user.accesos.map((acceso, i) => (
                            <Chip
                              key={`${acceso.role_key}-${i}`}
                              size="small"
                              color={scopeChipColor(acceso.scope_type)}
                              label={
                                acceso.scope_type === "GLOBAL"
                                  ? acceso.role_key
                                  : `${acceso.role_key} · ${acceso.scope_id}`
                              }
                            />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Sin rol
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        aria-label="Editar usuario"
                        onClick={(e) => {
                          setMenuAnchor(e.currentTarget);
                          setMenuUser(user);
                        }}
                      >
                        <PencilLine size={14} strokeWidth={1.5} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={cerrarMenu}>
        <MenuItem
          onClick={() => {
            if (menuUser) setManagingEmpresaUser(menuUser);
            cerrarMenu();
          }}
        >
          <Building2 size={15} strokeWidth={1.5} style={{ marginRight: 10 }} />
          Cambiar empresa
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuUser) setManagingUser(menuUser);
            cerrarMenu();
          }}
        >
          <ShieldCheck size={15} strokeWidth={1.5} style={{ marginRight: 10 }} />
          Gestionar roles
        </MenuItem>
        {menuUser && menuUser.status === "ACTIVE" && (
          <MenuItem
            disabled={!puedeEditar || eliminando === menuUser.user_id}
            onClick={() => {
              const user = menuUser;
              cerrarMenu();
              if (user) setConfirmandoSuspender(user);
            }}
          >
            <Ban size={15} strokeWidth={1.5} style={{ marginRight: 10 }} />
            Suspender usuario
          </MenuItem>
        )}
        {menuUser && menuUser.status === "SUSPENDED" && (
          <MenuItem
            disabled={!puedeEditar || eliminando === menuUser.user_id}
            onClick={() => {
              const user = menuUser;
              cerrarMenu();
              if (user) handleReactivar(user);
            }}
          >
            <RotateCcw size={15} strokeWidth={1.5} style={{ marginRight: 10 }} />
            Reactivar usuario
          </MenuItem>
        )}
        {menuUser && menuUser.status !== "DELETED" && (
          <>
            <Divider />
            <MenuItem
              sx={{ color: "error.main" }}
              disabled={!puedeEditar || eliminando === menuUser.user_id}
              onClick={() => {
                const user = menuUser;
                cerrarMenu();
                if (user) setConfirmandoEliminar(user);
              }}
            >
              <Trash2 size={15} strokeWidth={1.5} style={{ marginRight: 10 }} />
              Eliminar usuario
            </MenuItem>
          </>
        )}
      </Menu>

      {managingUser && (
        <RoleAssignmentDialog
          open={!!managingUser}
          onClose={() => setManagingUser(null)}
          userId={managingUser.user_id}
          userLabel={managingUser.display_name || managingUser.primary_email}
          allRoles={roles}
          onChanged={refreshUsers}
        />
      )}

      {managingEmpresaUser && (
        <EmpresaAssignmentDialog
          open={!!managingEmpresaUser}
          onClose={() => setManagingEmpresaUser(null)}
          userId={managingEmpresaUser.user_id}
          userLabel={managingEmpresaUser.display_name || managingEmpresaUser.primary_email}
          allGroups={groups}
          onChanged={refreshUsers}
        />
      )}

      <Dialog open={!!confirmandoEliminar} onClose={() => setConfirmandoEliminar(null)}>
        <DialogTitle>¿Eliminar usuario?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Vas a eliminar a{" "}
            <strong>
              {confirmandoEliminar?.display_name || confirmandoEliminar?.primary_email}
            </strong>
            . Se revocarán sus roles activos y no podrá volver a iniciar sesión hasta que
            se le invite de nuevo. Esta acción se puede revertir solo desde el backend.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoEliminar(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmarEliminar}>
            Eliminar usuario
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmandoSuspender} onClose={() => setConfirmandoSuspender(null)}>
        <DialogTitle>¿Suspender usuario?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Vas a suspender a{" "}
            <strong>
              {confirmandoSuspender?.display_name || confirmandoSuspender?.primary_email}
            </strong>
            . Se revocarán sus roles activos y no podrá iniciar sesión hasta que lo
            reactives desde la pestaña "Suspendidos".
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoSuspender(null)}>Cancelar</Button>
          <Button color="warning" variant="contained" onClick={confirmarSuspender}>
            Suspender usuario
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// --- Pestaña "Pendientes": invitaciones Workspace sin aceptar + accesos
// externos sin canjear todavia. Ninguno de los dos tiene fila real en el
// Directorio con el mismo peso (IamInvitation ni siquiera crea un IamUser
// hasta que se acepta) - viven aparte para no mezclar "ya es alguien"
// con "todavia no ha hecho nada". Mismas fuentes de datos que la pestaña
// "Colaboradores" de /admin/invitaciones, aqui solo se filtran a lo
// realmente pendiente (sin aceptar/sin canjear) en vez de mostrar todo
// el historial.
type FilaPendiente = {
  key: string;
  tipo: "Workspace" | "Externo";
  email: string;
  invitadoPorEmail: string | null;
  invitadoEl: string;
  onRevocar: () => void;
};

function PendientesTab({ session }: { session: SessionUser | null }) {
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;
  const [invitaciones, setInvitaciones] = useState<IamInvitation[]>([]);
  const [accesos, setAccesos] = useState<IamExternalCollaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);

  function refrescar() {
    setLoading(true);
    Promise.all([listInvitations(), listExternalCollaborators()])
      .then(([invs, accs]) => {
        setInvitaciones(invs.filter((i) => !i.accepted_at && !i.revoked_at));
        setAccesos(accs.filter((a) => !a.last_used_at && !a.revoked_at));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refrescar();
  }, []);

  async function handleRevocarInvitacion(id: string) {
    setRevocando(id);
    setError(null);
    try {
      await revokeInvitation(id);
      refrescar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revocar");
    } finally {
      setRevocando(null);
    }
  }

  async function handleRevocarExterno(id: string) {
    setRevocando(id);
    setError(null);
    try {
      await revokeExternalCollaborator(id);
      refrescar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revocar");
    } finally {
      setRevocando(null);
    }
  }

  const filas: FilaPendiente[] = [
    ...invitaciones.map((inv) => ({
      key: `inv-${inv.invitation_id}`,
      tipo: "Workspace" as const,
      email: inv.email,
      invitadoPorEmail: inv.invited_by_email,
      invitadoEl: inv.invited_at,
      onRevocar: () => handleRevocarInvitacion(inv.invitation_id),
    })),
    ...accesos.map((acc) => ({
      key: `ext-${acc.external_access_id}`,
      tipo: "Externo" as const,
      email: acc.email,
      invitadoPorEmail: acc.invited_by_email,
      invitadoEl: acc.invited_at,
      onRevocar: () => handleRevocarExterno(acc.external_access_id),
    })),
  ].sort((a, b) => new Date(b.invitadoEl).getTime() - new Date(a.invitadoEl).getTime());

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Invitaciones Workspace que aún no se han aceptado (nadie ha iniciado sesión todavía) y
        accesos externos que aún no se han canjeado — ninguno de los dos es un usuario activo
        hasta que la persona entre por primera vez.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Correo</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Invitado por</TableCell>
                <TableCell>Invitado el</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin invitaciones ni accesos pendientes.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filas.map((fila) => (
                  <TableRow key={fila.key} hover>
                    <TableCell>{fila.email}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={fila.tipo}
                        color={fila.tipo === "Externo" ? "info" : "default"}
                      />
                    </TableCell>
                    <TableCell>{fila.invitadoPorEmail ?? "—"}</TableCell>
                    <TableCell>{new Date(fila.invitadoEl).toLocaleString("es-MX")}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={fila.onRevocar}
                        disabled={!puedeEditar || revocando === fila.key.split("-")[1]}
                      >
                        Revocar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
}

// --- Pestaña "Suspendidos": usuarios reales con status=SUSPENDED. Sus
// funciones ya estan desactivadas de verdad (google_callback y
// canjear_acceso_externo en auth_views.py rechazan a cualquiera que no
// este ACTIVE) - esta pestaña es solo para encontrarlos rapido y
// reactivarlos, sin tener que ir a buscar el filtro de Estado en el
// Directorio.
function SuspendidosTab({ session }: { session: SessionUser | null }) {
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;
  const [users, setUsers] = useState<IamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactivando, setReactivando] = useState<string | null>(null);

  function refrescar() {
    setLoading(true);
    listUsers({ status: "SUSPENDED" })
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refrescar();
  }, []);

  async function handleReactivar(user: IamUser) {
    setReactivando(user.user_id);
    setError(null);
    try {
      await reactivateUser(user.user_id, session?.user_id);
      refrescar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reactivar");
    } finally {
      setReactivando(null);
    }
  }

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Usuarios suspendidos no pueden iniciar sesión ni canjear su acceso hasta que se
        reactiven aquí. Si la suspensión vino de revocar un acceso externo, reactivar solo
        les devuelve el login — el enlace en sí necesita "Reenviar" desde Invitaciones.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Correo</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin usuarios suspendidos.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.user_id} hover>
                    <TableCell>{user.display_name || "—"}</TableCell>
                    <TableCell>{user.primary_email}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={ACCESS_MODE_LABELS[user.access_mode]}
                        color={ACCESS_MODE_COLORS[user.access_mode]}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<RotateCcw size={14} strokeWidth={1.5} />}
                        onClick={() => handleReactivar(user)}
                        disabled={!puedeEditar || reactivando === user.user_id}
                      >
                        {reactivando === user.user_id ? <CircularProgress size={14} /> : "Reactivar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
}
