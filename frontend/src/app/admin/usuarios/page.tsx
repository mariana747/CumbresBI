"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Chip,
  CircularProgress,
  FormControl,
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
import { Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { IamRole, IamUser, listRoles, listUsers } from "@/lib/iam";

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
// Trabajo_y_Cronograma.md Semana 6): busqueda y filtro por estado sobre
// iam_users. Desactivar/reactivar (escritura) sigue pendiente - el endpoint
// de iam-service es solo lectura por ahora (ver iam/views.py).
export default function DirectorioUsuariosPage() {
  const [users, setUsers] = useState<IamUser[]>([]);
  const [roles, setRoles] = useState<IamRole[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRoles().catch(() => undefined /* filtro de rol es opcional, no bloquea el directorio */)
      .then((data) => data && setRoles(data));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      listUsers({ search: search || undefined, status: status || undefined, role: role || undefined })
        .then(setUsers)
        .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, status, role]);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Directorio de usuarios
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Usuarios registrados en iam-service. Búsqueda por correo/nombre y
        filtro por estado.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
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
          <Select labelId="role-filter-label" label="Rol" value={role} onChange={(e) => setRole(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            {roles.map((r) => (
              <MenuItem key={r.role_key} value={r.role_key}>
                {r.role_name}
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
                <TableCell>Roles</TableCell>
                <TableCell>Modo de acceso</TableCell>
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
                      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
                        {user.roles.length > 0 ? (
                          user.roles.map((roleKey) => (
                            <Chip key={roleKey} size="small" variant="outlined" label={roleKey} />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Sin rol
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{user.access_mode === "STANDARD" ? "Estándar" : "Restringido"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </AppShell>
  );
}
