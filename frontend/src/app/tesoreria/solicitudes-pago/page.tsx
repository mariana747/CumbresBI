"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
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
import { CreditCard, Eye, Plus, Upload, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import { getSession, SessionUser } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { TesoreriaFlujo, listFlujos } from "@/lib/tesoreria";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  aprobarSolicitudPago,
  crearSolicitudPago,
  listSolicitudesPago,
  rechazarSolicitudPago,
  subirComprobanteSolicitudPago,
  urlVerComprobanteSolicitudPago,
  vincularFlujoSolicitudPago,
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
  const puedeEditar = session?.perm_keys.includes("solicitud-pago.editar") ?? false;
  const puedeGestionar = puedeAprobar || puedeEditar;

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

  // --- Comprobante (subir_comprobante + preview embebido) ---
  // Opcional (recibo/linea de captura/CFDI) - subirlo nunca es requisito
  // para llegar a Pagado, ver docstring del modelo en el backend. Subida
  // exige solicitud-pago.crear (mismo permiso que crear la solicitud);
  // ver el preview no tiene gate propio, cualquiera que ve la fila puede
  // abrirlo (get_object ya scopeo el acceso).
  const [subiendoComprobante, setSubiendoComprobante] = useState<string | null>(null);
  const [previewComprobante, setPreviewComprobante] = useState<TesoreriaSolicitudPago | null>(null);

  async function handleSubirComprobante(id: string, archivo: File) {
    setSubiendoComprobante(id);
    setError(null);
    try {
      await subirComprobanteSolicitudPago(id, archivo);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el comprobante");
    } finally {
      setSubiendoComprobante(null);
    }
  }

  // --- Vincular pago (vincular_flujo, cierra el ciclo: Aprobado -> Pagado) ---
  // Solo desde APROBADO (el backend lo revalida). Autocomplete con busqueda
  // en vivo sobre TesoreriaFlujo, mismo patron que vincularFactura en
  // /tesoreria/flujos y en Notas de Crédito.
  const [vinculando, setVinculando] = useState<TesoreriaSolicitudPago | null>(null);
  const [buscaFlujo, setBuscaFlujo] = useState("");
  const [opcionesFlujo, setOpcionesFlujo] = useState<TesoreriaFlujo[]>([]);
  const [flujoSeleccionado, setFlujoSeleccionado] = useState<TesoreriaFlujo | null>(null);
  const [buscandoFlujo, setBuscandoFlujo] = useState(false);
  const [guardandoVinculo, setGuardandoVinculo] = useState(false);
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null);

  function abrirVincular(s: TesoreriaSolicitudPago) {
    setVinculando(s);
    setFlujoSeleccionado(null);
    setBuscaFlujo("");
    setErrorVinculo(null);
  }

  useEffect(() => {
    if (!vinculando) return;
    setBuscandoFlujo(true);
    const timeout = setTimeout(() => {
      listFlujos({ search: buscaFlujo || undefined })
        .then(setOpcionesFlujo)
        .catch(() => setOpcionesFlujo([]))
        .finally(() => setBuscandoFlujo(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaFlujo, vinculando]);

  async function handleGuardarVinculo() {
    if (!vinculando || !flujoSeleccionado) {
      setErrorVinculo("Selecciona el flujo del pago ya registrado.");
      return;
    }
    setGuardandoVinculo(true);
    setErrorVinculo(null);
    try {
      await vincularFlujoSolicitudPago(vinculando.id_solicitud, flujoSeleccionado.id_flujo);
      setVinculando(null);
      cargar();
    } catch (err) {
      setErrorVinculo(err instanceof Error ? err.message : "Error al vincular el pago");
    } finally {
      setGuardandoVinculo(false);
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
      ) : esMovil && solicitudes.length === 0 ? (
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
                {puedeEditar && s.estado === "APROBADO" && (
                  <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => abrirVincular(s)}>
                    Vincular pago
                  </Button>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {puedeCrear && (
                    <Button
                      component="label"
                      size="small"
                      startIcon={<Upload size={14} strokeWidth={1.5} />}
                      disabled={subiendoComprobante === s.id_solicitud}
                    >
                      {s.link_comprobante ? "Reemplazar comprobante" : "Subir comprobante"}
                      <input
                        type="file"
                        hidden
                        accept="image/*,application/pdf"
                        onChange={(e) => {
                          const archivo = e.target.files?.[0];
                          if (archivo) handleSubirComprobante(s.id_solicitud, archivo);
                          e.target.value = "";
                        }}
                      />
                    </Button>
                  )}
                  {s.link_comprobante && (
                    <Button size="small" startIcon={<Eye size={14} strokeWidth={1.5} />} onClick={() => setPreviewComprobante(s)}>
                      Ver comprobante
                    </Button>
                  )}
                </Stack>
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
                <TableCell align="center">Comprobante</TableCell>
                {puedeGestionar && <TableCell align="right">Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {solicitudes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={puedeGestionar ? 9 : 8} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin solicitudes todavía.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                solicitudes.map((s) => (
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
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      {s.link_comprobante && (
                        <IconButton size="small" aria-label="Ver comprobante" onClick={() => setPreviewComprobante(s)}>
                          <Eye size={16} strokeWidth={1.5} />
                        </IconButton>
                      )}
                      {puedeCrear && (
                        <IconButton
                          component="label"
                          size="small"
                          aria-label={s.link_comprobante ? "Reemplazar comprobante" : "Subir comprobante"}
                          disabled={subiendoComprobante === s.id_solicitud}
                        >
                          <Upload size={16} strokeWidth={1.5} />
                          <input
                            type="file"
                            hidden
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                              const archivo = e.target.files?.[0];
                              if (archivo) handleSubirComprobante(s.id_solicitud, archivo);
                              e.target.value = "";
                            }}
                          />
                        </IconButton>
                      )}
                      {!s.link_comprobante && !puedeCrear && (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  {puedeGestionar && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {puedeAprobar && s.estado === "PENDIENTE" && (
                          <>
                            <Button size="small" variant="contained" disabled={accionando === s.id_solicitud} onClick={() => handleAprobar(s.id_solicitud)}>
                              Aprobar
                            </Button>
                            <Button size="small" color="error" disabled={accionando === s.id_solicitud} onClick={() => handleRechazar(s.id_solicitud)}>
                              Rechazar
                            </Button>
                          </>
                        )}
                        {puedeEditar && s.estado === "APROBADO" && (
                          <Button size="small" variant="outlined" onClick={() => abrirVincular(s)}>
                            Vincular pago
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
                ))
              )}
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

      <Dialog open={!!vinculando} onClose={() => setVinculando(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Vincular pago
          <IconButton size="small" onClick={() => setVinculando(null)} aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorVinculo && <Alert severity="error">{errorVinculo}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Liga la solicitud <strong>{vinculando?.id_solicitud}</strong> al flujo donde ya se registró el pago real
              — pasa a estado Pagado.
            </Typography>
            <Autocomplete
              openOnFocus
              size="small"
              fullWidth
              loading={buscandoFlujo}
              value={flujoSeleccionado}
              inputValue={buscaFlujo}
              onInputChange={(_, nuevoValor) => setBuscaFlujo(nuevoValor)}
              onChange={(_, seleccion) => setFlujoSeleccionado(seleccion)}
              options={opcionesFlujo}
              getOptionLabel={(f) => `${f.id_flujo}${f.descripcion_pago ? ` — ${f.descripcion_pago}` : ""}`}
              isOptionEqualToValue={(f, v) => f.id_flujo === v.id_flujo}
              renderInput={(params) => <TextField {...params} label="Flujo del pago" placeholder="Buscar por ID o descripción" />}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVinculando(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarVinculo} disabled={guardandoVinculo}>
            {guardandoVinculo ? <CircularProgress size={20} color="inherit" /> : "Vincular"}
          </Button>
        </DialogActions>
      </Dialog>

      <DocumentoPreviewDialog
        open={!!previewComprobante}
        onClose={() => setPreviewComprobante(null)}
        url={previewComprobante ? urlVerComprobanteSolicitudPago(previewComprobante.id_solicitud) : null}
        titulo={previewComprobante ? `Comprobante ${previewComprobante.id_solicitud}` : ""}
      />
    </AppShell>
  );
}
