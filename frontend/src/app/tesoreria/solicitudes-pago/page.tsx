"use client";

import { useEffect, useMemo, useState } from "react";
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
  Menu,
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
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { CreditCard, Eye, FileSpreadsheet, HelpCircle, MoreVertical, Plus, Upload, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import FiltrosBar from "@/components/FiltrosBar";
import SelectorArchivoLocalODrive from "@/components/SelectorArchivoLocalODrive";
import { getSession, SessionUser } from "@/lib/auth";
import { MIME_TYPES_COMPROBANTE } from "@/lib/googleDriveFilePicker";
import { GeneralSociedad, IamUser, listSociedades, listUsers } from "@/lib/iam";
import { CATEGORIA_GASTO_LABELS, TesoreriaCategoriaGasto } from "@/lib/miCumbres";
import { TesoreriaFlujo, listFlujos } from "@/lib/tesoreria";
import { useExportarSheets } from "@/lib/useExportarSheets";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  aprobarSolicitudPago,
  crearSolicitudPago,
  exportarSolicitudesPagoSheets,
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

// Glosario de estados - mismo criterio que el glosario de Estado/Pagado
// en flujos/page.tsx.
const ESTADO_DESCRIPCION: Record<SolicitudPagoEstado, string> = {
  PENDIENTE: "Recién creada, todavía nadie la autoriza.",
  APROBADO: "Ya autorizada, lista para vincular el pago real (Flujo).",
  RECHAZADO: "No se autoriza, no se paga.",
  PAGADO: "Ya vinculada a un Flujo con el pago real registrado.",
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

  const [solicitudes, setSolicitudes] = useState<TesoreriaSolicitudPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroSociedad, setFiltroSociedad] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<SolicitudPagoTipo | "">("");
  const [filtroEstado, setFiltroEstado] = useState<SolicitudPagoEstado | "">("");
  // Filtro por Categoria de gasto (11/Sep/2026, "filtro en las 4 pantallas") -
  // mismo criterio client-side que tipo/estado de arriba.
  const [filtroCategoriaGasto, setFiltroCategoriaGasto] = useState<TesoreriaCategoriaGasto | "">("");

  function cargar() {
    setLoading(true);
    setError(null);
    listSolicitudesPago({
      search: search || undefined,
      proyecto: filtroProyecto || undefined,
      sociedad: filtroSociedad || undefined,
    })
      .then(setSolicitudes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }
  useEffect(cargar, []);

  // Exportar a Google Sheets - mismo patron que Flujos/Conciliacion de
  // Facturas, ver lib/useExportarSheets.ts.
  const {
    exportando,
    error: errorExportarSheets,
    exportar: handleExportarSheets,
  } = useExportarSheets((carpetaId) =>
    exportarSolicitudesPagoSheets(
      { proyecto: filtroProyecto || undefined, sociedad: filtroSociedad || undefined, search: search || undefined },
      carpetaId
    )
  );

  const solicitudesFiltradas = useMemo(
    () =>
      solicitudes.filter(
        (s) =>
          (!filtroTipo || s.tipo === filtroTipo) &&
          (!filtroEstado || s.estado === filtroEstado) &&
          (!filtroCategoriaGasto || s.categoria_gasto === filtroCategoriaGasto)
      ),
    [solicitudes, filtroTipo, filtroEstado, filtroCategoriaGasto]
  );

  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  useEffect(() => {
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
  }, []);

  // Nickname del solicitante, no el ID (11/Sep/2026, pendiente de negocio:
  // "Mostrar el nickname del solicitante, no el ID") - solicitado_por
  // guarda el identity_user_id crudo (ver TesoreriaSolicitudPago.perform_create);
  // mismo patron que TicketsReembolsoAdminPanel.tsx::nombreEmpleado.
  const [usuarios, setUsuarios] = useState<IamUser[]>([]);
  useEffect(() => {
    listUsers().then(setUsuarios).catch(() => setUsuarios([]));
  }, []);
  function nombreSolicitante(idUsuario: string): string {
    const usuario = usuarios.find((u) => u.user_id === idUsuario);
    return usuario?.display_name || usuario?.primary_email || idUsuario;
  }

  // Proyecto como lista desplegable - mismo catalogo compartido que
  // Obra/Compras (ver lib/vivienda.ts,
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
  const [categoriaGasto, setCategoriaGasto] = useState<TesoreriaCategoriaGasto | "">("");
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
    setCategoriaGasto("");
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
        categoriaGasto: categoriaGasto || undefined,
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
      setDetalle(null);
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
      setDetalle(null);
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

  // Subir desde el equipo O desde Drive (14/Sep/2026, "usa lo mismo que en
  // Conciliación Bancaria, reutilizalo") - mismo Dialog + componente
  // SelectorArchivoLocalODrive que /tesoreria/conciliacion (importar
  // extracto), en vez de subir directo al click.
  const [subiendoDialogo, setSubiendoDialogo] = useState<TesoreriaSolicitudPago | null>(null);
  const [archivoComprobante, setArchivoComprobante] = useState<File | null>(null);

  function cerrarSubirComprobante() {
    setSubiendoDialogo(null);
    setArchivoComprobante(null);
  }

  async function handleConfirmarSubirComprobante() {
    if (!subiendoDialogo || !archivoComprobante) return;
    await handleSubirComprobante(subiendoDialogo.id_solicitud, archivoComprobante);
    cerrarSubirComprobante();
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

  // --- Ver (detalle completo) - faltaba un boton "Ver" en esta pantalla
  // (14/Sep/2026, "en solicitud de pago no esta la opcion de ver"); mismo
  // patron que el dialogo de detalle de Reembolsos (TicketsReembolsoAdminPanel).
  const [detalle, setDetalle] = useState<TesoreriaSolicitudPago | null>(null);

  // Menu de "..." para Aprobar/Rechazar/Vincular pago (14/Sep/2026, "puede
  // poner los 3 puntos y el ojo" - el ojo se queda como icono suelto,
  // el resto de acciones se agrupan para no saturar la fila).
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; solicitud: TesoreriaSolicitudPago } | null>(null);

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <CreditCard size={22} strokeWidth={1.5} />
        <Typography variant={esMovil ? "h6" : "h5"}>Solicitudes de Pago</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pago de servicios, licencias y renovaciones, dividido por proyecto.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {errorExportarSheets && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorExportarSheets}
        </Alert>
      )}

      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por ID o descripción..."
        onAplicarFiltros={cargar}
        onLimpiarFiltros={() => {
          setFiltroProyecto("");
          setFiltroSociedad("");
          setFiltroTipo("");
          setFiltroEstado("");
        }}
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={exportando ? <CircularProgress size={14} /> : <FileSpreadsheet size={14} strokeWidth={2} />}
              disabled={exportando}
              onClick={handleExportarSheets}
              sx={{ flexShrink: 0 }}
            >
              Exportar a Google Sheets
            </Button>
            {puedeCrear && (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={() => setOpenNuevo(true)}
                sx={{ flexShrink: 0 }}
              >
                Nueva Solicitud
              </Button>
            )}
          </Stack>
        }
      >
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filtro-proyecto-label">Proyecto</InputLabel>
          <Select
            labelId="filtro-proyecto-label"
            label="Proyecto"
            value={filtroProyecto}
            onChange={(e) => setFiltroProyecto(e.target.value)}
          >
            <MenuItem value="">
              <em>Todos</em>
            </MenuItem>
            {proyectos.map((p) => (
              <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                {p.alias_proyecto || p.denominacion || p.id_proyecto}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filtro-sociedad-label">Sociedad</InputLabel>
          <Select
            labelId="filtro-sociedad-label"
            label="Sociedad"
            value={filtroSociedad}
            onChange={(e) => setFiltroSociedad(e.target.value)}
          >
            <MenuItem value="">
              <em>Todas</em>
            </MenuItem>
            {sociedades.map((s) => (
              <MenuItem key={s.rfc} value={s.rfc}>
                {s.alias_sociedad || s.razon_social || s.rfc}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filtro-tipo-label">Tipo</InputLabel>
          <Select
            labelId="filtro-tipo-label"
            label="Tipo"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as SolicitudPagoTipo | "")}
          >
            <MenuItem value="">
              <em>Todos</em>
            </MenuItem>
            {(Object.keys(TIPO_SOLICITUD_PAGO_LABELS) as SolicitudPagoTipo[]).map((t) => (
              <MenuItem key={t} value={t}>
                {TIPO_SOLICITUD_PAGO_LABELS[t]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filtro-estado-label">Estado</InputLabel>
          <Select
            labelId="filtro-estado-label"
            label="Estado"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as SolicitudPagoEstado | "")}
          >
            <MenuItem value="">
              <em>Todos</em>
            </MenuItem>
            {(Object.keys(ESTADO_SOLICITUD_PAGO_LABELS) as SolicitudPagoEstado[]).map((e) => (
              <MenuItem key={e} value={e}>
                {ESTADO_SOLICITUD_PAGO_LABELS[e]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="filtro-categoria-gasto-label">Categoría de gasto</InputLabel>
          <Select
            labelId="filtro-categoria-gasto-label"
            label="Categoría de gasto"
            value={filtroCategoriaGasto}
            onChange={(e) => setFiltroCategoriaGasto(e.target.value as TesoreriaCategoriaGasto | "")}
          >
            <MenuItem value="">
              <em>Todas</em>
            </MenuItem>
            {(Object.keys(CATEGORIA_GASTO_LABELS) as TesoreriaCategoriaGasto[]).map((c) => (
              <MenuItem key={c} value={c}>
                {CATEGORIA_GASTO_LABELS[c]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FiltrosBar>

      <Paper variant="outlined">
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : esMovil && solicitudesFiltradas.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          Sin solicitudes todavía.
        </Typography>
      ) : esMovil ? (
        <Stack spacing={1.5}>
          {solicitudesFiltradas.map((s) => (
            <Card key={s.id_solicitud} variant="outlined">
              <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">{s.id_solicitud} — {s.proyecto}</Typography>
                  <Typography variant="body2">{s.descripcion}</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Chip size="small" label={ESTADO_SOLICITUD_PAGO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} />
                    <Tooltip title={ESTADO_DESCRIPCION[s.estado]}>
                      <HelpCircle size={14} strokeWidth={1.5} style={{ cursor: "help", opacity: 0.6 }} />
                    </Tooltip>
                  </Stack>
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2">
                  <strong>{TIPO_SOLICITUD_PAGO_LABELS[s.tipo]}:</strong> ${s.monto} {s.moneda}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Solicitado por {nombreSolicitante(s.solicitado_por)}
                </Typography>
                {/* Acciones unificadas (14/Sep/2026, "puede poner los 3
                puntos y el ojo") - Ver (icono suelto) + "..." con
                Aprobar/Rechazar/Vincular, mismo criterio que la tabla. */}
                <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                  <IconButton size="small" aria-label="Ver" onClick={() => setDetalle(s)}>
                    <Eye size={16} strokeWidth={1.5} />
                  </IconButton>
                  {((puedeAprobar && s.estado === "PENDIENTE") || (puedeEditar && s.estado === "APROBADO")) && (
                    <IconButton
                      size="small"
                      aria-label="Más acciones"
                      onClick={(e) => setMenuAnchor({ el: e.currentTarget, solicitud: s })}
                    >
                      <MoreVertical size={16} strokeWidth={1.5} />
                    </IconButton>
                  )}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  {s.link_comprobante ? (
                    // Ya tiene comprobante - no se reemplaza, solo se ve
                    // (14/Sep/2026, "que no se pueda subir y solo se
                    // mantenga el ver").
                    <Button size="small" startIcon={<Eye size={14} strokeWidth={1.5} />} onClick={() => setPreviewComprobante(s)}>
                      Ver comprobante
                    </Button>
                  ) : (
                    // Rechazada - no se paga, no tiene sentido seguir
                    // subiendo comprobante (14/Sep/2026, "si esta
                    // rechazado no se debe poder subir comprobante").
                    puedeCrear && s.estado !== "RECHAZADO" && (
                      <Button
                        size="small"
                        startIcon={<Upload size={14} strokeWidth={1.5} />}
                        disabled={subiendoComprobante === s.id_solicitud}
                        onClick={() => setSubiendoDialogo(s)}
                      >
                        Subir comprobante
                      </Button>
                    )
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Proyecto</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Monto</TableCell>
                <TableCell>Solicitado por</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>Estado</span>
                    <Tooltip
                      title={
                        <Stack spacing={0.5} sx={{ py: 0.5 }}>
                          {(Object.keys(ESTADO_DESCRIPCION) as SolicitudPagoEstado[]).map((e) => (
                            <Typography key={e} variant="caption" component="div">
                              <b>{ESTADO_SOLICITUD_PAGO_LABELS[e]}</b> — {ESTADO_DESCRIPCION[e]}
                            </Typography>
                          ))}
                        </Stack>
                      }
                    >
                      <HelpCircle size={14} strokeWidth={1.5} style={{ cursor: "help", opacity: 0.6 }} />
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell align="center">Comprobante</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {solicitudesFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin solicitudes todavía.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                solicitudesFiltradas.map((s) => (
                <TableRow key={s.id_solicitud} hover>
                  <TableCell>{s.id_solicitud}</TableCell>
                  <TableCell>{s.proyecto}</TableCell>
                  <TableCell>{TIPO_SOLICITUD_PAGO_LABELS[s.tipo]}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>{s.descripcion}</TableCell>
                  <TableCell sx={{ fontFamily: "var(--font-dm-mono, monospace)" }}>
                    ${s.monto} {s.moneda}
                  </TableCell>
                  <TableCell>{nombreSolicitante(s.solicitado_por)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={ESTADO_SOLICITUD_PAGO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} />
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      {s.link_comprobante ? (
                        // Ya tiene comprobante - no se reemplaza, solo se
                        // ve (14/Sep/2026, "que no se pueda subir y solo
                        // se mantenga el ver").
                        <IconButton size="small" aria-label="Ver comprobante" onClick={() => setPreviewComprobante(s)}>
                          <Eye size={16} strokeWidth={1.5} />
                        </IconButton>
                      ) : puedeCrear && s.estado !== "RECHAZADO" ? (
                        <IconButton
                          size="small"
                          aria-label="Subir comprobante"
                          title="Subir comprobante"
                          disabled={subiendoComprobante === s.id_solicitud}
                          onClick={() => setSubiendoDialogo(s)}
                        >
                          <Upload size={16} strokeWidth={1.5} />
                        </IconButton>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <IconButton size="small" aria-label="Ver" title="Ver" onClick={() => setDetalle(s)}>
                        <Eye size={16} strokeWidth={1.5} />
                      </IconButton>
                      {((puedeAprobar && s.estado === "PENDIENTE") || (puedeEditar && s.estado === "APROBADO")) && (
                        <IconButton
                          size="small"
                          aria-label="Más acciones"
                          title="Más acciones"
                          onClick={(e) => setMenuAnchor({ el: e.currentTarget, solicitud: s })}
                        >
                          <MoreVertical size={16} strokeWidth={1.5} />
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      </Paper>

      <Dialog open={openNuevo} onClose={cerrarNuevo} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Nueva Solicitud de Pago
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
              <InputLabel id="categoria-gasto-solicitud-label">Categoría de gasto</InputLabel>
              <Select
                labelId="categoria-gasto-solicitud-label"
                label="Categoría de gasto"
                value={categoriaGasto}
                onChange={(e) => setCategoriaGasto(e.target.value as TesoreriaCategoriaGasto | "")}
              >
                <MenuItem value="">
                  <em>Sin categoría</em>
                </MenuItem>
                {(Object.keys(CATEGORIA_GASTO_LABELS) as TesoreriaCategoriaGasto[]).map((c) => (
                  <MenuItem key={c} value={c}>
                    {CATEGORIA_GASTO_LABELS[c]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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

      <Menu anchorEl={menuAnchor?.el} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {menuAnchor && puedeAprobar && menuAnchor.solicitud.estado === "PENDIENTE" && (
          <MenuItem
            disabled={accionando === menuAnchor.solicitud.id_solicitud}
            onClick={() => {
              handleAprobar(menuAnchor.solicitud.id_solicitud);
              setMenuAnchor(null);
            }}
          >
            Aprobar
          </MenuItem>
        )}
        {menuAnchor && puedeAprobar && menuAnchor.solicitud.estado === "PENDIENTE" && (
          <MenuItem
            disabled={accionando === menuAnchor.solicitud.id_solicitud}
            onClick={() => {
              handleRechazar(menuAnchor.solicitud.id_solicitud);
              setMenuAnchor(null);
            }}
          >
            Rechazar
          </MenuItem>
        )}
        {menuAnchor && puedeEditar && menuAnchor.solicitud.estado === "APROBADO" && (
          <MenuItem
            onClick={() => {
              abrirVincular(menuAnchor.solicitud);
              setMenuAnchor(null);
            }}
          >
            Vincular pago
          </MenuItem>
        )}
      </Menu>

      {/* Subir comprobante: equipo o Drive (14/Sep/2026, "usa lo mismo que
      en Conciliación Bancaria, reutilizalo") - mismo Dialog + componente
      que importar extracto. */}
      <Dialog open={!!subiendoDialogo} onClose={cerrarSubirComprobante} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Subir comprobante
          <IconButton size="small" onClick={cerrarSubirComprobante} aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <SelectorArchivoLocalODrive
            archivo={archivoComprobante}
            onChange={setArchivoComprobante}
            accept="image/*,application/pdf"
            mimeTypesDrive={MIME_TYPES_COMPROBANTE}
            tituloDrive="Elige el comprobante"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrarSubirComprobante}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!archivoComprobante || subiendoComprobante === subiendoDialogo?.id_solicitud}
            onClick={handleConfirmarSubirComprobante}
          >
            {subiendoComprobante === subiendoDialogo?.id_solicitud ? <CircularProgress size={20} color="inherit" /> : "Subir"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!detalle}
        onClose={(_, reason) => {
          // Solo se cierra con el boton X (ver memoria
          // feedback-dialogs-solo-cierran-con-x).
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setDetalle(null);
        }}
        fullWidth
        maxWidth="sm"
        fullScreen={esMovil}
      >
        {detalle && (
          <>
            <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Solicitud {detalle.id_solicitud}
              <IconButton size="small" onClick={() => setDetalle(null)} aria-label="Cerrar">
                <CloseIcon size={18} strokeWidth={1.5} />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Chip size="small" label={ESTADO_SOLICITUD_PAGO_LABELS[detalle.estado]} color={ESTADO_COLOR[detalle.estado]} />
                  <Tooltip title={ESTADO_DESCRIPCION[detalle.estado]}>
                    <HelpCircle size={14} strokeWidth={1.5} style={{ cursor: "help", opacity: 0.6 }} />
                  </Tooltip>
                </Stack>
                <Typography variant="body2">
                  <strong>Proyecto:</strong> {detalle.proyecto}
                </Typography>
                <Typography variant="body2">
                  <strong>Sociedad:</strong>{" "}
                  {sociedades.find((s) => s.rfc === detalle.sociedad)?.razon_social || detalle.sociedad || "—"}
                </Typography>
                <Typography variant="body2">
                  <strong>Tipo:</strong> {TIPO_SOLICITUD_PAGO_LABELS[detalle.tipo]}
                </Typography>
                <Typography variant="body2">
                  <strong>Descripción:</strong> {detalle.descripcion}
                </Typography>
                <Typography variant="body2">
                  <strong>Monto:</strong> ${detalle.monto} {detalle.moneda}
                </Typography>
                <Typography variant="body2">
                  <strong>Categoría de gasto:</strong>{" "}
                  {detalle.categoria_gasto ? CATEGORIA_GASTO_LABELS[detalle.categoria_gasto] : "—"}
                </Typography>
                <Typography variant="body2">
                  <strong>Solicitado por:</strong> {nombreSolicitante(detalle.solicitado_por)}
                </Typography>
                {detalle.autorizado_por && (
                  <Typography variant="body2">
                    <strong>Autorizado por:</strong> {nombreSolicitante(detalle.autorizado_por)}{" "}
                    ({detalle.fecha_autorizacion})
                  </Typography>
                )}
                {detalle.factura_folio && (
                  <Typography variant="body2">
                    <strong>Factura:</strong> {detalle.factura_folio}
                  </Typography>
                )}
                {detalle.flujo_id && (
                  <Typography variant="body2">
                    <strong>Flujo del pago:</strong> {detalle.flujo_id}
                  </Typography>
                )}
                {detalle.comentarios && (
                  <Typography variant="body2">
                    <strong>Comentarios:</strong> {detalle.comentarios}
                  </Typography>
                )}

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {detalle.link_comprobante && (
                    <Button
                      size="small"
                      variant="outlined"
                      fullWidth={esMovil}
                      startIcon={<Eye size={14} strokeWidth={1.5} />}
                      onClick={() => setPreviewComprobante(detalle)}
                    >
                      Ver comprobante
                    </Button>
                  )}
                </Stack>

                {puedeAprobar && detalle.estado === "PENDIENTE" && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      variant="contained"
                      fullWidth={esMovil}
                      disabled={accionando === detalle.id_solicitud}
                      onClick={() => handleAprobar(detalle.id_solicitud)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      fullWidth={esMovil}
                      disabled={accionando === detalle.id_solicitud}
                      onClick={() => handleRechazar(detalle.id_solicitud)}
                    >
                      Rechazar
                    </Button>
                  </Stack>
                )}
                {puedeEditar && detalle.estado === "APROBADO" && (
                  <Button variant="outlined" fullWidth={esMovil} onClick={() => abrirVincular(detalle)}>
                    Vincular pago
                  </Button>
                )}
              </Stack>
            </DialogContent>
          </>
        )}
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
