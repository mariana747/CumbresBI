"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
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
import { Download, Search } from "lucide-react";
import AdminTabs from "@/components/AdminTabs";
import AppShell from "@/components/AppShell";
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
import { listUsers } from "@/lib/iam";

// Visor de bitacora de auditoria (Fase 1, Semana 6). bitacora_auditoria es
// append-only (ver audit-service/auditoria/models.py) - esta pantalla es
// solo lectura, nunca escribe ni modifica eventos. Sin ingestion real de
// eventos todavia (depende de Pub/Sub, Fase 1+ real) - solo se ve el evento
// de seed hasta que los demas servicios empiecen a publicar.
export default function VisorAuditoriaPage() {
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
  // cruzada de esquema (ver models.py), asi que el nombre se busca aparte;
  // si el usuario no existe ahi (ej. datos de seed viejos), se muestra el ID.
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
    <AppShell>
      <AdminTabs />
      <Typography variant="h5" gutterBottom>
        Bitácora de auditoría
      </Typography>
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
    </AppShell>
  );
}
