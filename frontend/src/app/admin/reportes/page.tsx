"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AppShell from "@/components/AppShell";
import { IamUser, IamUserRole, listRoleHistory, listUsers } from "@/lib/iam";

// Reportes de IAM (Fase 1, Semana 6). Dos vistas, ambas ya cubiertas por
// endpoints existentes de iam-service - no hace falta backend nuevo:
// - Historial de cambios de roles: GET /api/user-roles/ sin filtro (ver
//   iam/views.py, IamUserRoleViewSet - "esta misma lista, sin el filtro
//   ?user=, ya es el historial completo").
// - Matriz de acceso: campo "accesos" de GET /api/users/ (usuario x rol x
//   alcance de cada asignacion activa).
const SUB_REPORTES = [
  { label: "Historial de cambios de roles", value: "historial" },
  { label: "Matriz de acceso", value: "matriz" },
] as const;

const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: "Global",
  SOCIEDAD: "Sociedad",
  PROYECTO: "Proyecto",
};

function HistorialCambios() {
  const [historial, setHistorial] = useState<IamUserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listRoleHistory()
      .then(setHistorial)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
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
                <TableCell>Usuario</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Alcance</TableCell>
                <TableCell>Otorgado</TableCell>
                <TableCell>Revocado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : historial.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin cambios de roles registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                historial.map((cambio) => (
                  <TableRow key={cambio.assignment_id} hover>
                    <TableCell>{cambio.user_email}</TableCell>
                    <TableCell>{cambio.role_name}</TableCell>
                    <TableCell>
                      {SCOPE_LABELS[cambio.scope_type] ?? cambio.scope_type}
                      {cambio.scope_id !== "*" ? ` (${cambio.scope_id})` : ""}
                    </TableCell>
                    <TableCell>{new Date(cambio.granted_at).toLocaleString("es-MX")}</TableCell>
                    <TableCell>
                      {cambio.revoked_at ? (
                        new Date(cambio.revoked_at).toLocaleString("es-MX")
                      ) : (
                        <Chip size="small" color="success" label="Vigente" />
                      )}
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

function MatrizAcceso() {
  const [users, setUsers] = useState<IamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
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
                <TableCell>Usuario</TableCell>
                <TableCell>Accesos activos (rol · alcance)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin usuarios.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.user_id} hover>
                    <TableCell>{user.display_name || user.primary_email}</TableCell>
                    <TableCell>
                      <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
                        {user.accesos.length > 0 ? (
                          user.accesos.map((acceso, i) => (
                            <Chip
                              key={`${acceso.role_key}-${i}`}
                              size="small"
                              variant="outlined"
                              label={`${acceso.role_name} · ${SCOPE_LABELS[acceso.scope_type] ?? acceso.scope_type}${
                                acceso.scope_id !== "*" ? ` (${acceso.scope_id})` : ""
                              }`}
                            />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Sin accesos
                          </Typography>
                        )}
                      </Stack>
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

export default function ReportesPage() {
  const [subReporte, setSubReporte] = useState<(typeof SUB_REPORTES)[number]["value"]>("historial");

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Reportes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Reportes de IAM sobre roles y permisos. Solo lectura.
      </Typography>

      <Tabs
        value={subReporte}
        onChange={(_, value) => setSubReporte(value)}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {SUB_REPORTES.map((tab) => (
          <Tab key={tab.value} label={tab.label} value={tab.value} />
        ))}
      </Tabs>

      {subReporte === "historial" ? <HistorialCambios /> : <MatrizAcceso />}
    </AppShell>
  );
}
