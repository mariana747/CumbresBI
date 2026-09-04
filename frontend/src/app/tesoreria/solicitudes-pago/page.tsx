"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { CreditCard, Plus, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { getSession, SessionUser } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  aprobarSolicitudPago,
  crearSolicitudPago,
  listSolicitudesPago,
  rechazarSolicitudPago,
  ESTADO_SOLICITUD_PAGO_LABELS,
  SolicitudPagoEstado,
  SolicitudPagoTipo,
  TesoreriaSolicitudPago,
  TIPO_SOLICITUD_PAGO_LABELS,
} from "@/lib/solicitudesPago";

// Solicitud de Pago (04/Sep/2026): pago de servicios/licencias/renovaciones,
// dividido por proyecto - distinta de Reembolso (MiCumbres). Crear exige
// solicitud-pago.crear (no todos los colaboradores, ver docstring del
// ViewSet); aprobar/rechazar exigen solicitud-pago.aprobar (separacion de
// funciones: quien solicita no se autoriza a si mismo).

const ESTADO_COLOR: Record<SolicitudPagoEstado, "default" | "warning" | "success" | "error"> = {
  PENDIENTE: "default",
  APROBADO: "warning",
  RECHAZADO: "error",
  PAGADO: "success",
};

export default function SolicitudesPagoPage() {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));

  const [session, setSession] = useState<SessionUser | null>(null);
  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("solicitud-pago.crear") ?? false;
  const puedeAprobar = session?.perm_keys.includes("solicitud-pago.aprobar") ?? false;

  const [solicitudes, setSolicitudes] = useState<TesoreriaSolicitudPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    setLoading(true);
    setError(null);
    listSolicitudesPago()
      .then(setSolicitudes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  useEffect(() => {
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
  }, []);

  // Proyecto como lista desplegable (04/Sep/2026, pedido de Mariana) -
  // mismo catalogo compartido que Obra/Compras (ver lib/vivienda.ts,
  // reusado tal cual en obra/requisiciones/nueva/page.tsx).
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  useEffect(() => {
    listProyectos().then(setProyectos).catch(() => setProyectos([]));
  }, []);

  // --- Alta ---
  const [openNuevo, setOpenNuevo] = useState(false);
  const [proyecto, setProyecto] = useState("");
  const [sociedad, setSociedad] = useState("");
  const [tipo, setTipo] = useState<SolicitudPagoTipo>("SERVICIO");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("MXP");
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  function cerrarNuevo() {
    setOpenNuevo(false);
    setProyecto("");
    setSociedad("");
    setTipo("SERVICIO");
    setDescripcion("");
    setMonto("");
    setMoneda("MXP");
    setErrorAlta(null);
  }

  async function handleCrear() {
    if (!proyecto || !descripcion || !monto) {
      setErrorAlta("Proyecto, descripción y monto son obligatorios.");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      await crearSolicitudPago({
        proyecto,
        sociedad: sociedad || undefined,
        tipo,
        descripcion,
        monto,
        moneda,
      });
      cerrarNuevo();
      cargar();
    } catch (err) {
      setErrorAlta(err instanceof Error ? err.message : "Error al crear la solicitud");
    } finally {
      setGuardando(false);
    }
  }

  const [accionando, setAccionando] = useState<string | null>(null);
  async function handleAprobar(id: string) {
    setAccionando(id);
    setError(null);
    try {
      await aprobarSolicitudPago(id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aprobar");
    } finally {
      setAccionando(null);
    }
  }
  async function handleRechazar(id: string) {
    setAccionando(id);
    setError(null);
    try {
      await rechazarSolicitudPago(id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al rechazar");
    } finally {
      setAccionando(null);
    }
  }

  return (
    <AppShell>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <CreditCard size={22} strokeWidth={1.5} />
            <Typography variant={esMovil ? "h6" : "h5"}>Solicitudes de pago</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Pago de servicios, licencias y renovaciones, dividido por proyecto.
          </Typography>
        </Box>
        {puedeCrear && (
          <Button
            variant="contained"
            size={esMovil ? "small" : "medium"}
            startIcon={<Plus size={18} strokeWidth={1.5} />}
            onClick={() => setOpenNuevo(true)}
          >
            Nueva solicitud
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : solicitudes.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          Sin solicitudes todavía.
        </Typography>
      ) : esMovil ? (
        <Stack spacing={1.5}>
          {solicitudes.map((s) => (
            <Card key={s.id_solicitud} variant="outlined">
              <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">{s.id_solicitud} — {s.proyecto}</Typography>
                  <Typography variant="body2">{s.descripcion}</Typography>
                  <Chip
                    size="small"
                    label={ESTADO_SOLICITUD_PAGO_LABELS[s.estado]}
                    color={ESTADO_COLOR[s.estado]}
                    sx={{ alignSelf: "flex-start" }}
                  />
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2">
                  <strong>{TIPO_SOLICITUD_PAGO_LABELS[s.tipo]}:</strong> ${s.monto} {s.moneda}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Solicitado por {s.solicitado_por}
                </Typography>
                {puedeAprobar && s.estado === "PENDIENTE" && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" variant="contained" disabled={accionando === s.id_solicitud} onClick={() => handleAprobar(s.id_solicitud)}>
                      Aprobar
                    </Button>
                    <Button size="small" color="error" disabled={accionando === s.id_solicitud} onClick={() => handleRechazar(s.id_solicitud)}>
                      Rechazar
                    </Button>
                  </Stack>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Proyecto</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Monto</TableCell>
                <TableCell>Solicitado por</TableCell>
                <TableCell>Estado</TableCell>
                {puedeAprobar && <TableCell align="right">Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {solicitudes.map((s) => (
                <TableRow key={s.id_solicitud} hover>
                  <TableCell>{s.id_solicitud}</TableCell>
                  <TableCell>{s.proyecto}</TableCell>
                  <TableCell>{TIPO_SOLICITUD_PAGO_LABELS[s.tipo]}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>{s.descripcion}</TableCell>
                  <TableCell sx={{ fontFamily: "var(--font-dm-mono, monospace)" }}>
                    ${s.monto} {s.moneda}
                  </TableCell>
                  <TableCell>{s.solicitado_por}</TableCell>
                  <TableCell>
                    <Chip size="small" label={ESTADO_SOLICITUD_PAGO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} />
                  </TableCell>
                  {puedeAprobar && (
                    <TableCell align="right">
                      {s.estado === "PENDIENTE" && (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button size="small" variant="contained" disabled={accionando === s.id_solicitud} onClick={() => handleAprobar(s.id_solicitud)}>
                            Aprobar
                          </Button>
                          <Button size="small" color="error" disabled={accionando === s.id_solicitud} onClick={() => handleRechazar(s.id_solicitud)}>
                            Rechazar
                          </Button>
                        </Stack>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={openNuevo} onClose={cerrarNuevo} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Nueva solicitud de pago
          <IconButton size="small" onClick={cerrarNuevo} aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorAlta && <Alert severity="error">{errorAlta}</Alert>}
            <FormControl fullWidth>
              <InputLabel id="proyecto-solicitud-label">Proyecto</InputLabel>
              <Select
                labelId="proyecto-solicitud-label"
                label="Proyecto"
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
              >
                {proyectos.length === 0 && <MenuItem value="">Sin proyectos todavía</MenuItem>}
                {proyectos.map((p) => (
                  <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                    {p.alias_proyecto || p.denominacion || p.id_proyecto}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="tipo-solicitud-label">Tipo</InputLabel>
              <Select
                labelId="tipo-solicitud-label"
                label="Tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as SolicitudPagoTipo)}
              >
                {Object.entries(TIPO_SOLICITUD_PAGO_LABELS).map(([valor, label]) => (
                  <MenuItem key={valor} value={valor}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Descripción"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField label="Monto" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} fullWidth />
              <FormControl sx={{ minWidth: 100 }}>
                <InputLabel id="moneda-solicitud-label">Moneda</InputLabel>
                <Select
                  labelId="moneda-solicitud-label"
                  label="Moneda"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                >
                  <MenuItem value="MXP">MXP</MenuItem>
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="EUR">EUR</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <FormControl fullWidth>
              <InputLabel id="sociedad-solicitud-label">Sociedad</InputLabel>
              <Select
                labelId="sociedad-solicitud-label"
                label="Sociedad"
                value={sociedad}
                onChange={(e) => setSociedad(e.target.value)}
              >
                <MenuItem value="">
                  <em>Sin especificar</em>
                </MenuItem>
                {sociedades.map((s) => (
                  <MenuItem key={s.rfc} value={s.rfc}>
                    {s.razon_social || s.rfc}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrarNuevo}>Cancelar</Button>
          <Button variant="contained" onClick={handleCrear} disabled={guardando}>
            {guardando ? <CircularProgress size={20} color="inherit" /> : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
