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
  InputAdornment,
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
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCircle2,
  ExternalLink,
  FileSearch,
  FileText,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  X as CloseIcon,
  XCircle,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { SessionUser, getSession } from "@/lib/auth";
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
  listFacturaTraslados,
  listFacturas,
  marcarEstadoFactura,
  updateFactura,
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
  comprobanteMoneda: "",
  comprobanteExportacion: "",
  comprobanteTipoCambio: "",
  comprobanteTotal: "",
  // Catalogo real del SAT (c_TipoDeComprobante) - en esta pantalla siempre
  // "I" (Ingreso): Egreso/Pago/Nomina ya tienen su propia tabla y pantalla
  // (Notas de credito, Complementos de pago, Rec-nominas), ver
  // TesoreriaFacturaMetodoPago en tesoreria.ts.
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
};

// c_TipoRelacion del SAT - solo aplica si esta factura sustituye o se
// relaciona con otro CFDI ya timbrado (nodo CfdiRelacionados). Subconjunto
// mas comun, no el catalogo completo.
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

// snake_case (nombres de columna, tal como los pide el prompt
// "tesoreria.cfdi_factura" en docint/prompts.py) -> camelCase (llaves de
// `form` arriba) - convertir aqui en vez de duplicar el prompt con nombres
// de campo distintos a los reales del modelo.
function aCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, letra) => letra.toUpperCase());
}

// Conceptos de una factura ya guardada (Sem 20, CRUD real agregado
// 24/Ago/2026 - antes solo se veian de solo lectura aqui, ver
// tesoreria/views.py::FacturaConceptoViewSet). Sin FK real hacia
// TesoreriaFactura en el ERD - el enlace es logico por uuid=timbre_uuid,
// por eso solo existe una vez que la factura ya tiene timbre_uuid guardado
// (no se puede agregar un concepto antes de crear la factura).
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

// Lineas de impuesto trasladado - mismo criterio de enlace logico por uuid
// que Conceptos (ver FacturaTrasladoViewSet).
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
      <Typography variant="subtitle2">Impuestos trasladados</Typography>
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

// Facturacion CFDI (Sem 20 del cronograma, CRUD real agregado 24/Ago/2026 -
// ver tesoreria-service/tesoreria/views.py::TesoreriaFacturaViewSet). Alta
// manual mientras no exista el motor que la llene desde el Motor Documental
// (lectura de PDF/XML) - por ahora cualquier campo se captura a mano, igual
// criterio que Contratos. Permiso propio "facturacion-cfdi.crear/.editar".
export default function TesoreriaFacturasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [facturas, setFacturas] = useState<TesoreriaFactura[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaFactura | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [motorAbierto, setMotorAbierto] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [estadoError, setEstadoError] = useState<string | null>(null);

  // Envio masivo por correo (26/Ago/2026, finanzas.md: "Multiple invoices
  // can be selected to send massively (separately)") - seleccion en la
  // tabla, un correo INDIVIDUAL por factura al confirmar (ver
  // TesoreriaFacturaViewSet.enviar_masivo).
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());
  const [envioDialogOpen, setEnvioDialogOpen] = useState(false);
  const [destinatarios, setDestinatarios] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [envioError, setEnvioError] = useState<string | null>(null);
  const [envioResultados, setEnvioResultados] = useState<EnvioMasivoResultado[] | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("facturacion-cfdi.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("facturacion-cfdi.editar") ?? false;

  function refresh() {
    setLoading(true);
    listFacturas(search || undefined)
      .then(setFacturas)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  // Extraido de abrirEdicion (24/Ago/2026) para reusarlo tambien despues de
  // confirmar una extraccion del Motor Documental - mismo mapeo, sin
  // duplicarlo entre los dos flujos que necesitan refrescar `form` desde
  // una TesoreriaFactura ya guardada.
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
    };
  }

  function abrirEdicion(f: TesoreriaFactura) {
    setEditing(f);
    setForm(formDesdeFactura(f));
    setFormError(null);
    setDialogOpen(true);
  }

  // Ciclo de vida de la factura (24/Ago/2026, pedido explicito de Mariana) -
  // ACEPTADA la rechaza el backend con 400 si faltan link_pdf/link_xml
  // (ver TesoreriaFacturaViewSet.marcar_estado), ese mensaje real se
  // muestra tal cual via friendlyApiError.
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

  // Motor Documental (24/Ago/2026) - unico camino que puede escribir en una
  // factura ya guardada sin pasar por el formulario a mano (ver
  // TesoreriaFacturaViewSet.confirmar_extraccion). Actualiza `editing`/`form`
  // con la respuesta real del backend en vez de solo confiar en los datos
  // que el analista vio en pantalla (ej. si el backend ignoro algun campo).
  async function handleConfirmarExtraccionFactura(campos: Record<string, unknown>) {
    if (!editing) return;
    const actualizada = await confirmarExtraccionFactura(editing.id, campos);
    setEditing(actualizada);
    setForm(formDesdeFactura(actualizada));
    refresh();
  }

  // Caso de uso real (24/Ago/2026): alguien sube el escaneo/foto de la
  // factura a Drive ANTES de que exista el registro (a futuro desde
  // MiCumbres) - aqui todavia no hay id que mandar a confirmar_extraccion,
  // asi que solo se prellena `form` con lo que salio del analisis; el
  // analista revisa/corrige y da "Guardar" como si lo hubiera tecleado el
  // mismo. Sin llamada al backend - createFactura() ya se encarga de
  // validar/guardar cuando el usuario confirme el formulario.
  async function handleAutorellenarNuevaFactura(campos: Record<string, unknown>) {
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
        await createFactura(form);
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

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileText size={22} strokeWidth={1.5} />
        <Typography variant="h5">Facturas CFDI</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Facturas recibidas de proveedores (CFDI de ingreso/egreso), alta manual mientras no exista el motor
        automático de lectura de PDF/XML.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar por folio, UUID o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, maxWidth: 320 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} strokeWidth={1.5} />
                </InputAdornment>
              ),
            }}
          />
          {puedeEditar && seleccionadas.size > 0 && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Mail size={14} strokeWidth={2} />}
              onClick={abrirEnvioMasivo}
              sx={{ ml: { sm: "auto" } }}
            >
              Enviar por correo ({seleccionadas.size})
            </Button>
          )}
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: seleccionadas.size > 0 ? 0 : "auto" } }}
            >
              Nueva factura
            </Button>
          )}
        </Stack>
        {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza por
        tarjetas apiladas (ver abajo) - una tabla de 8 columnas no cabe en un
        telefono sin scroll horizontal incomodo. */}
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {puedeEditar && <TableCell padding="checkbox" />}
                <TableCell>UUID</TableCell>
                <TableCell>Folio</TableCell>
                <TableCell>Emisor</TableCell>
                <TableCell>Receptor</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : facturas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin facturas registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                facturas.map((f) => (
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
                    <TableCell align="right">{f.comprobante_total || "—"}</TableCell>
                    <TableCell>
                      {f.estado && (
                        <Chip size="small" label={ESTADO_LABEL[f.estado]} color={ESTADO_COLOR[f.estado]} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {f.link_pdf && (
                          <IconButton
                            size="small"
                            aria-label="Ver PDF"
                            component="a"
                            href={f.link_pdf}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={14} strokeWidth={1.5} />
                          </IconButton>
                        )}
                        <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(f)} disabled={!puedeEditar}>
                          <Pencil size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Stack>
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
                    {f.link_pdf && (
                      <IconButton
                        size="small"
                        aria-label="Ver PDF"
                        component="a"
                        href={f.link_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} strokeWidth={1.5} />
                      </IconButton>
                    )}
                    <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(f)} disabled={!puedeEditar}>
                      <Pencil size={14} strokeWidth={1.5} />
                    </IconButton>
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
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar factura ${editing.comprobante_folio || editing.timbre_uuid}` : "Nueva factura"}
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            {(editing ? puedeEditar : puedeCrear) && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<FileSearch size={16} strokeWidth={1.5} />}
                onClick={() => setMotorAbierto(true)}
                sx={{ alignSelf: "flex-start" }}
              >
                Motor Documental
              </Button>
            )}
            <TextField
              size="small"
              label="UUID de timbrado"
              value={form.timbreUuid}
              onChange={(e) => setForm({ ...form, timbreUuid: e.target.value })}
              disabled={!!editing}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
                label="Tipo de cambio"
                value={form.comprobanteTipoCambio}
                onChange={(e) => setForm({ ...form, comprobanteTipoCambio: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Total"
              value={form.comprobanteTotal}
              onChange={(e) => setForm({ ...form, comprobanteTotal: e.target.value })}
              fullWidth
            />
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Link al PDF (vista previa)"
                value={form.linkPdf}
                onChange={(e) => setForm({ ...form, linkPdf: e.target.value })}
                fullWidth
                InputProps={{
                  endAdornment: form.linkPdf && (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label="Ver PDF"
                        component="a"
                        href={form.linkPdf}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} strokeWidth={1.5} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                size="small"
                label="Link al XML (comprobante fiscal)"
                value={form.linkXml}
                onChange={(e) => setForm({ ...form, linkXml: e.target.value })}
                fullWidth
                InputProps={{
                  endAdornment: form.linkXml && (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label="Ver XML"
                        component="a"
                        href={form.linkXml}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} strokeWidth={1.5} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
            {editing && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField size="small" label="Registrado por" value={editing.created_by || "—"} disabled fullWidth />
                <TextField size="small" label="Modificado por" value={editing.updated_by || "—"} disabled fullWidth />
              </Stack>
            )}
            {editing && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Estado del proceso</Typography>
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
                  {puedeEditar && editing.estado !== "EN_PROCESO" && (
                    <Button size="small" onClick={() => handleCambiarEstado("EN_PROCESO")} disabled={cambiandoEstado}>
                      Marcar en proceso
                    </Button>
                  )}
                  {puedeEditar && editing.estado !== "ACEPTADA" && (
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
                  {puedeEditar && editing.estado !== "RECHAZADA" && (
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
                {editing.estado !== "ACEPTADA" && (!editing.link_pdf || !editing.link_xml) && (
                  <Typography variant="caption" color="text.secondary">
                    Para aceptar hace falta cargar el link al PDF y al XML.
                  </Typography>
                )}
              </Stack>
            )}
            {editing && (
              <>
                <Divider sx={{ pt: 1 }} />
                <PanelConceptos uuidFactura={editing.timbre_uuid} puedeEditar={puedeEditar} />
                <PanelTraslados uuidFactura={editing.timbre_uuid} puedeEditar={puedeEditar} />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardar} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
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
                // Caso de uso real (24/Ago/2026): la factura todavia no
                // existe - hoy el analista sube el escaneo directo a esta
                // carpeta "bandeja" antes de darla de alta; a futuro,
                // MiCumbres subira ahi mismo lo que capture un empleado
                // (ver memoria de sesion "rrhh-mi-cumbres-y-modulo-
                // pendiente" - ese portal todavia no existe). No hay id de
                // factura que mandar a confirmar_extraccion, por eso
                // onConfirmar solo prellena `form` en vez de llamar al
                // backend.
                etiqueta: "una factura nueva",
                servicioSolicitante: "tesoreria-service",
                carpeta: "Tesoreria/Facturas/Bandeja de entrada",
                permKey: "facturacion-cfdi.crear",
                expectedDocumentType: "tesoreria.cfdi_factura",
                camposConfirmables: TESORERIA_CAMPOS_CONFIRMABLES_NUEVA,
                onConfirmar: handleAutorellenarNuevaFactura,
              }
        }
      />
    </AppShell>
  );
}
