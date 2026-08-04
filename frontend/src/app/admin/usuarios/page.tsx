"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Avatar,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Pencil, Search } from "lucide-react";
import AppShell, { notifySinRolChanged } from "@/components/AppShell";
import RoleAssignmentDialog from "@/components/RoleAssignmentDialog";
import { IamGroup, IamRole, IamUser, listGroups, listRoles, listUsers } from "@/lib/iam";

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

export default function DirectorioUsuariosPage() {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managingUser, setManagingUser] = useState<IamUser | null>(null);

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
      sinRol,
    }).then(setUsers);
    // Asignar/revocar un rol puede cambiar quien aparece en "sin rol
    // asignado" - se lo hacemos saber a la campana de AppShell.tsx.
    notifySinRolChanged();
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
        sinRol,
      })
        .then(setUsers)
        .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, status, role, group, sinRol]);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Directorio de usuarios
      </Typography>
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
            <MenuItem value="DELETED">Eliminado</MenuItem>
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
                <TableCell>Empresa</TableCell>
                <TableCell>Roles</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin resultados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.user_id} hover>
                    <TableCell sx={{ width: 40 }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: "#1C75BC", fontSize: 12 }}>
                        {(user.display_name || user.primary_email).charAt(0).toUpperCase()}
                      </Avatar>
                    </TableCell>
                    <TableCell>{user.display_name || "—"}</TableCell>
                    <TableCell>{user.primary_email}</TableCell>
                    <TableCell>
                      <Chip size="small" label={STATUS_LABELS[user.status]} color={STATUS_COLORS[user.status]} />
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5} alignItems="center">
                        {user.roles.length > 0 ? (
                          user.roles.map((roleKey) => (
                            <Chip key={roleKey} size="small" variant="outlined" label={roleKey} />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Sin rol
                          </Typography>
                        )}
                        <IconButton size="small" aria-label="Gestionar roles" onClick={() => setManagingUser(user)}>
                          <Pencil size={13} strokeWidth={1.5} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

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
    </AppShell>
  );
}
