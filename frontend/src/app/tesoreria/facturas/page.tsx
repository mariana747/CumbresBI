"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  List,
  ListItem,
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
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CheckCircle2,
  Download,
  Eye,
  ExternalLink,
  FileCode2,
  FileSearch,
  FileText,
  HelpCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X as CloseIcon,
  XCircle,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import PanelReferenciaCruzada, { ReferenciaCruzada } from "@/components/PanelReferenciaCruzada";
import FiltrosBar from "@/components/FiltrosBar";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { SessionUser, getSession } from "@/lib/auth";
import { DriveArchivo } from "@/lib/drive";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { CATEGORIA_GASTO_LABELS, TesoreriaCategoriaGasto } from "@/lib/miCumbres";
import {
  EnvioMasivoResultado,
  FacturaConcepto,
  FacturaTraslado,
  TESORERIA_CAMPOS_CONFIRMABLES,
  TESORERIA_CAMPOS_CONFIRMABLES_NUEVA,
  TesoreriaFactura,
  TesoreriaFacturaEstado,
  confirmarExtraccionFactura,
  createFactura,
  createFacturaConcepto,
  createFacturaTraslado,
  deleteFacturaConcepto,
  deleteFacturaTraslado,
  enviarMasivoFacturas,
  listFacturaConceptos,
  enviarAvisoSaldoPendiente,
  FacturaDoctoRelacionado,
  listExhibicionesDeFactura,
  listFacturaTraslados,
  listFacturas,
  marcarEstadoFactura,
  updateFactura,
  listContrapartes,
  listTicketsProveedor,
  vincularFlujoAFactura,
  TesoreriaContraparte,
  TesoreriaTicketProveedor,
  urlVerFacturaPdf,
  urlExportarFacturasCsv,
  sincronizarDriveFactura,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  timbreUuid: "",
  comprobanteVersion: "",
  comprobanteSerie: "",
  comprobanteFolio: "",
  comprobanteFecha: "",
  comprobanteFormaPago: "",
  comprobanteNoCertificado: "",
  comprobanteSubTotal: "",
  comprobanteIva: "",
  comprobanteMoneda: "",
  comprobanteExportacion: "",
  comprobanteTipoCambio: "",
  comprobanteTotal: "",
  // Catalogo c_TipoDeComprobante del SAT
  comprobanteTipoDeComprobante: "I",
  comprobanteMetodoPago: "" as "" | "PUE" | "PPD",
  comprobanteLugarExpedicion: "",
  tipoRelacion: "",
  uuidRelacionado: "",
  emisorRfc: "",
  emisorNombre: "",
  emisorRegimenFiscal: "",
  receptorRfc: "",
  receptorNombre: "",
  receptorDomicilioFiscalReceptor: "",
  receptorRegimenFiscalReceptor: "",
  receptorUsoCfdi: "",
  timbreVersion: "",
  timbreFechaTimbrado: "",
  timbreRfcProvCertif: "",
  timbreNoCertificadoSat: "",
  tipoFactura: "",
  linkPdf: "",
  linkXml: "",
  categoriaGasto: "" as TesoreriaCategoriaGasto | "",
};

// Catalogo c_TipoRelacion del SAT
const TIPO_RELACION_OPCIONES: { value: string; label: string }[] = [
  { value: "01", label: "01 — Nota de crédito de los documentos relacionados" },
  { value: "03", label: "03 — Devolución de mercancía sobre facturas previas" },
  { value: "04", label: "04 — Sustitución de los CFDI previos" },
  { value: "07", label: "07 — CFDI por aplicación de anticipo" },
];

const ESTADO_LABEL: Record<TesoreriaFacturaEstado, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
};

const ESTADO_COLOR: Record<TesoreriaFacturaEstado, "default" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  EN_PROCESO: "info",
  ACEPTADA: "success",
  RECHAZADA: "error",
};

// Nomenclatura de estados
const ESTADO_DESCRIPCION: Record<TesoreriaFacturaEstado, string> = {
  PENDIENTE: "Recién capturada por el Motor Documental, todavía sin revisar.",
  EN_PROCESO: "Un analista la está revisando.",
  ACEPTADA: "Revisada y con PDF + XML completos — ya se puede usar sin restricción.",
  RECHAZADA: "No pasó la revisión — no se puede aceptar así.",
};

// Link real de Drive a partir del file_id (09/Sep/2026, "la redireccion
// debe hacer al archivo de drive") - "Abrir en pestaña nueva" debe ir al
// archivo real, no a nuestro endpoint de streaming.
function urlDriveWebView(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// Pestañas del formulario de factura
const TABS_FACTURA = ["Comprobante", "Montos", "Emisor y Receptor", "Timbrado", "Documentos", "Proceso"] as const;
type TabFactura = (typeof TABS_FACTURA)[number];

// snake_case -> camelCase
function aCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, letra) => letra.toUpperCase());
}

// Conceptos de una factura ya guardada
function PanelConceptos({ uuidFactura, puedeEditar }: { uuidFactura: string; puedeEditar: boolean }) {
  const [items, setItems] = useState<FacturaConcepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ descripcion: "", cantidad: "", claveUnidad: "", valorUnitario: "", importe: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listFacturaConceptos(uuidFactura)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [uuidFactura]);

  async function handleAgregar() {
    if (!nuevo.descripcion) {
      setError("La descripción es obligatoria.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await createFacturaConcepto(uuidFactura, nuevo);
      setNuevo({ descripcion: "", cantidad: "", claveUnidad: "", valorUnitario: "", importe: "" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar(id: number) {
    setGuardando(true);
    try {
      await deleteFacturaConcepto(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Conceptos</Typography>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Descripción</TableCell>
              <TableCell>Cantidad</TableCell>
              <TableCell>Unidad</TableCell>
              <TableCell align="right">Valor unitario</TableCell>
              <TableCell align="right">Importe</TableCell>
              {puedeEditar && <TableCell align="right" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <CircularProgress size={16} />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="caption" color="text.secondary">
                    Sin conceptos.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.descripcion || "—"}</TableCell>
                  <TableCell>{c.cantidad || "—"}</TableCell>
                  <TableCell>{c.clave_unidad || "—"}</TableCell>
                  <TableCell align="right">{c.valor_unitario || "—"}</TableCell>
                  <TableCell align="right">{c.importe || "—"}</TableCell>
                  {puedeEditar && (
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Eliminar" onClick={() => handleEliminar(c.id)} disabled={guardando}>
                        <Trash2 size={13} strokeWidth={1.5} />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
            {puedeEditar && (
              <TableRow>
                <TableCell>
                  <TextField
                    size="small"
                    variant="standard"
                    placeholder="Descripción"
                    value={nuevo.descripcion}
                    onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
                    fullWidth
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.cantidad}
                    onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })}
                    sx={{ width: 60 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.claveUnidad}
                    onChange={(e) => setNuevo({ ...nuevo, claveUnidad: e.target.value })}
                    sx={{ width: 60 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.valorUnitario}
                    onChange={(e) => setNuevo({ ...nuevo, valorUnitario: e.target.value })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.importe}
                    onChange={(e) => setNuevo({ ...nuevo, importe: e.target.value })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" aria-label="Agregar concepto" onClick={handleAgregar} disabled={guardando}>
                    <Plus size={14} strokeWidth={2} />
                  </IconButton>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

// Lineas de impuesto trasladado
function PanelTraslados({ uuidFactura, puedeEditar }: { uuidFactura: string; puedeEditar: boolean }) {
  const [items, setItems] = useState<FacturaTraslado[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ impuesto: "", tipoFactor: "", tasaOCuota: "", base: "", importe: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listFacturaTraslados(uuidFactura)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [uuidFactura]);

  async function handleAgregar() {
    if (!nuevo.impuesto) {
      setError("El impuesto es obligatorio.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await createFacturaTraslado(uuidFactura, nuevo);
      setNuevo({ impuesto: "", tipoFactor: "", tasaOCuota: "", base: "", importe: "" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar(id: number) {
    setGuardando(true);
    try {
      await deleteFacturaTraslado(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Impuestos Trasladados</Typography>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Impuesto</TableCell>
              <TableCell>Tipo factor</TableCell>
              <TableCell>Tasa/Cuota</TableCell>
              <TableCell align="right">Base</TableCell>
              <TableCell align="right">Importe</TableCell>
              {puedeEditar && <TableCell align="right" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <CircularProgress size={16} />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="caption" color="text.secondary">
                    Sin impuestos trasladados.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.impuesto || "—"}</TableCell>
                  <TableCell>{t.tipo_factor || "—"}</TableCell>
                  <TableCell>{t.tasa_o_cuota || "—"}</TableCell>
                  <TableCell align="right">{t.base || "—"}</TableCell>
                  <TableCell align="right">{t.importe || "—"}</TableCell>
                  {puedeEditar && (
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Eliminar" onClick={() => handleEliminar(t.id)} disabled={guardando}>
                        <Trash2 size={13} strokeWidth={1.5} />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
            {puedeEditar && (
              <TableRow>
                <TableCell>
                  <TextField
                    size="small"
                    variant="standard"
                    placeholder="IVA, ISR..."
                    value={nuevo.impuesto}
                    onChange={(e) => setNuevo({ ...nuevo, impuesto: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.tipoFactor}
                    onChange={(e) => setNuevo({ ...nuevo, tipoFactor: e.target.value })}
                    sx={{ width: 70 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.tasaOCuota}
                    onChange={(e) => setNuevo({ ...nuevo, tasaOCuota: e.target.value })}
                    sx={{ width: 70 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.base}
                    onChange={(e) => setNuevo({ ...nuevo, base: e.target.value })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.importe}
                    onChange={(e) => setNuevo({ ...nuevo, importe: e.target.value })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" aria-label="Agregar traslado" onClick={handleAgregar} disabled={guardando}>
                    <Plus size={14} strokeWidth={2} />
                  </IconButton>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}


export default function TesoreriaFacturasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  // Preview embebido del PDF (el ojo conserva su comportamiento de
  // siempre) - el XML en cambio redirige directo a Drive.
  const [previewDoc, setPreviewDoc] = useState<{ url: string; titulo: string; urlExterna?: string } | null>(null);
  // Referencias cruzadas (10/Sep/2026, "replica el patron en Facturas y
  // Flujos") - ver componente PanelReferenciaCruzada.
  const [panelReferencia, setPanelReferencia] = useState<ReferenciaCruzada>(null);
  const [facturas, setFacturas] = useState<TesoreriaFactura[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaFactura | null>(null);
  // Abierto desde el ojito (Ver) - fuerza los campos a solo lectura aunque
  // el usuario tenga permiso de editar.
  const [modoSoloLectura, setModoSoloLectura] = useState(false);
  // Boton temporal de sincronizacion con Drive (09/Sep/2026, "en factura
  // no veo el actualizar")
  const [sincronizandoFactura, setSincronizandoFactura] = useState(false);
  const [errorSincronizarFactura, setErrorSincronizarFactura] = useState<string | null>(null);
  async function handleSincronizarDriveFactura() {
    if (!editing) return;
    setSincronizandoFactura(true);
    setErrorSincronizarFactura(null);
    try {
      const actualizada = await sincronizarDriveFactura(editing.id);
      setEditing(actualizada);
      refresh();
    } catch (err) {
      setErrorSincronizarFactura(err instanceof Error ? err.message : "Error al sincronizar con Drive");
    } finally {
      setSincronizandoFactura(false);
    }
  }
  const [form, setForm] = useState(FORM_VACIO);
  // Proveedor a revisar en "Nueva Factura" > Motor Documental
  const [proveedores, setProveedores] = useState<TesoreriaContraparte[]>([]);
  const [proveedorBandeja, setProveedorBandeja] = useState("");
  // Ticket exacto que disparo "Revisar"
  const [idTicketBandeja, setIdTicketBandeja] = useState("");
 


  // Tickets de proveedor
  const [ticketsProveedor, setTicketsProveedor] = useState<TesoreriaTicketProveedor[]>([]);
  // Tickets ya capturados, ocultos localmente
  const [ticketsOcultos, setTicketsOcultos] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [motorAbierto, setMotorAbierto] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [estadoError, setEstadoError] = useState<string | null>(null);
  // Vinculacion factura<->flujo
  const [idFlujoParaVincular, setIdFlujoParaVincular] = useState("");
  const [vinculandoFlujo, setVinculandoFlujo] = useState(false);
  const [errorVincularFlujo, setErrorVincularFlujo] = useState<string | null>(null);

  // Aviso de saldo PPD pendiente (10/Sep/2026, pendiente real de Jenny) -
  // nunca se dispara solo, solo con este boton.
  const [mensajeAvisoSaldo, setMensajeAvisoSaldo] = useState("");
  const [enviandoAvisoSaldo, setEnviandoAvisoSaldo] = useState(false);
  const [avisoSaldoEnviado, setAvisoSaldoEnviado] = useState(false);
  const [errorAvisoSaldo, setErrorAvisoSaldo] = useState<string | null>(null);

  // Exhibiciones/REPs ya recibidos (10/Sep/2026, "mostrar la lista de
  // exhibiciones/REPs ya recibidos dentro de la misma factura, asi es mas
  // visual") - historial real, no editable a mano (viene del REP timbrado).
  const [exhibiciones, setExhibiciones] = useState<FacturaDoctoRelacionado[]>([]);
  const [cargandoExhibiciones, setCargandoExhibiciones] = useState(false);

  async function handleAvisoSaldoPendiente() {
    if (!editing) return;
    setEnviandoAvisoSaldo(true);
    setErrorAvisoSaldo(null);
    try {
      await enviarAvisoSaldoPendiente(editing.id, mensajeAvisoSaldo || undefined);
      setAvisoSaldoEnviado(true);
    } catch (err) {
      setErrorAvisoSaldo(err instanceof Error ? err.message : "Error al enviar el aviso");
    } finally {
      setEnviandoAvisoSaldo(false);
    }
  }

  async function handleVincularFlujo() {
    if (!editing || !idFlujoParaVincular.trim()) return;
    setVinculandoFlujo(true);
    setErrorVincularFlujo(null);
    try {
      await vincularFlujoAFactura(editing.id, idFlujoParaVincular.trim());
      setIdFlujoParaVincular("");
      refresh();
    } catch (err) {
      setErrorVincularFlujo(err instanceof Error ? err.message : "Error al vincular el flujo");
    } finally {
      setVinculandoFlujo(false);
    }
  }

  // Envio masivo por correo
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());
  const [envioDialogOpen, setEnvioDialogOpen] = useState(false);
  const [destinatarios, setDestinatarios] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [envioError, setEnvioError] = useState<string | null>(null);
  const [envioResultados, setEnvioResultados] = useState<EnvioMasivoResultado[] | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  useEffect(() => {
    listContrapartes(undefined, "proveedor")
      .then(setProveedores)
      .catch(() => undefined);
  }, []);

  // Filtros combinados
  const [sociedadesFiltro, setSociedadesFiltro] = useState<GeneralSociedad[]>([]);
  const [filtroReceptor, setFiltroReceptor] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState<TesoreriaContraparte | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<TesoreriaFacturaEstado | "">("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  // Filtro por Categoria de gasto (11/Sep/2026, "filtro en las 4 pantallas")
  const [filtroCategoriaGasto, setFiltroCategoriaGasto] = useState<TesoreriaCategoriaGasto | "">("");
  const [opcionesProveedor, setOpcionesProveedor] = useState<TesoreriaContraparte[]>([]);

  useEffect(() => {
    listSociedades()
      .then(setSociedadesFiltro)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    listContrapartes(undefined, "proveedor")
      .then(setOpcionesProveedor)
      .catch(() => setOpcionesProveedor([]));
  }, []);

  function refresh() {
    setLoading(true);
    listFacturas({
      search: search || undefined,
      contraparte: filtroProveedor?.id_contraparte || undefined,
      receptorRfc: filtroReceptor || undefined,
      fechaDesde: filtroFechaDesde || undefined,
      fechaHasta: filtroFechaHasta || undefined,
      estado: filtroEstado || undefined,
      categoriaGasto: filtroCategoriaGasto || undefined,
    })
      .then(setFacturas)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroReceptor, filtroProveedor, filtroFechaDesde, filtroFechaHasta, filtroEstado, filtroCategoriaGasto]);

  function refrescarTicketsProveedor() {
    listTicketsProveedor()
      .then(setTicketsProveedor)
      .catch(() => undefined);
  }
  useEffect(refrescarTicketsProveedor, []);

  const puedeCrear = session?.perm_keys.includes("facturacion-cfdi.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("facturacion-cfdi.editar") ?? false;
  // Permiso de aprobacion
  const puedeAprobar = session?.perm_keys.includes("facturacion-cfdi.aprobar") ?? false;
  const puedeAbrirDetalle = puedeEditar || puedeAprobar;



  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setProveedorBandeja("");
    setIdTicketBandeja("");
    setArchivoNuevaFactura(undefined);
    setMotorEjecutadoNuevaFactura(false);
    setTabFactura("Comprobante");
    setDialogOpen(true);
  }

  // Clasificacion de un ticket de proveedor - ya no se muestra en esta
  // pantalla (10/Sep/2026, "no quiero que se muestre el estado de estas en
  // facturas, para eso esta Admin"), solo se usa para filtrar el selector
  // de "Nueva Factura" a los tickets recibidos y sin capturar todavia.
  function estadoTicketFactura(t: TesoreriaTicketProveedor) {
    const recibida = t.uses_count >= t.max_uses;
    // Ya se creo la factura desde este ticket - no importa si el link
    // despues se reboco o vencio, su ciclo de vida ya termino.
    const capturada = facturas.some((f) => f.ticket_origen === t.id_ticket);
    return { recibida, capturada };
  }

  // Tickets ya recibidos (el proveedor subio su archivo) pero sin factura
  // capturada todavia (10/Sep/2026, "no quiero que se muestre el estado de
  // estas en Facturas, para eso esta Admin") - ya no hay tabla/pestana de
  // tickets en esta pantalla, solo un selector chico dentro de "Nueva
  // Factura" para elegir de cual ticket viene (ver abrirRevisionTicket).
  const ticketsParaCapturar = ticketsProveedor.filter(
    (t) => !ticketsOcultos.has(t.id_ticket) && estadoTicketFactura(t).recibida && !estadoTicketFactura(t).capturada
  );

  // Extraido de abrirEdicion
  function formDesdeFactura(f: TesoreriaFactura): typeof FORM_VACIO {
    return {
      timbreUuid: f.timbre_uuid || "",
      comprobanteVersion: f.comprobante_version || "",
      comprobanteSerie: f.comprobante_serie || "",
      comprobanteFolio: f.comprobante_folio || "",
      comprobanteFecha: f.comprobante_fecha ? f.comprobante_fecha.slice(0, 10) : "",
      comprobanteFormaPago: f.comprobante_forma_pago || "",
      comprobanteNoCertificado: f.comprobante_no_certificado || "",
      comprobanteSubTotal: f.comprobante_sub_total || "",
      comprobanteIva: f.comprobante_iva || "",
      comprobanteMoneda: f.comprobante_moneda || "",
      comprobanteExportacion: f.comprobante_exportacion || "",
      comprobanteTipoCambio: f.comprobante_tipo_cambio || "",
      comprobanteTotal: f.comprobante_total || "",
      comprobanteTipoDeComprobante: f.comprobante_tipo_de_comprobante || "I",
      comprobanteMetodoPago: f.comprobante_metodo_pago || "",
      comprobanteLugarExpedicion: f.comprobante_lugar_expedicion || "",
      tipoRelacion: f.tipo_relacion || "",
      uuidRelacionado: f.uuid_relacionado || "",
      emisorRfc: f.emisor_rfc || "",
      emisorNombre: f.emisor_nombre || "",
      emisorRegimenFiscal: f.emisor_regimen_fiscal || "",
      receptorRfc: f.receptor_rfc || "",
      receptorNombre: f.receptor_nombre || "",
      receptorDomicilioFiscalReceptor: f.receptor_domicilio_fiscal_receptor || "",
      receptorRegimenFiscalReceptor: f.receptor_regimen_fiscal_receptor || "",
      receptorUsoCfdi: f.receptor_uso_cfdi || "",
      timbreVersion: f.timbre_version || "",
      timbreFechaTimbrado: f.timbre_fecha_timbrado ? f.timbre_fecha_timbrado.slice(0, 10) : "",
      timbreRfcProvCertif: f.timbre_rfc_prov_certif || "",
      timbreNoCertificadoSat: f.timbre_no_certificado_sat || "",
      tipoFactura: f.tipo_factura || "",
      linkPdf: f.link_pdf || "",
      linkXml: f.link_xml || "",
      categoriaGasto: f.categoria_gasto || "",
    };
  }

  function abrirEdicion(f: TesoreriaFactura, soloLectura = false) {
    setEditing(f);
    setForm(formDesdeFactura(f));
    setFormError(null);
    setTabFactura("Comprobante");
    setIdFlujoParaVincular("");
    setErrorVincularFlujo(null);
    setMensajeAvisoSaldo("");
    setAvisoSaldoEnviado(false);
    setErrorAvisoSaldo(null);
    setModoSoloLectura(soloLectura);
    setExhibiciones([]);
    if (f.comprobante_metodo_pago === "PPD") {
      setCargandoExhibiciones(true);
      listExhibicionesDeFactura(f.timbre_uuid)
        .then(setExhibiciones)
        .catch(() => setExhibiciones([]))
        .finally(() => setCargandoExhibiciones(false));
    }
    setDialogOpen(true);
  }

  // Ciclo de vida de la factura
  async function handleCambiarEstado(nuevoEstado: TesoreriaFacturaEstado) {
    if (!editing) return;
    setCambiandoEstado(true);
    setEstadoError(null);
    try {
      const actualizada = await marcarEstadoFactura(editing.id, nuevoEstado);
      setEditing(actualizada);
      refresh();
    } catch (err) {
      setEstadoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCambiandoEstado(false);
    }
  }

  // Motor Documental
  async function handleConfirmarExtraccionFactura(campos: Record<string, unknown>, archivo?: DriveArchivo) {
    if (!editing) return;
    const actualizada = await confirmarExtraccionFactura(editing.id, campos, archivo);
    setEditing(actualizada);
    setForm(formDesdeFactura(actualizada));
    refresh();
  }

  // Archivo real analizado antes de que la factura exista
  const [archivoNuevaFactura, setArchivoNuevaFactura] = useState<DriveArchivo | undefined>(undefined);
  // Bloquea los campos del CFDI hasta que el Motor Documental ya corrio
  const [motorEjecutadoNuevaFactura, setMotorEjecutadoNuevaFactura] = useState(false);
  const [tabFactura, setTabFactura] = useState<TabFactura>("Comprobante");

  // Prellena `form` cuando el analista sube el escaneo antes de crear la factura
  async function handleAutorellenarNuevaFactura(campos: Record<string, unknown>, archivo?: DriveArchivo) {
    setArchivoNuevaFactura(archivo);
    setMotorEjecutadoNuevaFactura(true);
    setForm((prev) => {
      const siguiente = { ...prev };
      for (const [key, value] of Object.entries(campos)) {
        const llaveForm = aCamelCase(key) as keyof typeof FORM_VACIO;
        if (llaveForm in FORM_VACIO && typeof value === "string") {
          (siguiente as Record<string, string>)[llaveForm] = value;
        }
      }
      return siguiente;
    });
  }

  async function handleGuardar() {
    if (!editing && !form.timbreUuid) {
      setFormError("El UUID de timbrado es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateFactura(editing.id, form);
      } else {
        await createFactura(form, archivoNuevaFactura, idTicketBandeja || undefined);
        setArchivoNuevaFactura(undefined);
        if (idTicketBandeja) {
          setTicketsOcultos((prev) => new Set(prev).add(idTicketBandeja));
        }
        setProveedorBandeja("");
        setIdTicketBandeja("");
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function toggleSeleccionada(id: number) {
    setSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) {
        siguiente.delete(id);
      } else {
        siguiente.add(id);
      }
      return siguiente;
    });
  }

  function abrirEnvioMasivo() {
    const iniciales: Record<number, string> = {};
    for (const f of facturas) {
      if (seleccionadas.has(f.id)) {
        iniciales[f.id] = f.contraparte_email || "";
      }
    }
    setDestinatarios(iniciales);
    setEnvioError(null);
    setEnvioResultados(null);
    setEnvioDialogOpen(true);
  }

  async function handleConfirmarEnvioMasivo() {
    const envios = Array.from(seleccionadas).map((id) => ({ factura: id, destinatario: (destinatarios[id] || "").trim() }));
    if (envios.some((e) => !e.destinatario)) {
      setEnvioError("Todas las facturas seleccionadas necesitan un destinatario.");
      return;
    }
    setEnviando(true);
    setEnvioError(null);
    try {
      const resultados = await enviarMasivoFacturas(envios);
      setEnvioResultados(resultados);
      if (resultados.every((r) => r.enviado)) {
        setSeleccionadas(new Set());
        setEnvioDialogOpen(false);
      }
    } catch (err) {
      setEnvioError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEnviando(false);
    }
  }

  // MUI Select no es un control de formulario nativo - el <fieldset
  // disabled> de mas abajo (que si deshabilita los TextField en bloque)
  // no lo alcanza, hay que pasarle disabled explicito.
  const camposDeshabilitados = editing
    ? !puedeEditar || modoSoloLectura
    : !puedeCrear || !motorEjecutadoNuevaFactura;

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileText size={22} strokeWidth={1.5} />
        <Typography variant="h5">Facturas CFDI</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Facturas recibidas de proveedores (CFDI de ingreso/egreso). Esta vista es de solo consulta: las
        facturas se dan de alta automáticamente desde el Motor Documental.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por folio, UUID o nombre..."
        puedeEditar={puedeEditar}
        seleccionadas={seleccionadas.size}
        onEnviarMasivo={abrirEnvioMasivo}
        onAplicarFiltros={refresh}
        onLimpiarFiltros={() => {
          setFiltroReceptor("");
          setFiltroProveedor(null);
          setFiltroEstado("");
          setFiltroFechaDesde("");
          setFiltroFechaHasta("");
        }}
        actions={
          <Stack direction="row" spacing={1}>
          {puedeCrear && (
            <Button size="small" variant="contained" startIcon={<Plus size={14} strokeWidth={2} />} onClick={abrirAlta}>
              Nueva Factura
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download size={14} strokeWidth={2} />}
            onClick={() =>
              window.open(
                urlExportarFacturasCsv({
                  search: search || undefined,
                  contraparte: filtroProveedor?.id_contraparte || undefined,
                  receptorRfc: filtroReceptor || undefined,
                  fechaDesde: filtroFechaDesde || undefined,
                  fechaHasta: filtroFechaHasta || undefined,
                  estado: filtroEstado || undefined,
                }),
                "_blank"
              )
            }
          >
            Exportar CSV
          </Button>
          </Stack>
        }
      >
        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
            Empresa (receptor)
          </Typography>
          <FormControl size="small" fullWidth>
            <Select
              displayEmpty
              value={filtroReceptor}
              onChange={(e) => setFiltroReceptor(e.target.value)}
            >
              <MenuItem value="">
                <em>Todas</em>
              </MenuItem>
              {sociedadesFiltro.map((s) => (
                <MenuItem key={s.rfc} value={s.rfc}>
                  {s.alias_sociedad || s.razon_social || s.rfc}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
            Proveedor
          </Typography>
          <FormControl size="small" fullWidth>
            <Select
              displayEmpty
              value={filtroProveedor?.id_contraparte ?? ""}
              onChange={(e) =>
                setFiltroProveedor(
                  opcionesProveedor.find((c) => c.id_contraparte === e.target.value) || null
                )
              }
            >
              <MenuItem value="">
                <em>Todos</em>
              </MenuItem>
              {opcionesProveedor.map((c) => (
                <MenuItem key={c.id_contraparte} value={c.id_contraparte}>
                  {c.razon_social || c.id_contraparte}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
            Estado
          </Typography>
          <FormControl size="small" fullWidth>
            <Select
              displayEmpty
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as TesoreriaFacturaEstado | "")}
            >
              <MenuItem value="">
                <em>Todos</em>
              </MenuItem>
              {(Object.keys(ESTADO_LABEL) as TesoreriaFacturaEstado[]).map((e) => (
                <MenuItem key={e} value={e}>
                  {ESTADO_LABEL[e]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
            Categoría de gasto
          </Typography>
          <FormControl size="small" fullWidth>
            <Select
              displayEmpty
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
        </Box>
        <Box sx={{ gridColumn: { sm: "span 2" } }}>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
            Rango de Fecha
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              type="date"
              label="Desde"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Typography variant="body2" color="text.secondary">
              -
            </Typography>
            <TextField
              size="small"
              type="date"
              label="Hasta"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 0 }}
            />
          </Stack>
        </Box>
      </FiltrosBar>

      <Paper variant="outlined">
      {/* Tabla Principal */}
        <>
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
        <TableContainer sx={{ px: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {puedeEditar && <TableCell padding="checkbox" />}
                <TableCell>UUID</TableCell>
                <TableCell>Folio</TableCell>
                <TableCell>Emisor</TableCell>
                <TableCell>Receptor</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell align="right">IVA</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>Estado</span>
                    <Tooltip
                      title={
                        <Stack spacing={0.5} sx={{ py: 0.5 }}>
                          {(Object.keys(ESTADO_LABEL) as TesoreriaFacturaEstado[]).map((e) => (
                            <Typography key={e} variant="caption" component="div">
                              <b>{ESTADO_LABEL[e]}</b> — {ESTADO_DESCRIPCION[e]}
                            </Typography>
                          ))}
                        </Stack>
                      }
                    >
                      <HelpCircle size={14} strokeWidth={1.5} style={{ cursor: "help", opacity: 0.6 }} />
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : facturas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin facturas registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                {facturas.map((f) => (
                  <TableRow key={f.id} hover selected={seleccionadas.has(f.id)}>
                    {puedeEditar && (
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={seleccionadas.has(f.id)} onChange={() => toggleSeleccionada(f.id)} />
                      </TableCell>
                    )}
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{f.timbre_uuid}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {f.comprobante_serie || ""}
                      {f.comprobante_folio || "—"}
                    </TableCell>
                    <TableCell>{f.emisor_nombre || f.emisor_rfc || "—"}</TableCell>
                    <TableCell>{f.receptor_nombre || f.receptor_rfc || "—"}</TableCell>
                    <TableCell>{f.comprobante_fecha ? f.comprobante_fecha.slice(0, 10) : "—"}</TableCell>
                    <TableCell align="right">{f.comprobante_iva || "—"}</TableCell>
                    <TableCell align="right">{f.comprobante_total || "—"}</TableCell>
                    <TableCell>
                      {f.estado && (
                        <Chip size="small" label={ESTADO_LABEL[f.estado]} color={ESTADO_COLOR[f.estado]} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <IconButton
                          size="small"
                          aria-label="Ver"
                          onClick={() => abrirEdicion(f, true)}
                          disabled={!puedeAbrirDetalle}
                        >
                          <Eye size={14} strokeWidth={1.5} />
                        </IconButton>
                        {puedeEditar && (
                          <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(f)}>
                            <Pencil size={14} strokeWidth={1.5} />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                </>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </Box>

        {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
        <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : facturas.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Sin facturas registradas.
            </Typography>
          ) : (
            facturas.map((f) => (
              <Paper key={f.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack direction="row" spacing={1} sx={{ minWidth: 0 }}>
                    {puedeEditar && (
                      <Checkbox
                        size="small"
                        checked={seleccionadas.has(f.id)}
                        onChange={() => toggleSeleccionada(f.id)}
                        sx={{ mt: -0.5, ml: -1 }}
                      />
                    )}
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {f.comprobante_serie || ""}
                      {f.comprobante_folio || "—"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}
                    >
                      {f.timbre_uuid}
                    </Typography>
                  </Stack>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      aria-label="Ver"
                      onClick={() => abrirEdicion(f, true)}
                      disabled={!puedeAbrirDetalle}
                    >
                      <Eye size={14} strokeWidth={1.5} />
                    </IconButton>
                    {puedeEditar && (
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(f)}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
                    )}
                  </Stack>
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Emisor:</strong> {f.emisor_nombre || f.emisor_rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Receptor:</strong> {f.receptor_nombre || f.receptor_rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Fecha:</strong> {f.comprobante_fecha ? f.comprobante_fecha.slice(0, 10) : "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>IVA:</strong> {f.comprobante_iva || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Total:</strong> {f.comprobante_total || "—"}
                  </Typography>
                  {f.estado && (
                    <Stack direction="row" spacing={0.5}>
                      <Chip size="small" label={ESTADO_LABEL[f.estado]} color={ESTADO_COLOR[f.estado]} variant="outlined" />
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
        </>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing
            ? `${modoSoloLectura ? "Ver" : "Editar"} Factura ${editing.comprobante_folio || editing.timbre_uuid}`
            : "Nueva Factura"}
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ py: 3 }}>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          {/* 07/Sep/2026, "hay que darle mas espaciado" - spacing 2 -> 3
              entre grupos de campos, mas padding vertical del dialogo. */}
          <Stack spacing={3}>
            {(editing ? puedeEditar && !modoSoloLectura : puedeCrear) && (
              <>
                <Stack direction="row" spacing={2} alignItems="center">
                  {/* Selector de ticket (10/Sep/2026, "va seguir mediante
                      tickets para tesoreria para facturas pero no quiero que
                      se muestre el estado de estas en facturas") - antes se
                      elegia con "Revisar" en la tabla de tickets (ya
                      removida de esta pantalla, ver Admin > Invitaciones
                      para el ciclo de vida del ticket); ahora se elige aqui
                      mismo, solo entre los ya recibidos y sin factura. */}
                  {!editing && (
                    <FormControl size="small" sx={{ minWidth: 280 }}>
                      <InputLabel id="ticket-origen-label">Proveedor (factura subida por ticket)</InputLabel>
                      <Select
                        labelId="ticket-origen-label"
                        label="Proveedor (factura subida por ticket)"
                        value={idTicketBandeja}
                        onChange={(e) => {
                          const idTicket = e.target.value;
                          const ticket = ticketsParaCapturar.find((t) => t.id_ticket === idTicket);
                          setIdTicketBandeja(idTicket);
                          setProveedorBandeja(ticket?.contraparte || "");
                        }}
                      >
                        <MenuItem value="">
                          <em>Ninguno (bandeja general)</em>
                        </MenuItem>
                        {ticketsParaCapturar.map((t) => (
                          <MenuItem key={t.id_ticket} value={t.id_ticket}>
                            {t.contraparte_nombre} — {new Date(t.issued_at).toLocaleDateString("es-MX")}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<FileSearch size={16} strokeWidth={1.5} />}
                    onClick={() => setMotorAbierto(true)}
                  >
                    Motor Documental
                  </Button>
                </Stack>
              </>
            )}

            {!editing && !motorEjecutadoNuevaFactura && puedeCrear && (
              <Alert severity="info" sx={{ mb: 1 }}>
                Usa el Motor Documental para llenar la factura — la edición manual se habilita después,
                solo para revisar/corregir lo que la IA extrajo.
              </Alert>
            )}
            <Tabs
              value={tabFactura}
              onChange={(_, v) => setTabFactura(v)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
            >
              {TABS_FACTURA.map((t) => (
                <Tab key={t} label={t} value={t} />
              ))}
            </Tabs>
            <fieldset
              disabled={camposDeshabilitados}
              style={{ border: 0, margin: 0, padding: 0, display: "contents" }}
            >
            {/* mt manual: el fieldset es display:contents, el margen que le
            pondria el Stack exterior no tiene efecto sobre el (no genera
            caja propia) - se aplica aqui, en su hijo real. */}
            <Stack spacing={2} sx={{ mt: 3 }}>
            {tabFactura === "Comprobante" && (
            <>
            <TextField
              size="small"
              label="UUID de timbrado"
              value={form.timbreUuid}
              onChange={(e) => setForm({ ...form, timbreUuid: e.target.value })}
              disabled={!!editing}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
              <TextField
                size="small"
                label="Serie"
                value={form.comprobanteSerie}
                onChange={(e) => setForm({ ...form, comprobanteSerie: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Folio"
                value={form.comprobanteFolio}
                onChange={(e) => setForm({ ...form, comprobanteFolio: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                type="date"
                label="Fecha del comprobante"
                value={form.comprobanteFecha}
                onChange={(e) => setForm({ ...form, comprobanteFecha: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label="Moneda"
                value={form.comprobanteMoneda}
                onChange={(e) => setForm({ ...form, comprobanteMoneda: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-comprobante-label">Tipo de comprobante</InputLabel>
                <Select
                  labelId="tipo-comprobante-label"
                  label="Tipo de comprobante"
                  value={form.comprobanteTipoDeComprobante}
                  onChange={(e) => setForm({ ...form, comprobanteTipoDeComprobante: e.target.value })}
                  disabled={camposDeshabilitados}
                >
                  <MenuItem value="I">Ingreso (I)</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="metodo-pago-label">Método de pago</InputLabel>
                <Select
                  labelId="metodo-pago-label"
                  label="Método de pago"
                  value={form.comprobanteMetodoPago}
                  onChange={(e) => setForm({ ...form, comprobanteMetodoPago: e.target.value as "" | "PUE" | "PPD" })}
                  disabled={camposDeshabilitados}
                >
                  <MenuItem value="">
                    <em>Sin especificar</em>
                  </MenuItem>
                  <MenuItem value="PUE">PUE — Pago en una sola exhibición</MenuItem>
                  <MenuItem value="PPD">PPD — Pago en parcialidades o diferido</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Forma de pago"
                value={form.comprobanteFormaPago}
                onChange={(e) => setForm({ ...form, comprobanteFormaPago: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Versión del comprobante"
                value={form.comprobanteVersion}
                onChange={(e) => setForm({ ...form, comprobanteVersion: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="No. certificado"
                value={form.comprobanteNoCertificado}
                onChange={(e) => setForm({ ...form, comprobanteNoCertificado: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Lugar de expedición"
                value={form.comprobanteLugarExpedicion}
                onChange={(e) => setForm({ ...form, comprobanteLugarExpedicion: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Exportación"
                value={form.comprobanteExportacion}
                onChange={(e) => setForm({ ...form, comprobanteExportacion: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Tipo de factura"
                value={form.tipoFactura}
                onChange={(e) => setForm({ ...form, tipoFactura: e.target.value })}
                fullWidth
              />
            </Stack>
            </>
            )}
            {tabFactura === "Montos" && (
            <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Subtotal"
                value={form.comprobanteSubTotal}
                onChange={(e) => setForm({ ...form, comprobanteSubTotal: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="IVA"
                value={form.comprobanteIva}
                onChange={(e) => setForm({ ...form, comprobanteIva: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Total"
                value={form.comprobanteTotal}
                onChange={(e) => setForm({ ...form, comprobanteTotal: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Tipo de cambio"
              value={form.comprobanteTipoCambio}
              onChange={(e) => setForm({ ...form, comprobanteTipoCambio: e.target.value })}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="factura-categoria-gasto-label">Categoría de gasto</InputLabel>
              <Select
                labelId="factura-categoria-gasto-label"
                label="Categoría de gasto"
                value={form.categoriaGasto}
                onChange={(e) => setForm({ ...form, categoriaGasto: e.target.value as TesoreriaCategoriaGasto | "" })}
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
            </>
            )}
            {tabFactura === "Emisor y Receptor" && (
            <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="RFC emisor"
                value={form.emisorRfc}
                onChange={(e) => setForm({ ...form, emisorRfc: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Nombre emisor"
                value={form.emisorNombre}
                onChange={(e) => setForm({ ...form, emisorNombre: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Régimen fiscal emisor"
              value={form.emisorRegimenFiscal}
              onChange={(e) => setForm({ ...form, emisorRegimenFiscal: e.target.value })}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="RFC receptor"
                value={form.receptorRfc}
                onChange={(e) => setForm({ ...form, receptorRfc: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Nombre receptor"
                value={form.receptorNombre}
                onChange={(e) => setForm({ ...form, receptorNombre: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Domicilio fiscal receptor"
              value={form.receptorDomicilioFiscalReceptor}
              onChange={(e) => setForm({ ...form, receptorDomicilioFiscalReceptor: e.target.value })}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Régimen fiscal receptor"
                value={form.receptorRegimenFiscalReceptor}
                onChange={(e) => setForm({ ...form, receptorRegimenFiscalReceptor: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Uso CFDI"
                value={form.receptorUsoCfdi}
                onChange={(e) => setForm({ ...form, receptorUsoCfdi: e.target.value })}
                fullWidth
              />
            </Stack>
            </>
            )}
            {tabFactura === "Timbrado" && (
            <>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Versión del timbre"
                value={form.timbreVersion}
                onChange={(e) => setForm({ ...form, timbreVersion: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Fecha de timbrado"
                value={form.timbreFechaTimbrado}
                onChange={(e) => setForm({ ...form, timbreFechaTimbrado: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="RFC proveedor certificador"
                value={form.timbreRfcProvCertif}
                onChange={(e) => setForm({ ...form, timbreRfcProvCertif: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="No. certificado SAT"
                value={form.timbreNoCertificadoSat}
                onChange={(e) => setForm({ ...form, timbreNoCertificadoSat: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-relacion-label">Tipo de relación (opcional)</InputLabel>
                <Select
                  labelId="tipo-relacion-label"
                  label="Tipo de relación (opcional)"
                  value={form.tipoRelacion}
                  onChange={(e) => setForm({ ...form, tipoRelacion: e.target.value })}
                  disabled={camposDeshabilitados}
                >
                  <MenuItem value="">
                    <em>No relaciona ningún otro CFDI</em>
                  </MenuItem>
                  {TIPO_RELACION_OPCIONES.map((op) => (
                    <MenuItem key={op.value} value={op.value}>
                      {op.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {form.tipoRelacion && (
                <TextField
                  size="small"
                  label="UUID del CFDI relacionado"
                  value={form.uuidRelacionado}
                  onChange={(e) => setForm({ ...form, uuidRelacionado: e.target.value })}
                  fullWidth
                />
              )}
            </Stack>
            </>
            )}

            </Stack>
            </fieldset>
            {/* Documentos vive FUERA del fieldset a proposito (09/Sep/2026,
                "solo aparece el ojo para que puedan verlo") - "Ver" no debe
                depender del permiso de edicion ni del modo solo lectura, el
                fieldset lo estaba deshabilitando justo cuando mas se
                necesitaba (al abrir con el ojito). Solo el link manual
                (unico control editable aqui) se deshabilita a mano. */}
            {tabFactura === "Documentos" && (
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                  <Typography variant="caption" color="text.secondary">
                    Los documentos se traen directo de Drive - no se aceptan links pegados a mano.
                  </Typography>
                  {editing && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={sincronizandoFactura ? <CircularProgress size={14} /> : <RefreshCw size={14} strokeWidth={1.5} />}
                      onClick={handleSincronizarDriveFactura}
                      disabled={sincronizandoFactura}
                    >
                      Sincronizar con Drive
                    </Button>
                  )}
                </Stack>
                {errorSincronizarFactura && (
                  <Alert severity="error" onClose={() => setErrorSincronizarFactura(null)}>
                    {errorSincronizarFactura}
                  </Alert>
                )}
                {(["pdf", "xml"] as const).map((tipo) => {
                  const driveFileId = tipo === "pdf" ? editing?.drive_file_id_pdf : editing?.drive_file_id_xml;
                  const pendienteDeGuardar = !editing && tipo === "pdf" && Boolean(archivoNuevaFactura);
                  return (
                    <Paper key={tipo} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          {tipo === "pdf" ? (
                            <FileText size={18} strokeWidth={1.5} />
                          ) : (
                            <FileCode2 size={18} strokeWidth={1.5} />
                          )}
                          <Typography variant="body2">{tipo === "pdf" ? "Factura (PDF)" : "Comprobante Fiscal (XML)"}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <IconButton
                            size="small"
                            aria-label={tipo === "pdf" ? "Ver PDF" : "Abrir XML en Drive"}
                            title={tipo === "pdf" ? "Ver PDF" : "Abrir XML en Drive"}
                            disabled={!driveFileId}
                            onClick={() => {
                              if (!editing || !driveFileId) return;
                              if (tipo === "pdf") {
                                setPreviewDoc({
                                  url: urlVerFacturaPdf(editing.id),
                                  titulo: `Factura ${editing.comprobante_folio || editing.timbre_uuid} — PDF`,
                                  urlExterna: urlDriveWebView(driveFileId),
                                });
                              } else {
                                window.open(urlDriveWebView(driveFileId), "_blank", "noopener,noreferrer");
                              }
                            }}
                          >
                            {tipo === "pdf" ? (
                              <Eye size={16} strokeWidth={1.5} />
                            ) : (
                              <ExternalLink size={16} strokeWidth={1.5} />
                            )}
                          </IconButton>
                          <Chip
                            size="small"
                            color={driveFileId ? "success" : pendienteDeGuardar ? "warning" : "default"}
                            label={
                              driveFileId
                                ? "Disponible en Drive"
                                : pendienteDeGuardar
                                  ? "Analizado — se vincula al guardar"
                                  : "Sin archivo"
                            }
                          />
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
            {tabFactura === "Proceso" && editing && (
              <Stack spacing={2.5}>
                {editing.contraparte && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      <strong>Proveedor:</strong> {editing.contraparte_nombre || editing.emisor_nombre || "—"}
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                      onClick={() => setPanelReferencia({ tipo: "proveedor", id: editing.contraparte as string })}
                    >
                      Ver proveedor
                    </Button>
                  </Stack>
                )}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Estado del Proceso</Typography>
                    {estadoError && (
                      <Alert severity="error" onClose={() => setEstadoError(null)}>
                        {estadoError}
                      </Alert>
                    )}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        size="small"
                        label={editing.estado ? ESTADO_LABEL[editing.estado] : "—"}
                        color={editing.estado ? ESTADO_COLOR[editing.estado] : "default"}
                      />
                      {!modoSoloLectura && puedeAprobar && editing.estado !== "EN_PROCESO" && (
                        <Button size="small" onClick={() => handleCambiarEstado("EN_PROCESO")} disabled={cambiandoEstado}>
                          Marcar en proceso
                        </Button>
                      )}
                      {!modoSoloLectura && puedeAprobar && editing.estado !== "ACEPTADA" && (
                        <Button
                          size="small"
                          color="success"
                          startIcon={<CheckCircle2 size={14} strokeWidth={1.5} />}
                          onClick={() => handleCambiarEstado("ACEPTADA")}
                          disabled={cambiandoEstado}
                        >
                          Aceptar
                        </Button>
                      )}
                      {!modoSoloLectura && puedeAprobar && editing.estado !== "RECHAZADA" && (
                        <Button
                          size="small"
                          color="error"
                          startIcon={<XCircle size={14} strokeWidth={1.5} />}
                          onClick={() => handleCambiarEstado("RECHAZADA")}
                          disabled={cambiandoEstado}
                        >
                          Rechazar
                        </Button>
                      )}
                    </Stack>
                    {!modoSoloLectura &&
                      editing.estado !== "ACEPTADA" &&
                      !((editing.drive_file_id_pdf || editing.link_pdf) && (editing.drive_file_id_xml || editing.link_xml)) && (
                      <Typography variant="caption" color="text.secondary">
                        Para aceptar hace falta que el PDF y el XML ya estén en Drive.
                      </Typography>
                    )}
                  </Stack>
                </Paper>
                {/* Aviso de saldo PPD pendiente (10/Sep/2026, pendiente
                real de Jenny: "aviso por correo de saldo PPD pendiente") -
                solo aplica si es PPD y todavia le queda saldo. */}
                {editing.comprobante_metodo_pago === "PPD" &&
                  editing.saldo_pendiente_exhibiciones != null &&
                  Number(editing.saldo_pendiente_exhibiciones) > 0 && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Saldo PPD pendiente</Typography>
                        {errorAvisoSaldo && (
                          <Alert severity="error" onClose={() => setErrorAvisoSaldo(null)}>
                            {errorAvisoSaldo}
                          </Alert>
                        )}
                        <Typography variant="body2" color="text.secondary">
                          Todavía debe {Number(editing.saldo_pendiente_exhibiciones).toLocaleString("es-MX", {
                            style: "currency",
                            currency: "MXN",
                          })}{" "}
                          por cubrir con su complemento de pago.
                        </Typography>
                        {avisoSaldoEnviado ? (
                          <Alert severity="success">Aviso enviado.</Alert>
                        ) : (
                          puedeEditar &&
                          !modoSoloLectura && (
                            <>
                              <TextField
                                size="small"
                                multiline
                                minRows={2}
                                label="Mensaje (opcional)"
                                value={mensajeAvisoSaldo}
                                onChange={(e) => setMensajeAvisoSaldo(e.target.value)}
                              />
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={enviandoAvisoSaldo}
                                onClick={handleAvisoSaldoPendiente}
                                sx={{ alignSelf: "flex-start" }}
                              >
                                {enviandoAvisoSaldo ? <CircularProgress size={14} /> : "Enviar aviso de saldo pendiente"}
                              </Button>
                            </>
                          )
                        )}
                      </Stack>
                    </Paper>
                  )}
                {/* Exhibiciones/REPs ya recibidos (10/Sep/2026, "mostrar la
                lista...dentro de la misma factura, asi es mas visual") -
                historial real de parcialidades, viene del REP timbrado,
                no es editable a mano. */}
                {editing.comprobante_metodo_pago === "PPD" && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">Exhibiciones recibidas</Typography>
                      {cargandoExhibiciones ? (
                        <CircularProgress size={16} />
                      ) : exhibiciones.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Todavía no se ha recibido ningún complemento de pago (REP) para esta factura.
                        </Typography>
                      ) : (
                        <Stack spacing={0.5}>
                          {exhibiciones.map((e) => (
                            <Stack
                              key={e.id}
                              direction="row"
                              spacing={2}
                              sx={{ border: 1, borderColor: "divider", borderRadius: 0, p: 1 }}
                            >
                              <Typography variant="body2" sx={{ minWidth: 90 }}>
                                Parcialidad {e.num_parcialidad ?? "—"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                                Saldo anterior: {e.imp_saldo_ant ? Number(e.imp_saldo_ant).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : "—"}
                              </Typography>
                              <Typography variant="body2" color="success.main">
                                Pagado: {e.imp_pagado ? Number(e.imp_pagado).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : "—"}
                              </Typography>
                              <Typography variant="body2" color={e.imp_saldo_insoluto && Number(e.imp_saldo_insoluto) > 0 ? "error.main" : "text.secondary"}>
                                Saldo insoluto: {e.imp_saldo_insoluto ? Number(e.imp_saldo_insoluto).toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : "$0.00"}
                              </Typography>
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                )}
                {/* Vinculacion factura->flujo - sentido inverso al que ya
                    existia desde Flujos. */}
                {puedeEditar && !modoSoloLectura && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">Vincular a un Flujo</Typography>
                      {errorVincularFlujo && <Alert severity="error">{errorVincularFlujo}</Alert>}
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <TextField
                          size="small"
                          label="ID de flujo (ej. FLJ-000123)"
                          value={idFlujoParaVincular}
                          onChange={(e) => setIdFlujoParaVincular(e.target.value)}
                          fullWidth
                        />
                        <Button
                          variant="outlined"
                          onClick={handleVincularFlujo}
                          disabled={vinculandoFlujo || !idFlujoParaVincular.trim()}
                        >
                          {vinculandoFlujo ? <CircularProgress size={16} /> : "Vincular"}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                )}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField size="small" label="Registrado por" value={editing.created_by || "—"} disabled fullWidth />
                    <TextField size="small" label="Modificado por" value={editing.updated_by || "—"} disabled fullWidth />
                  </Stack>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <PanelConceptos uuidFactura={editing.timbre_uuid} puedeEditar={puedeEditar} />
                    <Divider />
                    <PanelTraslados uuidFactura={editing.timbre_uuid} puedeEditar={puedeEditar} />
                  </Stack>
                </Paper>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{modoSoloLectura ? "Cerrar" : "Cancelar"}</Button>
          {!modoSoloLectura && (
            <Button
              variant="contained"
              onClick={handleGuardar}
              disabled={saving || (!editing && !motorEjecutadoNuevaFactura)}
            >
              {saving ? <CircularProgress size={16} /> : "Guardar"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={envioDialogOpen} onClose={() => setEnvioDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Enviar por correo ({seleccionadas.size})
          <IconButton onClick={() => setEnvioDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {envioError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {envioError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Se manda un correo individual por factura, cada uno con su propio destinatario. Prellenado con el
            correo de la contraparte cuando existe — puedes cambiarlo.
          </Typography>
          <List disablePadding>
            {facturas
              .filter((f) => seleccionadas.has(f.id))
              .map((f) => {
                const resultado = envioResultados?.find((r) => r.factura === f.id);
                return (
                  <ListItem key={f.id} disableGutters sx={{ display: "block", py: 1 }}>
                    <Stack spacing={0.5}>
                      <Typography variant="body2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                        {f.comprobante_serie || ""}
                        {f.comprobante_folio || f.timbre_uuid} — {f.contraparte_nombre || f.emisor_nombre || "—"}
                      </Typography>
                      <TextField
                        size="small"
                        placeholder="correo@dominio.com"
                        value={destinatarios[f.id] || ""}
                        onChange={(e) => setDestinatarios({ ...destinatarios, [f.id]: e.target.value })}
                        fullWidth
                      />
                      {resultado && (
                        <Typography variant="caption" color={resultado.enviado ? "success.main" : "error.main"}>
                          {resultado.enviado ? "Enviado." : resultado.detail || "No se pudo enviar."}
                        </Typography>
                      )}
                    </Stack>
                  </ListItem>
                );
              })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnvioDialogOpen(false)}>Cerrar</Button>
          <Button variant="contained" onClick={handleConfirmarEnvioMasivo} disabled={enviando}>
            {enviando ? <CircularProgress size={16} /> : "Enviar"}
          </Button>
        </DialogActions>
      </Dialog>

      <MotorDocumentalDialog
        open={motorAbierto}
        onClose={() => setMotorAbierto(false)}
        contexto={
          editing
            ? {
                etiqueta: `factura ${editing.comprobante_folio || editing.timbre_uuid}`,
                servicioSolicitante: "tesoreria-service",
                // Convencion de carpeta propia de Facturacion CFDI (24/Ago/2026) -
                // el analista sube el PDF/XML ahi mismo en drive.google.com antes
                // de analizarlo, mismo criterio "Drive-first" que PLD.
                carpeta: `Tesoreria/Facturas/${editing.timbre_uuid}`,
                permKey: "facturacion-cfdi.crear",
                expectedDocumentType: "tesoreria.cfdi_factura",
                camposConfirmables: TESORERIA_CAMPOS_CONFIRMABLES,
                onConfirmar: handleConfirmarExtraccionFactura,
              }
            : {
                // Caso de uso real (24/Ago/2026, renombrada y subdividida
                // por proveedor 27/Ago/2026): la factura todavia no existe -
                // el analista sube el escaneo directo a esta carpeta antes
                // de darla de alta; el mismo lugar donde el ticket público
                // de proveedores (TesoreriaTicketProveedorViewSet.
                // subir_factura) deja el PDF real que sube el proveedor,
                // ya subdividido por proveedorBandeja (id_contraparte) y,
                // dentro de esa, por id_ticket (08/Sep/2026 - cada
                // solicitud/ticket es su propia subcarpeta, para que una
                // contraparte con varias unidades de negocio -ej. IZEL
                // Acuario vs IZEL Restaurante- nunca mezcle los archivos de
                // una solicitud con los de otra) - sin elegir proveedor, cae
                // a la bandeja general (raiz de FacturasProveedores, solo
                // staging manual del analista).
                // No hay id de factura que mandar a confirmar_extraccion,
                // por eso onConfirmar solo prellena `form` en vez de llamar
                // al backend.
                etiqueta: "una factura nueva",
                servicioSolicitante: "tesoreria-service",
                carpeta: proveedorBandeja
                  ? `Tesoreria/Facturas/FacturasProveedores/${proveedorBandeja}${
                      idTicketBandeja ? `/${idTicketBandeja}` : ""
                    }`
                  : "Tesoreria/Facturas/FacturasProveedores",
                permKey: "facturacion-cfdi.crear",
                expectedDocumentType: "tesoreria.cfdi_factura",
                camposConfirmables: TESORERIA_CAMPOS_CONFIRMABLES_NUEVA,
                onConfirmar: handleAutorellenarNuevaFactura,
              }
        }
      />
      <DocumentoPreviewDialog
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        url={previewDoc?.url ?? null}
        titulo={previewDoc?.titulo ?? ""}
        urlExterna={previewDoc?.urlExterna}
      />
      <PanelReferenciaCruzada referencia={panelReferencia} onClose={() => setPanelReferencia(null)} />
    </AppShell>
  );
}
