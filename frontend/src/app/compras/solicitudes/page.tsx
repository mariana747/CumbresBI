"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
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
import { ClipboardList, Plus, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import CotizacionesPanel from "@/components/CotizacionesPanel";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { SolicitudCompra, createSolicitudCompra, listSolicitudesCompra } from "@/lib/compras";

const ESTADO_LABELS: Record<SolicitudCompra["estado"], string> = {
  PENDIENTE: "Pendiente",
  EN_COTIZACION: "En cotización",
  ORDEN_GENERADA: "Orden generada",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
};
const ESTADO_COLOR: Record<SolicitudCompra["estado"], "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  EN_COTIZACION: "warning",
  ORDEN_GENERADA: "info",
  CERRADA: "success",
  CANCELADA: "error",
};

// Fase 4B - Compras (02/Sep/2026). Cabecera del proceso; cada solicitud
// puede o no venir de una Requisicion ya autorizada de materiales-service
// (campo libre `requisicion`, referencia laxa - ver
// services/compras-tesoreria-service/compras_tesoreria/models.py).
export default function SolicitudesCompraPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [proyecto, setProyecto] = useState("");
  const [requisicion, setRequisicion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<SolicitudCompra["estado"] | "">("");
  // Ver cotizaciones en panel lateral (21/Sep/2026, "que sean en una pagina
  // lateral") - antes navegaba a /compras/cotizaciones, ahora abre un
  // Drawer con CotizacionesPanel sin salir de esta pantalla.
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<SolicitudCompra | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("compras.crear") ?? false;

  function recargar() {
    setLoading(true);
    listSolicitudesCompra({ search: search || undefined, estado: filtroEstado || undefined })
      .then(setSolicitudes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(recargar, [search, filtroEstado]);

  async function handleCrear() {
    setGuardando(true);
    setError(null);
    try {
      await createSolicitudCompra({
        proyecto,
        descripcion,
        requisicion: requisicion || null,
      });
      setDialogOpen(false);
      setProyecto("");
      setRequisicion("");
      setDescripcion("");
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <ClipboardList size={22} strokeWidth={1.5} />
        <Typography variant="h5">Solicitudes de Compra</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Punto de partida del proceso de Compras: solicitud → cotizaciones → orden de compra → recepción. Puede
        venir de una Requisición ya autorizada de Obra/Materiales, o levantarse suelta.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <FiltrosBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por proyecto, descripción o requisición...">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="filtro-estado-solicitud-label">Filtrar por estado</InputLabel>
          <Select
            labelId="filtro-estado-solicitud-label"
            label="Filtrar por estado"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as SolicitudCompra["estado"] | "")}
          >
            <MenuItem value="">
              <em>Todos los estados</em>
            </MenuItem>
            {Object.entries(ESTADO_LABELS).map(([valor, label]) => (
              <MenuItem key={valor} value={valor}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FiltrosBar>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : (
        <Paper variant="outlined">
          <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
            <Typography variant="subtitle1">Solicitudes</Typography>
            {puedeCrear && (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={() => setDialogOpen(true)}
                sx={{ ml: "auto" }}
              >
                Nueva Solicitud
              </Button>
            )}
          </Stack>
          {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza
          por tarjetas apiladas (ver abajo) - mismo patron que
          tesoreria/flujos/page.tsx. */}
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Proyecto</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell>Requisición</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Cotizaciones</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {solicitudes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Sin solicitudes registradas.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    solicitudes.map((s) => (
                      <TableRow
                        key={s.id_solicitud}
                        hover
                        onClick={() => setSolicitudSeleccionada(s)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>{s.proyecto}</TableCell>
                        <TableCell>{s.descripcion}</TableCell>
                        <TableCell>{s.requisicion || "—"}</TableCell>
                        <TableCell>
                          <Chip size="small" label={ESTADO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} />
                        </TableCell>
                        <TableCell align="right">{s.cotizaciones.length}</TableCell>
                        <TableCell align="right">
                          <Button size="small">Ver cotizaciones</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
          <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
            {solicitudes.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                Sin solicitudes registradas.
              </Typography>
            ) : (
              solicitudes.map((s) => (
                <Paper
                  key={s.id_solicitud}
                  variant="outlined"
                  sx={{ p: 2, cursor: "pointer" }}
                  onClick={() => setSolicitudSeleccionada(s)}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2">{s.proyecto}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.descripcion}
                      </Typography>
                    </Stack>
                    <Chip size="small" label={ESTADO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} sx={{ flexShrink: 0 }} />
                  </Stack>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Requisición:</strong> {s.requisicion || "—"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Cotizaciones:</strong> {s.cotizaciones.length}
                    </Typography>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        </Paper>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nueva Solicitud de Compra</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Proyecto"
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              helperText="id_proyecto de vivienda_proyectos"
              fullWidth
            />
            <TextField
              label="Descripción"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Requisición de origen (opcional)"
              value={requisicion}
              onChange={(e) => setRequisicion(e.target.value)}
              helperText="id_requisicion de materiales-service, si esta compra viene de una requisición ya autorizada"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!proyecto || !descripcion || guardando}
            onClick={handleCrear}
          >
            {guardando ? <CircularProgress size={20} /> : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        open={!!solicitudSeleccionada}
        onClose={(_, reason) => {
          // Solo se cierra con el boton X (mismo criterio que
          // PanelReferenciaCruzada - "las pantallas flotantes deben tener
          // esto de solo cerrar con la x").
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setSolicitudSeleccionada(null);
          recargar();
        }}
      >
        <Box sx={{ width: { xs: "100vw", sm: 640 }, p: 3 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6">Cotizaciones — {solicitudSeleccionada?.id_solicitud}</Typography>
            <IconButton
              size="small"
              aria-label="Cerrar"
              onClick={() => {
                setSolicitudSeleccionada(null);
                recargar();
              }}
            >
              <CloseIcon size={18} strokeWidth={1.5} />
            </IconButton>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          {solicitudSeleccionada && <CotizacionesPanel solicitudId={solicitudSeleccionada.id_solicitud} />}
        </Box>
      </Drawer>
    </AppShell>
  );
}
