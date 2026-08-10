"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
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
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Download, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { IamUser, IamUserRole, SCOPE_LABELS, listRoleHistory, listUsers, scopeChipColor } from "@/lib/iam";
import {
  BitacoraEvento,
  ENTITY_OPTIONS,
  SERVICE_OPTIONS,
  exportBitacoraCsvUrl,
  friendlyActionName,
  friendlyEntityName,
  friendlyServiceName,
  listBitacora,
} from "@/lib/audit";

// Reportes de IAM (Fase 1, Semana 6). Tres sub-vistas, todas de solo
// lectura y ya cubiertas por endpoints existentes - no hace falta backend
// nuevo:
// - Historial de cambios de roles: GET /api/user-roles/ sin filtro.
// - Matriz de acceso: campo "accesos" de GET /api/users/.
// - Bitácora de auditoría: GET /api/bitacora/ (audit-service) - vivía en su
//   propia pantalla (/admin/auditoria) hasta que se unificó aquí (es "casi
//   lo mismo": otro reporte de solo lectura sobre roles/permisos/acciones,
//   no un modulo aparte) - ver redirect en admin/auditoria/page.tsx.
const SUB_REPORTES = [
  { label: "Historial de cambios de roles", value: "historial" },
  { label: "Matriz de acceso", value: "matriz" },
  { label: "Bitácora de auditoría", value: "auditoria" },
] as const;

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
                      <Chip
                        size="small"
                        color={scopeChipColor(cambio.scope_type)}
                        label={
                          SCOPE_LABELS[cambio.scope_type] ?? cambio.scope_type
                        }
                      />
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
                              color={scopeChipColor(acceso.scope_type)}
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

// Antes vivia en su propia pantalla (/admin/auditoria) - ver nota arriba.
function BitacoraAuditoria() {
  const [eventos, setEventos] = useState<BitacoraEvento[]>([]);
  const [search, setSearch] = useState("");
  const [servicioOrigen, setServicioOrigen] = useState("");
  const [entidad, setEntidad] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorLabels, setActorLabels] = useState<Record<string, string>>({});

  // Resolver actor_user_id contra iam-service - la bitacora no lleva FK
  // cruzada de esquema (ver audit-service/auditoria/models.py), asi que el
  // nombre se busca aparte; si el usuario no existe ahi (ej. datos de seed
  // viejos, o un actor "sin-auth"/"externo" de un Magic Link), se muestra
  // el ID/etiqueta tal cual.
  useEffect(() => {
    listUsers()
      .then((users) => {
        const labels: Record<string, string> = {};
        for (const user of users) {
          labels[user.user_id] = user.display_name || user.primary_email;
        }
        setActorLabels(labels);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      setError(null);
      listBitacora({
        search: search || undefined,
        servicioOrigen: servicioOrigen || undefined,
        entidad: entidad || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      })
        .then(setEventos)
        .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, servicioOrigen, entidad, desde, hasta]);

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Registro inmutable de eventos de todos los microservicios. Solo
        lectura — la bitácora nunca se modifica ni se borra. La columna
        "Registro afectado" identifica el elemento específico sobre el que
        ocurrió el evento (ej. el nombre de un archivo, el correo de un
        usuario, el folio de un expediente) — varía según el tipo de evento.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Buscar por acción/entidad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} strokeWidth={1.5} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="servicio-filter-label">Servicio origen</InputLabel>
          <Select
            labelId="servicio-filter-label"
            label="Servicio origen"
            value={servicioOrigen}
            onChange={(e) => setServicioOrigen(e.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            {SERVICE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="entidad-filter-label">Entidad</InputLabel>
          <Select
            labelId="entidad-filter-label"
            label="Entidad"
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
          >
            <MenuItem value="">Todas</MenuItem>
            {ENTITY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="date"
          label="Desde"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          size="small"
          type="date"
          label="Hasta"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <Button
          variant="outlined"
          startIcon={<Download size={16} strokeWidth={1.5} />}
          component="a"
          href={exportBitacoraCsvUrl({ search, servicioOrigen, entidad, desde, hasta })}
        >
          CSV
        </Button>
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
                <TableCell>Ocurrido</TableCell>
                <TableCell>Servicio</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Acción</TableCell>
                <TableCell>Entidad</TableCell>
                <TableCell>Registro afectado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : eventos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin eventos.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                eventos.map((evento) => (
                  <TableRow key={evento.event_id} hover>
                    <TableCell>{new Date(evento.ocurrido_en).toLocaleString("es-MX")}</TableCell>
                    <TableCell>{friendlyServiceName(evento.servicio_origen)}</TableCell>
                    <TableCell>{actorLabels[evento.actor_user_id] ?? evento.actor_user_id}</TableCell>
                    <TableCell>{friendlyActionName(evento.accion)}</TableCell>
                    <TableCell>{friendlyEntityName(evento.entidad)}</TableCell>
                    <TableCell>{evento.entidad_id}</TableCell>
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

function ReportesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initial = SUB_REPORTES.some((t) => t.value === tabParam)
    ? (tabParam as (typeof SUB_REPORTES)[number]["value"])
    : "historial";
  const [subReporte, setSubReporte] = useState<(typeof SUB_REPORTES)[number]["value"]>(initial);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Reportes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Reportes de IAM sobre roles, permisos y auditoría. Solo lectura.
      </Typography>

      <Tabs
        value={subReporte}
        onChange={(_, value) => {
          setSubReporte(value);
          router.replace(`/admin/reportes?tab=${value}`);
        }}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {SUB_REPORTES.map((tab) => (
          <Tab key={tab.value} label={tab.label} value={tab.value} />
        ))}
      </Tabs>

      {subReporte === "historial" ? (
        <HistorialCambios />
      ) : subReporte === "matriz" ? (
        <MatrizAcceso />
      ) : (
        <BitacoraAuditoria />
      )}
    </AppShell>
  );
}

export default function ReportesPage() {
  // useSearchParams requiere Suspense en App Router - sin esto, `next build`
  // falla el prerender de esta pagina.
  return (
    <Suspense fallback={null}>
      <ReportesContent />
    </Suspense>
  );
}
