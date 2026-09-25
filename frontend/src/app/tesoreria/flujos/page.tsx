"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Banknote,
  Copy,
  ExternalLink,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  HelpCircle,
  Link2,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  ThumbsUp,
  Undo2,
  Upload,
  X,
  X as CloseIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import CuentaBancariaSelector from "@/components/CuentaBancariaSelector";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import PanelReferenciaCruzada, { ReferenciaCruzada } from "@/components/PanelReferenciaCruzada";
import { MIME_TYPES_COMPROBANTE } from "@/lib/googleDriveFilePicker";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { CATEGORIA_GASTO_LABELS, TesoreriaCategoriaGasto } from "@/lib/miCumbres";
import FiltrosBar from "@/components/FiltrosBar";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import SelectorArchivoLocalODrive from "@/components/SelectorArchivoLocalODrive";
import { ToggleCard } from "@/components/ToggleCard";
import { SessionUser, getSession } from "@/lib/auth";
import { useExportarSheets } from "@/lib/useExportarSheets";
import {
  TESORERIA_FLUJO_CAMPOS_CONFIRMABLES,
  TesoreriaComplementoPago,
  TesoreriaContrato,
  TesoreriaCuenta,
  TesoreriaFactura,
  TesoreriaFacturaSugerida,
  TesoreriaFlujo,
  TesoreriaNomina,
  TesoreriaRecNomina,
  TesoreriaValidacionEstado,
  aprobarFlujo,
  confirmarConciliacionFlujo,
  createFlujo,
  createRecNomina,
  exportarFlujosSheets,
  getContratoGenericoNomina,
  getContratoGenericoReembolsoPorSociedad,
  listComplementosPago,
  listContratos,
  listCuentas,
  listFacturas,
  listFlujos,
  listNominas,
  listRecNominas,
  rechazarFlujo,
  registrarPagoFlujo,
  subirComprobanteFlujo,
  subirReferenciaFlujo,
  urlVerComprobanteFlujo,
  urlVerComplementoPagoPdf,
  urlVerFacturaPdf,
  urlVerReferenciaFlujo,
  updateFlujo,
  vincularFactura,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  // Detalles
  contrato: "",
  // periodoNomina (10/Sep/2026, modulo de Nominas Fase 1) - opcional, solo
  // presente si el Flujo es una linea de pago de una Nomina. Al elegirse
  // autocompleta contrato/concepto (ver onChange del selector en Detalles).
  periodoNomina: "",
  cuenta: "",
  totalMxp: "",
  fechaEfectiva: new Date().toISOString().slice(0, 10),
  concepto: "",
  reembolso: false,
  idEmpleadoReembolso: "",
  comentarios: "",
  fechaPagoOriginal: "",
  linkComprobanteBanco: "",
  categoriaGasto: "" as TesoreriaCategoriaGasto | "",
  // Referencias
  idEmpleado: "",
  idRequisicion: "",
  linkReferencia: "",
  // CFDI
  estadoCfdi: "",
  requiereComplemento: false,
  // Control
  comprobacionAsignadaA: "",
  aprobacionLista: false,
  permisoEnviarPago: "",
  permiso: "",
  informacionEnvio: "",
};

// Pestañas del formulario de creacion (25/Ago/2026) - agrupan los 36
// campos de tesoreria_flujos (20260727_Cumbres_ERD.sql) segun a que le
// sirven: Detalles = datos del movimiento, Referencias = comprobantes y
// enlaces del pago, CFDI = lo que se conecta con facturacion (factura/
// complemento/nomina se ligan aparte con vincular_factura, no aqui - solo
// se muestra donde va eso), Control = seguimiento/permisos internos, casi
// todo de solo lectura porque lo llenan aprobar/rechazar/registrar_pago.
// "Documentos" (09/Sep/2026, pedido explicito: "debe haber un apartado de
// documentos en facturas y flujos", "algo como esta en pld") - antes el
// comprobante bancario solo vivia como un campo de texto suelto en
// Detalles, sin boton de ver real (streaming) ni vista consolidada de a
// que CFDI esta ligado el flujo.
const TABS_FLUJO = ["Detalles", "Referencias", "CFDI", "Comprobante de pago", "Control"] as const;
type TabFlujo = (typeof TABS_FLUJO)[number];

// Link real de Drive a partir del file_id - "Abrir en pestaña nueva" debe
// ir al archivo real, no a nuestro endpoint de streaming.
function urlDriveWebView(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

const VALIDACION_COLOR: Record<TesoreriaValidacionEstado, "warning" | "success" | "error"> = {
  PENDIENTE: "warning",
  APROBADA: "success",
  RECHAZADA: "error",
};

// Glosario de Estado/Pagado
const VALIDACION_DESCRIPCION: Record<TesoreriaValidacionEstado, string> = {
  PENDIENTE: "Todavía nadie lo autoriza.",
  APROBADA: "Ya autorizado, listo para registrar el pago.",
  RECHAZADA: "No se autoriza, no se puede pagar así.",
};

// Tooltips de campos heredados/ambiguos del AppSheet original - label +
// icono de ayuda, mismo criterio visual que el glosario de Estado en el
// encabezado de tabla.
function LabelTip({ text, tip }: { text: string; tip: string }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" component="span">
      <span>{text}</span>
      <Tooltip title={tip}>
        <HelpCircle size={14} strokeWidth={1.5} style={{ cursor: "help", opacity: 0.6 }} />
      </Tooltip>
    </Stack>
  );
}

// Flujos de caja (24/Ago/2026, Sem 21 del cronograma) - un movimiento real
// de dinero (pago a proveedor, reembolso, nomina) ligado a un contrato.
// Ciclo de vida propio con segregacion de funciones: capturar (cualquiera
// con tesoreria.crear/.editar) -> aprobar/rechazar (solo tesoreria.aprobar,
// ej. FINANZAS_MANAGER) -> registrar_pago (de vuelta a tesoreria.editar,
// el analista es quien de verdad hace la transferencia una vez autorizada).
// useSearchParams() obliga a envolver en Suspense para el build de
// produccion (mismo motivo ya documentado en contratos/page.tsx) - lo
// necesitamos para el deep link "Ver Flujos" desde una fila de Nomina
// (10/Sep/2026, modulo de Nominas Fase 1).
export default function TesoreriaFlujosPage() {
  return (
    <Suspense fallback={null}>
      <TesoreriaFlujosPageContent />
    </Suspense>
  );
}

function TesoreriaFlujosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [flujos, setFlujos] = useState<TesoreriaFlujo[]>([]);
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  // CuentaBancariaSelector requiere el objeto completo (23/Sep/2026, ver
  // comentario del componente) - form.cuenta sigue siendo el id plano.
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<TesoreriaCuenta | null>(null);
  const [facturas, setFacturas] = useState<TesoreriaFactura[]>([]);
  const [complementos, setComplementos] = useState<TesoreriaComplementoPago[]>([]);
  const [nominas, setNominas] = useState<TesoreriaNomina[]>([]);
  const [search, setSearch] = useState("");
  const [filtroContrato, setFiltroContrato] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroNomina, setFiltroNomina] = useState(searchParams.get("nomina") || "");
  // Filtro por Categoria de gasto (11/Sep/2026, "filtro en las 4 pantallas" -
  // el campo ya existia en modelo/API desde 09/Sep, sin usarse en frontend).
  const [filtroCategoriaGasto, setFiltroCategoriaGasto] = useState<TesoreriaCategoriaGasto | "">("");
  // Filtro por Estado (23/Sep/2026, "agrega filtro para el estado") - mismos
  // valores que la columna Estado de la tabla.
  const [filtroEstado, setFiltroEstado] = useState<TesoreriaValidacionEstado | "">("");
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  // Columna "Empresa" (25/Sep/2026) - contrato_sociedad ya viene resuelto
  // del backend (TesoreriaFlujoSerializer.contrato_sociedad, RFC plano vía
  // contrato.sociedad), aquí solo se traduce a un nombre legible. Mismo
  // fallback que el label del filtro "Filtrar por empresa" de arriba.
  const nombreSociedad = (rfc: string | null) => {
    if (!rfc) return "—";
    const s = sociedades.find((soc) => soc.rfc === rfc);
    return s ? s.alias_sociedad || s.razon_social || s.rfc : rfc;
  };
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  // Paginacion server-side (20/Sep/2026, fix del 503 en produccion - el
  // listado completo sin paginar tumbaba el contenedor de Cloud Run con
  // volumen real post-migracion de datos legacy, ver
  // TesoreriaFlujoViewSet.pagination_class).
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(20);
  const [totalFlujos, setTotalFlujos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaFlujo | null>(null);
  // Ver vs. Editar (mismo criterio que Contrapartes/Contratos - "Ver"
  // visible siempre, "Editar" se mueve al menu de tres puntos) - mismo
  // dialogo/formulario, con todo deshabilitado y sin boton de Guardar
  // cuando soloLectura es true.
  const [soloLectura, setSoloLectura] = useState(false);
  // Preview embebido del comprobante (09/Sep/2026, apartado de Documentos)
  const [previewDoc, setPreviewDoc] = useState<{ url: string; titulo: string; urlExterna?: string } | null>(null);
  // Documento de referencia del flujo (23/Sep/2026, "en flujos, referencia
  // no deben ser los flujos asociados, sino subir un pdf llamado
  // referencia") - sube directo al elegir el archivo, mismo criterio que
  // el comprobante pero sin pasar por el dialogo de "Registrar pago".
  const [subiendoReferencia, setSubiendoReferencia] = useState(false);
  const [errorReferencia, setErrorReferencia] = useState<string | null>(null);
  // Selector local/Drive (23/Sep/2026, "debe verse como el de conciliacion
  // bancaria") - mismo componente que importar extracto; solo elige el
  // archivo, subirReferenciaFlujo() sigue siendo quien lo sube de verdad.
  const [archivoReferenciaPendiente, setArchivoReferenciaPendiente] = useState<File | null>(null);
  const [reemplazandoReferencia, setReemplazandoReferencia] = useState(false);
  // Comprobante de pago inline (25/Sep/2026, "que se vea igual a
  // Referencias"; unificado con Registrar pago el mismo dia, "ya no es
  // necesario el boton, se sube el comprobante y se pone como pagado") -
  // sube directo al elegir el archivo, sin dialogo aparte. Si el flujo aun
  // no esta pagado, subir el comprobante TAMBIEN llama a registrarPagoFlujo
  // (requiere autorizacion=True, ver validacion en el backend) - ya no
  // existe una accion separada de "Registrar pago" sin comprobante.
  const [subiendoComprobante, setSubiendoComprobante] = useState(false);
  const [errorComprobante, setErrorComprobante] = useState<string | null>(null);
  const [archivoComprobantePendiente, setArchivoComprobantePendiente] = useState<File | null>(null);
  const [reemplazandoComprobante, setReemplazandoComprobante] = useState(false);
  const [descripcionPagoPendiente, setDescripcionPagoPendiente] = useState("");
  // Referencias cruzadas (10/Sep/2026, "replica el patron en Facturas y
  // Flujos") - ver componente PanelReferenciaCruzada.
  const [panelReferencia, setPanelReferencia] = useState<ReferenciaCruzada>(null);
  // "ID de empleado" (pestana Referencias) solo aplica a Flujos de nomina -
  // periodo_nomina es la liga real, pero hay Flujos legacy con id_empleado
  // capturado sin periodo_nomina (ver auditoria 17/Sep/2026), de ahi el
  // fallback al prefijo GEN-NOMINA- del contrato generico.
  const esFlujoDeNomina = !!editing?.periodo_nomina || !!editing?.contrato?.startsWith("GEN-NOMINA");
  const [form, setForm] = useState(FORM_VACIO);
  const [tab, setTab] = useState<TabFlujo>("Detalles");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<TesoreriaFlujo | null>(null);
  const [vinculoFactura, setVinculoFactura] = useState<TesoreriaFactura | null>(null);
  const [vinculoComplemento, setVinculoComplemento] = useState<TesoreriaComplementoPago | null>(null);
  // Recibo de nomina (10/Sep/2026, "como se une nomina y recibos de
  // nomina") - solo tiene sentido ofrecerlo cuando el Flujo tiene
  // periodo_nomina (ver render condicional abajo). Lista completa de una
  // vez (catalogo chico) en vez de busqueda incremental como
  // Factura/Complemento.
  const [recNominas, setRecNominas] = useState<TesoreriaRecNomina[]>([]);
  const [vinculoNomina, setVinculoNomina] = useState<TesoreriaRecNomina | null>(null);
  // Crear recibo de nomina inline (11/Sep/2026, "crear/vincular recibo
  // desde el lado de Flujos sin cambiar de pantalla") - antes solo se
  // podia elegir un TesoreriaRecNomina ya existente (creado en
  // /tesoreria/rec-nominas); este mini-formulario cubre el alta minima sin
  // salir del dialogo de "Vincular CFDI".
  const [creandoRecibo, setCreandoRecibo] = useState(false);
  const [nuevoRecibo, setNuevoRecibo] = useState({
    timbreUuid: "",
    folio: "",
    total: "",
    nomReceptorNumEmpleado: "",
    nominaFechaPago: "",
  });
  const [guardandoNuevoRecibo, setGuardandoNuevoRecibo] = useState(false);
  const [errorNuevoRecibo, setErrorNuevoRecibo] = useState<string | null>(null);
  const [buscaFactura, setBuscaFactura] = useState("");
  const [buscaComplemento, setBuscaComplemento] = useState("");
  const [opcionesFactura, setOpcionesFactura] = useState<TesoreriaFactura[]>([]);
  const [opcionesComplemento, setOpcionesComplemento] = useState<TesoreriaComplementoPago[]>([]);
  const [buscandoFactura, setBuscandoFactura] = useState(false);
  const [buscandoComplemento, setBuscandoComplemento] = useState(false);
  const [vinculoError, setVinculoError] = useState<string | null>(null);
  const [guardandoVinculo, setGuardandoVinculo] = useState(false);
  // Previsualiza el proximo id_flujo (mismo consecutivo global que usa
  // perform_create en el backend, ver views.py) - es solo una vista previa,
  // el ID real siempre lo asigna el servidor al guardar; si otro flujo se
  // crea justo entre abrir este dialogo y guardar, el numero real puede no
  // coincidir con el mostrado aqui (mismo riesgo ya documentado y aceptado
  // en TesoreriaContratoViewSet.perform_create).
  const [idFlujoPrevio, setIdFlujoPrevio] = useState("");
  // Menu compacto de acciones por fila (25/Ago/2026, "se ven muy llenas";
  // actualizado 28/Ago/2026 - "Ver" queda como icono suelto en vez de
  // Editar, que se movio adentro del menu junto con Vincular/Aprobar/
  // Rechazar/Registrar pago) para no amontonar hasta 5 iconos por fila.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuFlujo, setMenuFlujo] = useState<TesoreriaFlujo | null>(null);

  // Conciliacion bancaria por IA (28/Ago/2026, ver memoria
  // "tesoreria-flujos-registro-y-conciliacion-ia-plan") - el analista ya
  // subio el comprobante (subir_comprobante) y ahora lo analiza con el
  // Motor Documental para catalogar el movimiento y proponer la
  // contraparte, en vez de capturar todo a mano.
  const [motorFlujo, setMotorFlujo] = useState<TesoreriaFlujo | null>(null);
  // Aviso de contraparte creada/detectada por IA que quedo incompleta (sin
  // email/tipo_persona, ver origen en tesoreria.ts) - confirmar_conciliacion
  // la devuelve en contraparte_detectada pero antes se descartaba en
  // silencio; ahora se avisa con link directo a revisarla.
  const [avisoContraparteIA, setAvisoContraparteIA] = useState<{ id: string; nombre: string } | null>(null);
  // Sugerencias de factura para el flujo que se acaba de conciliar
  // (07/Sep/2026, "IA que proponga el match comprobante->factura") - solo
  // avisa, nunca liga sola; el analista da clic en "Vincular" para
  // confirmar una (o ninguna, si ninguna aplica).
  const [sugerenciasFactura, setSugerenciasFactura] = useState<{
    idFlujo: string;
    opciones: TesoreriaFacturaSugerida[];
  } | null>(null);
  const [vinculandoSugerencia, setVinculandoSugerencia] = useState<string | null>(null);

  // Autocomplete con busqueda en vivo contra tesoreria-service, mismo
  // patron que ContraparteSelector (openOnFocus + debounce 300ms, catalogo
  // completo visible sin tener que escribir primero) - la factura/
  // complemento debe existir de antemano (vincular_factura la valida por
  // timbre_uuid), a diferencia de ContraparteSelector no se puede "crear"
  // una aqui mismo.
  useEffect(() => {
    if (!vinculando) return;
    setBuscandoFactura(true);
    const timeout = setTimeout(() => {
      listFacturas({ search: buscaFactura || undefined })
        .then((res) => setOpcionesFactura(res.results))
        .catch(() => setOpcionesFactura([]))
        .finally(() => setBuscandoFactura(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaFactura, vinculando]);

  useEffect(() => {
    if (!vinculando) return;
    setBuscandoComplemento(true);
    const timeout = setTimeout(() => {
      listComplementosPago(buscaComplemento || undefined, undefined, undefined, undefined, 200)
        .then((res) => setOpcionesComplemento(res.results))
        .catch(() => setOpcionesComplemento([]))
        .finally(() => setBuscandoComplemento(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaComplemento, vinculando]);

  useEffect(() => {
    getSession().then(setSession);
    // pageSize alto (20-21/Sep/2026, fix paginacion) - solo se usa para
    // resolver referencias localmente (folioFactura(), select de contrato
    // en el formulario), no es la pantalla dedicada de ese catalogo. Cuenta
    // bancaria ahora busca en vivo (CuentaBancariaSelector, 23/Sep/2026).
    listContratos(undefined, undefined, undefined, 200)
      .then((res) => setContratos(res.results))
      .catch(() => setContratos([]));
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listFacturas({ pageSize: 200 })
      .then((res) => setFacturas(res.results))
      .catch(() => setFacturas([]));
    listComplementosPago(undefined, undefined, undefined, undefined, 200)
      .then((res) => setComplementos(res.results))
      .catch(() => setComplementos([]));
    listNominas().then(setNominas).catch(() => setNominas([]));
    listRecNominas(undefined, undefined, 200)
      .then((res) => setRecNominas(res.results))
      .catch(() => setRecNominas([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;
  const puedeAprobar = session?.perm_keys.includes("tesoreria.aprobar") ?? false;

  // Muestra el folio de la factura/complemento ya vinculado en vez del
  // timbre_uuid crudo - busca en las listas ya cargadas arriba (mismo
  // criterio que contraparte_nombre en Contratos: el backend no manda el
  // folio denormalizado en TesoreriaFlujoSerializer, se resuelve aqui).
  function folioFactura(timbreUuid: string | null): string | null {
    if (!timbreUuid) return null;
    const f = facturas.find((x) => x.timbre_uuid === timbreUuid);
    return f ? f.comprobante_folio || f.timbre_uuid : timbreUuid;
  }

  function folioComplemento(timbreUuid: string | null): string | null {
    if (!timbreUuid) return null;
    const c = complementos.find((x) => x.timbre_uuid === timbreUuid);
    return c ? c.folio || c.timbre_uuid : timbreUuid;
  }

  // 10/Sep/2026, "y porque no veo el recibo en recibo de nomina" - la
  // columna "CFDI vinculado" solo mostraba factura/complemento, nunca el
  // recibo de nomina ya vinculado (ver vincularFactura con `nomina`).
  function folioRecNomina(timbreUuid: string | null): string | null {
    if (!timbreUuid) return null;
    const n = recNominas.find((x) => x.timbre_uuid === timbreUuid);
    return n ? n.folio || n.timbre_uuid : timbreUuid;
  }

  function abrirVinculo(f: TesoreriaFlujo) {
    setVinculando(f);
    setVinculoFactura(facturas.find((x) => x.timbre_uuid === f.factura) || null);
    setVinculoComplemento(complementos.find((x) => x.timbre_uuid === f.complemento) || null);
    setVinculoNomina(recNominas.find((x) => x.timbre_uuid === f.nomina) || null);
    setBuscaFactura("");
    setBuscaComplemento("");
    setVinculoError(null);
    setCreandoRecibo(false);
    setNuevoRecibo({ timbreUuid: "", folio: "", total: "", nomReceptorNumEmpleado: "", nominaFechaPago: "" });
    setErrorNuevoRecibo(null);
  }

  async function handleCrearRecibo() {
    if (!nuevoRecibo.timbreUuid) {
      setErrorNuevoRecibo("El UUID de timbrado es obligatorio.");
      return;
    }
    setGuardandoNuevoRecibo(true);
    setErrorNuevoRecibo(null);
    try {
      const creado = await createRecNomina(nuevoRecibo);
      setRecNominas((prev) => [creado, ...prev]);
      setVinculoNomina(creado);
      setCreandoRecibo(false);
    } catch (err) {
      setErrorNuevoRecibo(err instanceof Error ? err.message : "Error al crear el recibo");
    } finally {
      setGuardandoNuevoRecibo(false);
    }
  }

  async function handleGuardarVinculo() {
    if (!vinculando) return;
    if (!vinculoFactura && !vinculoComplemento && !vinculoNomina) {
      setVinculoError("Selecciona al menos una factura, un complemento de pago o un recibo de nómina.");
      return;
    }
    setGuardandoVinculo(true);
    setVinculoError(null);
    try {
      const actualizado = await vincularFactura(vinculando.id_flujo, {
        factura: vinculoFactura?.timbre_uuid || undefined,
        complemento: vinculoComplemento?.timbre_uuid || undefined,
        nomina: vinculoNomina?.timbre_uuid || undefined,
      });
      setVinculando(null);
      // El dialogo de Editar puede seguir abierto detras con un `editing`
      // desactualizado (10/Sep/2026, "el chip no se actualiza hasta
      // reabrir") - refresh() solo recarga la tabla, no ese snapshot.
      setEditing((prev) => (prev && prev.id_flujo === actualizado.id_flujo ? actualizado : prev));
      refresh();
    } catch (err) {
      setVinculoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardandoVinculo(false);
    }
  }

  // onConfirmar del MotorDocumentalDialog para conciliacion bancaria - separa
  // lo que vino en extracted_data (filtrado ya por
  // TESORERIA_FLUJO_CAMPOS_CONFIRMABLES) entre "campos" reales del modelo
  // y los tres datos aparte que espera confirmar_conciliacion
  // (contraparte_nombre/factura/complemento, ver views.py).
  async function handleConfirmarConciliacionFlujo(datos: Record<string, unknown>) {
    if (!motorFlujo) return;
    const { contraparte_nombre, factura, complemento, ...campos } = datos;
    const resultado = await confirmarConciliacionFlujo(motorFlujo.id_flujo, {
      campos: Object.keys(campos).length > 0 ? campos : undefined,
      contraparte_nombre: typeof contraparte_nombre === "string" ? contraparte_nombre : undefined,
      factura: typeof factura === "string" ? factura : undefined,
      complemento: typeof complemento === "string" ? complemento : undefined,
    });
    // Si la IA creo la contraparte de una vez (origen=ia) y le falta lo que
    // Tesoreria exige para una alta manual, se avisa aqui mismo en vez de
    // dejarla enterrada sin que nadie se entere (ver memoria
    // "tesoreria-flujos-registro-y-conciliacion-ia-plan").
    const detectada = resultado.contraparte_detectada;
    if (detectada && detectada.origen === "ia" && (!detectada.email || !detectada.tipo_persona)) {
      setAvisoContraparteIA({ id: detectada.id_contraparte, nombre: detectada.razon_social });
    } else {
      setAvisoContraparteIA(null);
    }
    setSugerenciasFactura(
      resultado.sugerencias_factura.length > 0
        ? { idFlujo: motorFlujo.id_flujo, opciones: resultado.sugerencias_factura }
        : null
    );
    refresh();
  }

  // Confirma una sugerencia de factura propuesta por la IA (07/Sep/2026) -
  // mismo endpoint que el vinculo manual (vincularFactura), la unica
  // diferencia es que el UUID ya viene precargado por la sugerencia en vez
  // de que el analista lo busque a mano.
  async function handleVincularSugerencia(idFlujo: string, timbreUuid: string) {
    setVinculandoSugerencia(timbreUuid);
    try {
      await vincularFactura(idFlujo, { factura: timbreUuid });
      setSugerenciasFactura(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al vincular la factura sugerida");
    } finally {
      setVinculandoSugerencia(null);
    }
  }

  function refresh() {
    setLoading(true);
    listFlujos({
      search: search || undefined,
      contrato: filtroContrato || undefined,
      sociedad: filtroEmpresa || undefined,
      nomina: filtroNomina || undefined,
      categoriaGasto: filtroCategoriaGasto || undefined,
      fechaDesde: filtroFechaDesde || undefined,
      fechaHasta: filtroFechaHasta || undefined,
      validacionEstado: filtroEstado || undefined,
      page: pagina + 1,
      pageSize: filasPorPagina,
    })
      .then((res) => {
        setFlujos(res.results);
        setTotalFlujos(res.count);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search,
    filtroContrato,
    filtroEmpresa,
    filtroNomina,
    filtroCategoriaGasto,
    filtroFechaDesde,
    filtroFechaHasta,
    filtroEstado,
    pagina,
    filasPorPagina,
  ]);

  // Volver a la primera pagina cuando cambia cualquier filtro (20/Sep/2026)
  // - sin esto, filtrar estando en la pagina 3 puede pedir una pagina que
  // ya no existe con el nuevo total y devolver una lista vacia.
  useEffect(() => {
    setPagina(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroContrato, filtroEmpresa, filtroNomina, filtroCategoriaGasto, filtroFechaDesde, filtroFechaHasta, filtroEstado]);

  // Redirigido desde Conciliación Bancaria tras "Crear Flujo" (11/Sep/2026,
  // "quiero que muestre lo importado y para mostrar y redirigir") - abre
  // de una vez el Flujo recien precargado para "terminar de completar el
  // registro" (contrato ya elegido, falta lo demas). Se limpia el query
  // param al abrir para no reabrirlo en cada refresh() posterior.
  useEffect(() => {
    const idAAbrir = searchParams.get("abrir");
    if (!idAAbrir || flujos.length === 0) return;
    const flujo = flujos.find((f) => f.id_flujo === idAAbrir);
    if (flujo) {
      abrirEdicion(flujo);
      router.replace("/tesoreria/flujos");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flujos]);

  // Exportar a Google Sheets (14/Sep/2026, reemplaza "Exportar CSV") - ver
  // hook reusable en lib/useExportarSheets.ts.
  const {
    exportando,
    error: errorExportarSheets,
    exportar: handleExportarSheets,
  } = useExportarSheets((carpetaId) =>
    exportarFlujosSheets({
      search: search || undefined,
      contrato: filtroContrato || undefined,
      sociedad: filtroEmpresa || undefined,
      carpetaId,
    })
  );

  // Filtro de fecha (25/Ago/2026, movido al servidor 20/Sep/2026 - con
  // paginacion el cliente ya no tiene todas las filas para filtrar
  // localmente, ver fechaDesde/fechaHasta en refresh() y
  // TesoreriaFlujoViewSet.get_queryset).
  const flujosFiltrados = flujos;

  function abrirAlta() {
    setEditing(null);
    setSoloLectura(false);
    setForm(FORM_VACIO);
    setCuentaSeleccionada(null);
    setTab("Detalles");
    setFormError(null);
    setIdFlujoPrevio("");
    listFlujos({ pageSize: 1 })
      .then((res) => setIdFlujoPrevio(`FLJ-${(res.count + 1).toString().padStart(6, "0")}`))
      .catch(() => setIdFlujoPrevio(""));
    setDialogOpen(true);
  }

  function abrirEdicion(f: TesoreriaFlujo, verSolo = false) {
    setEditing(f);
    setSoloLectura(verSolo);
    setForm({
      contrato: f.contrato || "",
      periodoNomina: f.periodo_nomina || "",
      cuenta: f.cuenta,
      totalMxp: f.total_mxp || "",
      fechaEfectiva: f.fecha_efectiva || "",
      concepto: f.concepto || "",
      reembolso: f.reembolso ?? false,
      idEmpleado: f.id_empleado || "",
      idEmpleadoReembolso: f.id_empleado_reembolso || "",
      idRequisicion: f.id_requisicion || "",
      comentarios: f.comentarios || "",
      linkReferencia: f.link_referencia || "",
      comprobacionAsignadaA: f.comprobacion_asignada_a || "",
      estadoCfdi: f.estado_cfdi || "",
      requiereComplemento: f.requiere_complemento ?? false,
      aprobacionLista: f.aprobacion_lista ?? false,
      permisoEnviarPago: f.permiso_enviar_pago || "",
      permiso: f.permiso || "",
      informacionEnvio: f.informacion_envio || "",
      fechaPagoOriginal: f.fecha_pago_original || "",
      linkComprobanteBanco: f.link_comprobante_banco || "",
      categoriaGasto: f.categoria_gasto || "",
    });
    setTab("Detalles");
    setFormError(null);
    setDialogOpen(true);
  }

  // Duplicar (26/Ago/2026, finanzas.md: "Transactions can have the option
  // to copy and edit the copy for faster registration") - mismo criterio
  // que abrirDuplicado() en saldos/page.tsx: prellena el alta con los
  // mismos datos del flujo elegido, pero sin id/fecha/estado de pago (se
  // crea uno nuevo, no se edita el original).
  function abrirDuplicado(f: TesoreriaFlujo) {
    setEditing(null);
    setSoloLectura(false);
    setForm({
      contrato: f.contrato || "",
      periodoNomina: f.periodo_nomina || "",
      cuenta: f.cuenta,
      totalMxp: f.total_mxp || "",
      fechaEfectiva: new Date().toISOString().slice(0, 10),
      concepto: f.concepto || "",
      reembolso: f.reembolso ?? false,
      idEmpleado: f.id_empleado || "",
      idEmpleadoReembolso: f.id_empleado_reembolso || "",
      idRequisicion: f.id_requisicion || "",
      comentarios: f.comentarios || "",
      linkReferencia: f.link_referencia || "",
      comprobacionAsignadaA: f.comprobacion_asignada_a || "",
      estadoCfdi: f.estado_cfdi || "",
      requiereComplemento: f.requiere_complemento ?? false,
      aprobacionLista: false,
      permisoEnviarPago: f.permiso_enviar_pago || "",
      permiso: f.permiso || "",
      informacionEnvio: "",
      fechaPagoOriginal: "",
      linkComprobanteBanco: "",
      categoriaGasto: f.categoria_gasto || "",
    });
    setTab("Detalles");
    setFormError(null);
    setIdFlujoPrevio("");
    listFlujos({ pageSize: 1 })
      .then((res) => setIdFlujoPrevio(`FLJ-${(res.count + 1).toString().padStart(6, "0")}`))
      .catch(() => setIdFlujoPrevio(""));
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && !form.contrato) {
      setFormError("Selecciona el contrato (obligatorio, incluso para reembolsos).");
      return;
    }
    if (!editing && !form.cuenta) {
      setFormError("Selecciona la cuenta bancaria.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateFlujo(editing.id_flujo, {
          concepto: form.concepto || undefined,
          fechaEfectiva: form.fechaEfectiva || undefined,
          totalMxp: form.totalMxp || undefined,
          comentarios: form.comentarios || undefined,
          fechaPagoOriginal: form.fechaPagoOriginal || undefined,
          linkComprobanteBanco: form.linkComprobanteBanco || undefined,
          categoriaGasto: form.categoriaGasto,
        });
      } else {
        await createFlujo({
          contrato: form.contrato,
          periodoNomina: form.periodoNomina || undefined,
          cuenta: form.cuenta,
          totalMxp: form.totalMxp || undefined,
          fechaEfectiva: form.fechaEfectiva || undefined,
          concepto: form.concepto || undefined,
          reembolso: form.reembolso,
          idEmpleado: form.idEmpleado || undefined,
          idEmpleadoReembolso: form.idEmpleadoReembolso || undefined,
          idRequisicion: form.idRequisicion || undefined,
          linkReferencia: form.linkReferencia || undefined,
          comprobacionAsignadaA: form.comprobacionAsignadaA || undefined,
          estadoCfdi: form.estadoCfdi || undefined,
          requiereComplemento: form.requiereComplemento,
          aprobacionLista: form.aprobacionLista,
          permisoEnviarPago: form.permisoEnviarPago || undefined,
          permiso: form.permiso || undefined,
          informacionEnvio: form.informacionEnvio || undefined,
          comentarios: form.comentarios || undefined,
          fechaPagoOriginal: form.fechaPagoOriginal || undefined,
          linkComprobanteBanco: form.linkComprobanteBanco || undefined,
          categoriaGasto: form.categoriaGasto || undefined,
        });
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleAprobar(f: TesoreriaFlujo) {
    if (!session) return;
    setAccionando(f.id_flujo);
    try {
      const actualizado = await aprobarFlujo(f.id_flujo);
      // 25/Sep/2026, bug real: solo se refrescaba la tabla, no `editing` -
      // el tab "Comprobante de pago" (gateado por autorizacion/
      // validacion_estado, ver mas abajo) seguia bloqueado hasta cerrar y
      // reabrir el dialogo, aunque el backend ya habia aprobado.
      setEditing((prev) => (prev?.id_flujo === actualizado.id_flujo ? actualizado : prev));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
    }
  }

  async function handleRechazar(f: TesoreriaFlujo) {
    setAccionando(f.id_flujo);
    try {
      const actualizado = await rechazarFlujo(f.id_flujo);
      setEditing((prev) => (prev?.id_flujo === actualizado.id_flujo ? actualizado : prev));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
    }
  }

  async function handleSubirReferencia(archivo: File) {
    if (!editing) return;
    setSubiendoReferencia(true);
    setErrorReferencia(null);
    try {
      const actualizado = await subirReferenciaFlujo(editing.id_flujo, archivo, session?.user_id);
      setEditing(actualizado);
      setArchivoReferenciaPendiente(null);
      setReemplazandoReferencia(false);
      refresh();
    } catch (err) {
      setErrorReferencia(err instanceof Error ? err.message : "No se pudo subir la referencia.");
    } finally {
      setSubiendoReferencia(false);
    }
  }

  async function handleSubirComprobanteInline(archivo: File) {
    if (!editing) return;
    setSubiendoComprobante(true);
    setErrorComprobante(null);
    try {
      // Separado de nuevo de "Marcar como pagado" (25/Sep/2026, "separalos,
      // todavia no estan marcados como pagadas" - la union de hace un rato
      // obligaba a marcar pagado en el mismo paso que subir el archivo,
      // pero en la practica se necesita poder subir/corregir el
      // comprobante de un flujo que sigue sin pagar, ej. mientras se
      // resuelve un error de captura como la reasignacion de cuenta). Subir
      // el comprobante ya NO cambia el estado pagado - ver
      // handleMarcarPagado para esa accion aparte.
      const actualizado = await subirComprobanteFlujo(editing.id_flujo, archivo, session?.user_id);
      setEditing(actualizado);
      setArchivoComprobantePendiente(null);
      setReemplazandoComprobante(false);
      refresh();
    } catch (err) {
      setErrorComprobante(err instanceof Error ? err.message : "No se pudo subir el comprobante.");
    } finally {
      setSubiendoComprobante(false);
    }
  }

  async function handleMarcarPagado() {
    if (!editing) return;
    setSubiendoComprobante(true);
    setErrorComprobante(null);
    try {
      const actualizado = await registrarPagoFlujo(editing.id_flujo, {
        descripcionPago: descripcionPagoPendiente || undefined,
      });
      setEditing(actualizado);
      setDescripcionPagoPendiente("");
      refresh();
    } catch (err) {
      setErrorComprobante(err instanceof Error ? err.message : "No se pudo marcar como pagado.");
    } finally {
      setSubiendoComprobante(false);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Banknote size={22} strokeWidth={1.5} />
        <Typography variant="h5">Flujos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Ingresos y egresos reales ligados a un contrato — capturar, autorizar y registrar el pago.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {errorExportarSheets && <Alert severity="error" sx={{ mb: 3 }}>{errorExportarSheets}</Alert>}

      {avisoContraparteIA && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          onClose={() => setAvisoContraparteIA(null)}
          action={
            <Button
              color="inherit"
              size="small"
              href={`/tesoreria/contrapartes?revisar=${encodeURIComponent(avisoContraparteIA.id)}`}
            >
              Revisar
            </Button>
          }
        >
          La contraparte &quot;{avisoContraparteIA.nombre}&quot; se creó automáticamente a partir del comprobante y le
          falta correo o tipo de persona.
        </Alert>
      )}

      {/* Sugerencias de factura (07/Sep/2026, "IA que proponga el match
          comprobante->factura") - solo aviso, el analista confirma cual
          (o cierra el panel sin vincular ninguna). */}
      {sugerenciasFactura && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          onClose={() => setSugerenciasFactura(null)}
        >
          <Typography variant="body2" sx={{ mb: 1 }}>
            La IA propone estas facturas para conciliar con el flujo <strong>{sugerenciasFactura.idFlujo}</strong>:
          </Typography>
          <Stack spacing={1}>
            {sugerenciasFactura.opciones.map((s) => (
              <Stack
                key={s.timbre_uuid}
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="space-between"
                sx={{ bgcolor: "background.paper", borderRadius: 1, px: 1.5, py: 1 }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {s.comprobante_folio || s.timbre_uuid} — {s.emisor_nombre || s.emisor_rfc || "—"} — $
                    {s.comprobante_total}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.motivos.join(" · ")}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={vinculandoSugerencia === s.timbre_uuid}
                  onClick={() => handleVincularSugerencia(sugerenciasFactura.idFlujo, s.timbre_uuid)}
                >
                  {vinculandoSugerencia === s.timbre_uuid ? <CircularProgress size={14} /> : "Vincular"}
                </Button>
              </Stack>
            ))}
          </Stack>
        </Alert>
      )}

      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por ID de flujo o concepto..."
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
                onClick={abrirAlta}
                sx={{ flexShrink: 0 }}
              >
                Nuevo Flujo
              </Button>
            )}
          </Stack>
        }
      >
        <Autocomplete
          size="small"
          sx={{ minWidth: 180 }}
          options={sociedades}
          value={sociedades.find((s) => s.rfc === filtroEmpresa) || null}
          onChange={(_, seleccion) => {
            setFiltroEmpresa(seleccion?.rfc || "");
            setFiltroContrato("");
          }}
          getOptionLabel={(s) => s.alias_sociedad || s.razon_social || s.rfc}
          isOptionEqualToValue={(a, b) => a.rfc === b.rfc}
          renderInput={(params) => <TextField {...params} label="Filtrar por empresa" />}
        />
        <Autocomplete
          size="small"
          sx={{ minWidth: 180 }}
          options={Object.keys(CATEGORIA_GASTO_LABELS) as TesoreriaCategoriaGasto[]}
          value={filtroCategoriaGasto || null}
          onChange={(_, seleccion) => setFiltroCategoriaGasto(seleccion || "")}
          getOptionLabel={(c) => CATEGORIA_GASTO_LABELS[c]}
          renderInput={(params) => <TextField {...params} label="Categoría de gasto" />}
        />
        <Autocomplete
          size="small"
          sx={{ minWidth: 200 }}
          options={contratos.filter((c) => !filtroEmpresa || c.sociedad === filtroEmpresa)}
          value={contratos.find((c) => c.id_contrato === filtroContrato) || null}
          onChange={(_, seleccion) => setFiltroContrato(seleccion?.id_contrato || "")}
          getOptionLabel={(c) => `${c.id_contrato} — ${c.contraparte_nombre}`}
          isOptionEqualToValue={(a, b) => a.id_contrato === b.id_contrato}
          renderInput={(params) => <TextField {...params} label="Filtrar por contrato" />}
        />
        <Autocomplete
          size="small"
          sx={{ minWidth: 180 }}
          options={nominas}
          value={nominas.find((n) => n.id_nomina === filtroNomina) || null}
          onChange={(_, seleccion) => setFiltroNomina(seleccion?.id_nomina || "")}
          getOptionLabel={(n) => `${n.id_nomina} — ${n.serie}`}
          isOptionEqualToValue={(a, b) => a.id_nomina === b.id_nomina}
          renderInput={(params) => <TextField {...params} label="Filtrar por nómina" />}
        />
        <Autocomplete
          size="small"
          sx={{ minWidth: 160 }}
          options={Object.keys(VALIDACION_DESCRIPCION) as TesoreriaValidacionEstado[]}
          value={filtroEstado || null}
          onChange={(_, seleccion) => setFiltroEstado(seleccion || "")}
          getOptionLabel={(e) => e.charAt(0) + e.slice(1).toLowerCase()}
          renderInput={(params) => <TextField {...params} label="Estado" />}
        />
        <TextField
          size="small"
          type="date"
          label="Fecha desde"
          value={filtroFechaDesde}
          onChange={(e) => setFiltroFechaDesde(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          size="small"
          type="date"
          label="Fecha hasta"
          value={filtroFechaHasta}
          onChange={(e) => setFiltroFechaHasta(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 160 }}
        />
      </FiltrosBar>

      <Paper variant="outlined">
        {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza por
        tarjetas apiladas (ver abajo) - una tabla de 10 columnas no cabe en
        un telefono sin scroll horizontal incomodo. */}
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID Flujo</TableCell>
                <TableCell>ID Contrato</TableCell>
                <TableCell>Sociedad</TableCell>
                <TableCell>Descripción de Pago</TableCell>
                <TableCell>
                  <LabelTip
                    text="Fecha Efectiva"
                    tip="Fecha del movimiento según el contrato/factura, puede no coincidir con la fecha real de pago."
                  />
                </TableCell>
                <TableCell>Concepto</TableCell>

                <TableCell align="right">Total MXP</TableCell>
                <TableCell>CFDI vinculado</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>Estado</span>
                    <Tooltip
                      title={
                        <Stack spacing={0.5} sx={{ py: 0.5 }}>
                          {(Object.keys(VALIDACION_DESCRIPCION) as TesoreriaValidacionEstado[]).map((e) => (
                            <Typography key={e} variant="caption" component="div">
                              <b>{e}</b> — {VALIDACION_DESCRIPCION[e]}
                            </Typography>
                          ))}
                        </Stack>
                      }
                    >
                      <HelpCircle size={14} strokeWidth={1.5} style={{ cursor: "help", opacity: 0.6 }} />
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <span>Pagado</span>
                    <Tooltip title="Si ya se registró el pago real (Registrar pago), con comprobante o sin él.">
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
                  <TableCell colSpan={11} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : flujosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin flujos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                flujosFiltrados.map((f) => (
                  <TableRow key={f.id_flujo} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{f.id_flujo}</TableCell>
                    <TableCell>{f.contrato || "—"}</TableCell>
                    <TableCell>{nombreSociedad(f.contrato_sociedad)}</TableCell>
                    <TableCell>{f.descripcion_pago || "—"}</TableCell>
                    <TableCell>{f.fecha_efectiva || "—"}</TableCell>
                    <TableCell>{f.concepto || "—"}</TableCell>
                    <TableCell align="right">
                      {f.total_mxp
                        ? Number(f.total_mxp).toLocaleString("es-MX", { style: "currency", currency: "MXN" })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {f.factura || f.complemento || f.nomina ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {f.factura && <Chip size="small" label={`Factura ${folioFactura(f.factura)}`} variant="outlined" />}
                          {f.complemento && (
                            <Chip size="small" label={`REP ${folioComplemento(f.complemento)}`} variant="outlined" />
                          )}
                          {f.nomina && (
                            <Chip size="small" label={`Nómina ${folioRecNomina(f.nomina)}`} variant="outlined" />
                          )}
                        </Stack>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={f.validacion_estado || "PENDIENTE"}
                        color={VALIDACION_COLOR[f.validacion_estado || "PENDIENTE"]}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={f.pagado ? "Pagado" : "Sin pagar"}
                        color={f.pagado ? "success" : "default"}
                        variant={f.pagado ? "filled" : "outlined"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <IconButton size="small" aria-label="Ver" onClick={() => abrirEdicion(f, true)}>
                          <Eye size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Más acciones"
                          onClick={(e) => {
                            setMenuAnchor(e.currentTarget);
                            setMenuFlujo(f);
                          }}
                        >
                          <MoreVertical size={14} strokeWidth={1.5} />
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
          ) : flujosFiltrados.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Sin flujos registrados.
            </Typography>
          ) : (
            flujosFiltrados.map((f) => (
              <Paper key={f.id_flujo} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {f.id_flujo}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {f.descripcion_pago || "—"}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton size="small" aria-label="Ver" onClick={() => abrirEdicion(f, true)}>
                      <Eye size={14} strokeWidth={1.5} />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Más acciones"
                      onClick={(e) => {
                        setMenuAnchor(e.currentTarget);
                        setMenuFlujo(f);
                      }}
                    >
                      <MoreVertical size={14} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>ID Contrato:</strong> {f.contrato || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Fecha efectiva:</strong> {f.fecha_efectiva || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Concepto:</strong> {f.concepto || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Total MXP:</strong>{" "}
                    {f.total_mxp
                      ? Number(f.total_mxp).toLocaleString("es-MX", { style: "currency", currency: "MXN" })
                      : "—"}
                  </Typography>
                  <Typography variant="body2" component="div">
                    <strong>CFDI vinculado:</strong>{" "}
                    {f.factura || f.complemento || f.nomina ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                        {f.factura && <Chip size="small" label={`Factura ${folioFactura(f.factura)}`} variant="outlined" />}
                        {f.complemento && (
                          <Chip size="small" label={`REP ${folioComplemento(f.complemento)}`} variant="outlined" />
                        )}
                        {f.nomina && (
                          <Chip size="small" label={`Nómina ${folioRecNomina(f.nomina)}`} variant="outlined" />
                        )}
                      </Stack>
                    ) : (
                      "—"
                    )}
                  </Typography>
                  <Stack direction="row" spacing={0.5}>
                    <Chip
                      size="small"
                      label={f.validacion_estado || "PENDIENTE"}
                      color={VALIDACION_COLOR[f.validacion_estado || "PENDIENTE"]}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      label={f.pagado ? "Pagado" : "Sin pagar"}
                      color={f.pagado ? "success" : "default"}
                      variant={f.pagado ? "filled" : "outlined"}
                    />
                  </Stack>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>

        <TablePagination
          component="div"
          count={totalFlujos}
          page={pagina}
          onPageChange={(_, nuevaPagina) => setPagina(nuevaPagina)}
          rowsPerPage={filasPorPagina}
          onRowsPerPageChange={(e) => {
            setFilasPorPagina(parseInt(e.target.value, 10));
            setPagina(0);
          }}
          rowsPerPageOptions={[20, 50, 100]}
          labelRowsPerPage="Filas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>

      <Dialog
        open={dialogOpen}
        onClose={(_, reason) => {
          // Regla del proyecto: Dialog solo cierra con la X, nunca con
          // click fuera o Escape (25/Sep/2026, "al momento de editar se
          // cierra dando click fuera del dialog").
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setDialogOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {soloLectura ? `Ver ${editing?.id_flujo}` : editing ? `Editar ${editing.id_flujo}` : "Nuevo Flujo"}
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <Tabs
          value={tab}
          onChange={(_, value: TabFlujo) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          {TABS_FLUJO.map((t) => (
            <Tab key={t} label={t} value={t} />
          ))}
        </Tabs>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          {tab === "Detalles" && (
            <>
            {/* Botones "Ver X" fuera del fieldset (17/Sep/2026: un
            <fieldset disabled> de HTML apaga TODOS sus botones internos,
            incluida navegacion que si debe funcionar en modo "Ver"). */}
            {editing && editing.periodo_nomina && (
              <Button
                size="small"
                startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                onClick={() => router.push(`/tesoreria/nominas`)}
                sx={{ alignSelf: "flex-start", mb: 1 }}
              >
                Ver nómina {editing.periodo_nomina_serie ? `(${editing.periodo_nomina_serie})` : ""}
              </Button>
            )}
            {editing && editing.contrato && (
              <Button
                size="small"
                startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                onClick={() => setPanelReferencia({ tipo: "contrato", id: editing.contrato as string })}
                sx={{ alignSelf: "flex-start", mb: 1 }}
              >
                Ver contrato
              </Button>
            )}
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <TextField
                size="small"
                label="ID de flujo"
                value={editing ? editing.id_flujo : idFlujoPrevio}
                disabled
                fullWidth
              />
              <Autocomplete
                size="small"
                fullWidth
                disabled={!!editing}
                options={contratos}
                value={contratos.find((c) => c.id_contrato === form.contrato) || null}
                onChange={(_, seleccion) => setForm({ ...form, contrato: seleccion?.id_contrato || "" })}
                getOptionLabel={(c) => `${c.id_contrato} — ${c.contraparte_nombre}`}
                isOptionEqualToValue={(a, b) => a.id_contrato === b.id_contrato}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Contrato"
                    required
                    helperText={
                      form.reembolso
                        ? "Para reembolsos sin contrato de obra, elige la empresa abajo para usar su contrato genérico."
                        : undefined
                    }
                  />
                )}
              />
              {form.reembolso && !editing && (
                <FormControl size="small" fullWidth>
                  <InputLabel id="empresa-reembolso-label">Empresa (para el contrato genérico)</InputLabel>
                  <Select
                    labelId="empresa-reembolso-label"
                    label="Empresa (para el contrato genérico)"
                    value=""
                    onChange={async (e) => {
                      const sociedad = e.target.value;
                      if (!sociedad) return;
                      try {
                        const { id_contrato } = await getContratoGenericoReembolsoPorSociedad(sociedad);
                        setForm((prev) => ({ ...prev, contrato: id_contrato }));
                      } catch {
                        // Silencioso - el usuario igual puede elegir el
                        // contrato a mano si esto falla.
                      }
                    }}
                  >
                    {sociedades.map((s) => (
                      <MenuItem key={s.rfc} value={s.rfc}>
                        {s.alias_sociedad || s.razon_social || s.rfc}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl size="small" fullWidth disabled={!!editing}>
                <InputLabel id="periodo-nomina-label">Nómina (opcional)</InputLabel>
                <Select
                  labelId="periodo-nomina-label"
                  label="Nómina (opcional)"
                  value={form.periodoNomina}
                  onChange={async (e) => {
                    const idNomina = e.target.value;
                    setForm((prev) => ({ ...prev, periodoNomina: idNomina }));
                    // Autocompleta Contrato/Concepto (10/Sep/2026, modulo de
                    // Nominas Fase 1) - solo si estan vacios, el usuario
                    // puede sobreescribir despues. GEN-NOMINA-<sociedad> se
                    // crea solo (get_or_create) la primera vez que se pide.
                    if (!idNomina) return;
                    const nomina = nominas.find((n) => n.id_nomina === idNomina);
                    try {
                      // Solo se puede autocompletar sin ambiguedad si la
                      // nomina tiene una unica sociedad (14/Sep/2026,
                      // "pueden estar contratados por dos sociedades") - con
                      // varias, el backend rechaza sin `?sociedad=` y el
                      // catch de abajo deja que el usuario elija a mano.
                      const sociedadUnica = nomina?.sociedades.length === 1 ? nomina.sociedades[0] : undefined;
                      const { id_contrato } = await getContratoGenericoNomina(idNomina, sociedadUnica);
                      setForm((prev) => ({
                        ...prev,
                        contrato: prev.contrato || id_contrato,
                        concepto: prev.concepto || nomina?.serie || prev.concepto,
                      }));
                    } catch {
                      // Silencioso - el usuario igual puede elegir el
                      // contrato a mano si esto falla.
                    }
                  }}
                >
                  <MenuItem value="">
                    <em>Ninguna</em>
                  </MenuItem>
                  {nominas.map((n) => (
                    <MenuItem key={n.id_nomina} value={n.id_nomina}>
                      {n.id_nomina} — {n.serie}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>Si este pago es una línea de nómina, elige el periodo aquí.</FormHelperText>
              </FormControl>
              {editing && editing.periodo_nomina && (
                <Chip
                  size="small"
                  variant="outlined"
                  color={editing.nomina ? "success" : "default"}
                  label={
                    editing.nomina
                      ? `Recibo de nómina vinculado: ${
                          recNominas.find((n) => n.timbre_uuid === editing.nomina)?.folio || editing.nomina
                        }`
                      : "Sin recibo de nómina vinculado — usa \"Vincular factura/complemento\""
                  }
                  sx={{ alignSelf: "flex-start" }}
                />
              )}
              {editing && editing.descripcion_pago && (
                <TextField size="small" label="Descripción de pago" value={editing.descripcion_pago} disabled fullWidth />
              )}
              <TextField
                size="small"
                type="date"
                label={
                  <LabelTip
                    text="Fecha efectiva"
                    tip="Fecha del movimiento según el contrato/factura, puede no coincidir con la fecha real de pago."
                  />
                }
                value={form.fechaEfectiva}
                onChange={(e) => setForm({ ...form, fechaEfectiva: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label="Concepto"
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                fullWidth
              />
              <FormControl size="small" fullWidth>
                <InputLabel id="categoria-gasto-label">Categoría de gasto</InputLabel>
                <Select
                  labelId="categoria-gasto-label"
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
              <ToggleCard
                icon={Undo2}
                title="Es un reembolso"
                description="El dinero regresa a un empleado, no a un proveedor"
                checked={form.reembolso}
                disabled={!!editing}
                onChange={(checked) => setForm({ ...form, reembolso: checked })}
              />
              {form.reembolso && (
                <TextField
                  size="small"
                  label="ID de empleado (reembolso)"
                  value={form.idEmpleadoReembolso}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, idEmpleadoReembolso: e.target.value })}
                  fullWidth
                />
              )}
              <CuentaBancariaSelector
                // 25/Sep/2026, "habilitar editar Cuenta solo si no esta
                // pagado" - antes se bloqueaba siempre al editar, sin
                // importar el estado, y no habia forma de corregir un
                // error de captura (transaccion asignada a la cuenta
                // equivocada) sin pasar por soporte tecnico. Una vez
                // pagado (dinero ya conciliado/liquidado), sigue
                // bloqueado - mover la cuenta de un movimiento ya
                // liquidado es una correccion mas delicada que un
                // simple PATCH (ver historial de Saldos), queda fuera de
                // este cambio.
                disabled={!!editing && !!editing.pagado}
                value={cuentaSeleccionada}
                onChange={(seleccion) => {
                  setCuentaSeleccionada(seleccion);
                  setForm({ ...form, cuenta: seleccion?.id_cuenta_bancaria || "" });
                }}
              />
              <TextField
                size="small"
                label="Total (MXP)"
                value={form.totalMxp}
                onChange={(e) => setForm({ ...form, totalMxp: e.target.value })}
                fullWidth
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  size="small"
                  type="date"
                  label={
                    <LabelTip
                      text="Fecha de pago original"
                      tip="Fecha en que debía pagarse antes de cualquier reprogramación."
                    />
                  }
                  value={form.fechaPagoOriginal}
                  onChange={(e) => setForm({ ...form, fechaPagoOriginal: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  size="small"
                  label={
                    <LabelTip
                      text="Comprobante de banco (link)"
                      tip='Campo heredado del sistema anterior (link a mano); el comprobante real se sube como archivo desde "Registrar pago".'
                    />
                  }
                  value={form.linkComprobanteBanco}
                  onChange={(e) => setForm({ ...form, linkComprobanteBanco: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>
              {editing ? (
                <>
                  <Divider sx={{ my: 1 }} />
                  <TextField
                    size="small"
                    label="Autorización"
                    value={editing.autorizacion ? "Sí" : "No"}
                    disabled
                    fullWidth
                  />
                  {editing.autorizacion && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField
                        size="small"
                        label="Autorizado por"
                        value={editing.autorizado_por || "—"}
                        disabled
                        fullWidth
                      />
                      <TextField
                        size="small"
                        label={
                          <LabelTip
                            text="Fecha de autorización"
                            tip='Se llena sola al presionar "Aprobar", no es editable aquí.'
                          />
                        }
                        value={editing.fecha_autorizacion || "—"}
                        disabled
                        fullWidth
                      />
                    </Stack>
                  )}
                  <TextField size="small" label="Pagado" value={editing.pagado ? "Sí" : "No"} disabled fullWidth />
                  {editing.pagado && (
                    <TextField
                      size="small"
                      label={
                        <LabelTip
                          text="Fecha de pago"
                          tip='Se llena sola al "Registrar pago", no es editable aquí.'
                        />
                      }
                      value={editing.fecha_pago || "—"}
                      disabled
                      fullWidth
                    />
                  )}
                </>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Autorización / autorizado por / fecha de autorización, y pagado / fecha de
                  pago / descripción del pago / comprobante (se sube el archivo, no un link) se
                  capturan con las acciones Aprobar / Rechazar / Registrar pago, no aquí.
                </Typography>
              )}
            </Stack>
            </>
          )}

          {tab === "Referencias" && (
            <>
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              {/* ID de requisicion y Link de referencia se quitaron
              (17/Sep/2026): 0 de 28 Flujos reales los han usado alguna vez.
              ID de empleado solo aplica a Flujos de nomina (contrato
              GEN-NOMINA-<sociedad>) - en el resto tambien queda siempre
              vacio en la practica. */}
              {esFlujoDeNomina && (
                <TextField
                  size="small"
                  label="ID de empleado"
                  value={form.idEmpleado}
                  onChange={(e) => setForm({ ...form, idEmpleado: e.target.value })}
                  fullWidth
                />
              )}
            </Stack>

            {editing && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Referencia
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  {editing.drive_file_id_referencia && !reemplazandoReferencia ? (
                    <>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <FileCheck2 size={18} strokeWidth={1.5} />
                          <Typography variant="body2">PDF de referencia</Typography>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <IconButton
                            size="small"
                            aria-label="Ver referencia"
                            title="Ver referencia"
                            onClick={() => {
                              if (!editing.drive_file_id_referencia) return;
                              setPreviewDoc({
                                url: urlVerReferenciaFlujo(editing.id_flujo),
                                titulo: `Flujo ${editing.id_flujo} — Referencia`,
                                urlExterna: urlDriveWebView(editing.drive_file_id_referencia),
                              });
                            }}
                          >
                            <Eye size={16} strokeWidth={1.5} />
                          </IconButton>
                          <Chip size="small" color="success" label="Disponible en Drive" />
                        </Stack>
                      </Stack>
                      {!soloLectura && (
                        <Button
                          size="small"
                          startIcon={<Upload size={14} strokeWidth={1.5} />}
                          sx={{ mt: 1.5 }}
                          onClick={() => setReemplazandoReferencia(true)}
                        >
                          Reemplazar referencia
                        </Button>
                      )}
                    </>
                  ) : soloLectura ? (
                    <Alert severity="info">No hay documentos.</Alert>
                  ) : (
                    <>
                      <SelectorArchivoLocalODrive
                        archivo={archivoReferenciaPendiente}
                        onChange={setArchivoReferenciaPendiente}
                        accept="application/pdf"
                        mimeTypesDrive={MIME_TYPES_COMPROBANTE}
                        tituloDrive="Elige la referencia"
                      />
                      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                        <Button
                          size="small"
                          variant="contained"
                          disabled={!archivoReferenciaPendiente || subiendoReferencia}
                          startIcon={subiendoReferencia ? <CircularProgress size={14} /> : undefined}
                          onClick={() => archivoReferenciaPendiente && handleSubirReferencia(archivoReferenciaPendiente)}
                        >
                          Subir referencia
                        </Button>
                        {reemplazandoReferencia && (
                          <Button
                            size="small"
                            onClick={() => {
                              setReemplazandoReferencia(false);
                              setArchivoReferenciaPendiente(null);
                              setErrorReferencia(null);
                            }}
                          >
                            Cancelar
                          </Button>
                        )}
                      </Stack>
                    </>
                  )}
                  {errorReferencia && (
                    <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
                      {errorReferencia}
                    </Typography>
                  )}
                </Paper>
              </Box>
            )}
            </>
          )}

          {tab === "CFDI" && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Factura, complemento de pago y recibo de nómina se vinculan {editing ? "" : "después de crear el flujo, "}
                con «Vincular CFDI» en la tabla (Facturación CFDI todavía no tiene catálogo de
                nóminas propio).
              </Typography>
              {editing && (() => {
                const facturaVinculada = editing.factura ? facturas.find((fa) => fa.timbre_uuid === editing.factura) : null;
                const complementoVinculado = editing.complemento
                  ? complementos.find((c) => c.timbre_uuid === editing.complemento)
                  : null;
                if (!editing.factura && !editing.complemento) {
                  return <Alert severity="info">No hay factura ni complemento vinculado.</Alert>;
                }
                return (
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {editing.factura && (
                      <Button
                        size="small"
                        startIcon={<Eye size={14} strokeWidth={1.5} />}
                        disabled={!facturaVinculada}
                        onClick={() => {
                          if (!facturaVinculada) return;
                          setPreviewDoc({
                            url: urlVerFacturaPdf(facturaVinculada.id),
                            titulo: `Factura ${facturaVinculada.comprobante_folio || facturaVinculada.timbre_uuid}`,
                          });
                        }}
                      >
                        Ver factura
                      </Button>
                    )}
                    {editing.complemento && (
                      <Button
                        size="small"
                        startIcon={<Eye size={14} strokeWidth={1.5} />}
                        disabled={!complementoVinculado}
                        onClick={() => {
                          if (!complementoVinculado) return;
                          setPreviewDoc({
                            url: urlVerComplementoPagoPdf(complementoVinculado.id),
                            titulo: `Complemento ${complementoVinculado.folio || complementoVinculado.timbre_uuid}`,
                          });
                        }}
                      >
                        Ver complemento
                      </Button>
                    )}
                  </Stack>
                );
              })()}
              <ToggleCard
                icon={FileCheck2}
                title="Requiere complemento de pago"
                description="El proveedor debe timbrar un complemento (REP) además de la factura"
                checked={form.requiereComplemento}
                onChange={(checked) => setForm({ ...form, requiereComplemento: checked })}
                disabled={soloLectura}
              />
              <TextField
                size="small"
                label={
                  <LabelTip
                    text="Estado del CFDI"
                    tip="Texto libre para anotar el estado del CFDI relacionado; no se calcula automático (ver Conciliación de Facturas para el estado real)."
                  />
                }
                value={form.estadoCfdi}
                onChange={(e) => setForm({ ...form, estadoCfdi: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
          )}

          {/* Comprobante de pago (25/Sep/2026, "que se vea igual a
          Referencias") - mismo Paper + SelectorArchivoLocalODrive inline,
          sube directo al elegir el archivo, sin Dialog. Se unifico
          brevemente con "Registrar pago" (subir el archivo tambien
          marcaba pagado) pero se separo de nuevo el mismo dia ("separalos,
          todavia no estan marcados como pagadas") - subir/reemplazar el
          comprobante YA NO depende de estar autorizado/pagado (sirve para
          adjuntar evidencia mientras se resuelve un error de captura, ej.
          reasignar la cuenta); "Marcar como pagado" es un bloque aparte
          mas abajo, con su propio gate de autorizacion=True +
          validacion_estado=APROBADA (backend en registrar_pago). */}
          {tab === "Comprobante de pago" && (
            <Stack spacing={1.5}>
              {/* Panel de acciones (25/Sep/2026, movido aqui desde el tab
              Control - Vincular/Conciliar/Aprobar/Rechazar viven junto al
              comprobante porque son las acciones que mas se usan justo
              antes/despues de subirlo). */}
              {editing && !soloLectura && (
                <Stack spacing={1}>
                  <Typography variant="overline" color="text.secondary">
                    Acciones
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {puedeEditar && (
                      <Button size="small" startIcon={<Link2 size={14} strokeWidth={1.5} />} onClick={() => abrirVinculo(editing)}>
                        Vincular factura/complemento
                      </Button>
                    )}
                    {puedeEditar && editing.link_comprobante_banco && (
                      <Button size="small" startIcon={<Sparkles size={14} strokeWidth={1.5} />} onClick={() => setMotorFlujo(editing)}>
                        Conciliar con IA
                      </Button>
                    )}
                    {puedeAprobar && editing.validacion_estado !== "APROBADA" && (
                      <Button
                        size="small"
                        color="success"
                        startIcon={<ThumbsUp size={14} strokeWidth={1.5} />}
                        disabled={accionando === editing.id_flujo}
                        onClick={() => handleAprobar(editing)}
                      >
                        Aprobar
                      </Button>
                    )}
                    {puedeAprobar && editing.validacion_estado !== "RECHAZADA" && (
                      <Button
                        size="small"
                        color="error"
                        startIcon={<X size={14} strokeWidth={1.5} />}
                        disabled={accionando === editing.id_flujo}
                        onClick={() => handleRechazar(editing)}
                      >
                        Rechazar
                      </Button>
                    )}
                  </Stack>
                  <Divider />
                </Stack>
              )}
              {editing && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Comprobante de pago
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    {editing.drive_file_id_comprobante && !reemplazandoComprobante ? (
                      <>
                        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <FileCheck2 size={18} strokeWidth={1.5} />
                            <Typography variant="body2">Comprobante de pago</Typography>
                          </Stack>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <IconButton
                              size="small"
                              aria-label="Ver comprobante"
                              title="Ver comprobante"
                              onClick={() => {
                                if (!editing.drive_file_id_comprobante) return;
                                setPreviewDoc({
                                  url: urlVerComprobanteFlujo(editing.id_flujo),
                                  titulo: `Flujo ${editing.id_flujo} — Comprobante`,
                                  urlExterna: urlDriveWebView(editing.drive_file_id_comprobante),
                                });
                              }}
                            >
                              <Eye size={16} strokeWidth={1.5} />
                            </IconButton>
                            <Chip size="small" color="success" label="Disponible en Drive" />
                          </Stack>
                        </Stack>
                        {puedeEditar && !soloLectura && (
                          <Button
                            size="small"
                            startIcon={<Upload size={14} strokeWidth={1.5} />}
                            sx={{ mt: 1.5 }}
                            onClick={() => setReemplazandoComprobante(true)}
                          >
                            Reemplazar comprobante
                          </Button>
                        )}
                      </>
                    ) : soloLectura ? (
                      <Alert severity="info">No hay documentos.</Alert>
                    ) : (
                      <>
                        <SelectorArchivoLocalODrive
                          archivo={archivoComprobantePendiente}
                          onChange={setArchivoComprobantePendiente}
                          accept="image/*,application/pdf"
                          mimeTypesDrive={MIME_TYPES_COMPROBANTE}
                          tituloDrive="Elige el comprobante"
                        />
                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={!archivoComprobantePendiente || subiendoComprobante}
                            startIcon={subiendoComprobante ? <CircularProgress size={14} /> : undefined}
                            onClick={() =>
                              archivoComprobantePendiente && handleSubirComprobanteInline(archivoComprobantePendiente)
                            }
                          >
                            Subir comprobante
                          </Button>
                          {reemplazandoComprobante && (
                            <Button
                              size="small"
                              onClick={() => {
                                setReemplazandoComprobante(false);
                                setArchivoComprobantePendiente(null);
                                setErrorComprobante(null);
                              }}
                            >
                              Cancelar
                            </Button>
                          )}
                        </Stack>
                      </>
                    )}
                    {errorComprobante && (
                      <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
                        {errorComprobante}
                      </Typography>
                    )}
                  </Paper>
                </Box>
              )}

              {/* "Marcar como pagado" (25/Sep/2026, separado de nuevo de
              subir comprobante) - bloque aparte, independiente del archivo.
              El backend exige autorizacion=True + validacion_estado=APROBADA
              (ver registrar_pago en views.py); se bloquea aqui mismo con el
              mismo mensaje que antes vivia en el boton del tab Control. */}
              {editing && !soloLectura && !editing.pagado && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Marcar como pagado
                  </Typography>
                  {!editing.autorizacion || editing.validacion_estado !== "APROBADA" ? (
                    <Alert severity="info">
                      Este flujo todavía no está autorizado para pago - da clic en &quot;Aprobar&quot;
                      (arriba) antes de poder marcarlo como pagado.
                    </Alert>
                  ) : (
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Stack spacing={1.5}>
                        <TextField
                          size="small"
                          label="Descripción de pago"
                          value={descripcionPagoPendiente}
                          onChange={(e) => setDescripcionPagoPendiente(e.target.value)}
                          fullWidth
                        />
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          sx={{ alignSelf: "flex-start" }}
                          disabled={subiendoComprobante}
                          startIcon={subiendoComprobante ? <CircularProgress size={14} /> : undefined}
                          onClick={handleMarcarPagado}
                        >
                          Marcar como pagado
                        </Button>
                      </Stack>
                    </Paper>
                  )}
                </Box>
              )}
            </Stack>
          )}

          {tab === "Control" && (
            <Stack spacing={2}>
              <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <TextField
                size="small"
                label={
                  <LabelTip
                    text="Comprobación asignada a"
                    tip="Quién debe juntar/revisar los comprobantes de este flujo."
                  />
                }
                value={form.comprobacionAsignadaA}
                onChange={(e) => setForm({ ...form, comprobacionAsignadaA: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <ToggleCard
                icon={ThumbsUp}
                title="Listo para aprobación"
                description="Marca que ya se revisó y puede pasar a Aprobar / Rechazar"
                checked={form.aprobacionLista}
                onChange={(checked) => setForm({ ...form, aprobacionLista: checked })}
                disabled={soloLectura}
              />
              <TextField
                size="small"
                label="Estado de validación"
                value={editing ? editing.validacion_estado || "PENDIENTE" : "PENDIENTE"}
                disabled
                fullWidth
              />
              <TextField
                size="small"
                label={
                  <LabelTip
                    text="Permiso para enviar pago"
                    tip="Código o nota de quién autorizó que se enviara el pago (heredado del sistema anterior)."
                  />
                }
                value={form.permisoEnviarPago}
                onChange={(e) => setForm({ ...form, permisoEnviarPago: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label={
                  <LabelTip
                    text="Información de envío"
                    tip="Notas libres sobre cómo/cuándo se envió el pago (banco, referencia, etc.)."
                  />
                }
                value={form.informacionEnvio}
                onChange={(e) => setForm({ ...form, informacionEnvio: e.target.value })}
                InputLabelProps={{ shrink: true }}
                multiline
                minRows={2}
                fullWidth
              />
              <TextField
                size="small"
                label="Último envío"
                value={editing?.ultimo_envio ? new Date(editing.ultimo_envio).toLocaleString("es-MX") : "—"}
                disabled
                fullWidth
              />
              <TextField
                size="small"
                label="Comentarios"
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                multiline
                minRows={2}
                fullWidth
              />
              <TextField
                size="small"
                label={
                  <LabelTip
                    text="Permiso"
                    tip="Código de permiso/centro de costo heredado del sistema anterior; no controla accesos de la app."
                  />
                }
                value={form.permiso}
                onChange={(e) => setForm({ ...form, permiso: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <Divider sx={{ my: 1 }} />
              <Typography variant="overline" color="text.secondary">
                Auditoría
              </Typography>
              {editing ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    size="small"
                    label="Fecha de alta"
                    value={new Date(editing.created_at).toLocaleString("es-MX")}
                    disabled
                    fullWidth
                  />
                  <TextField size="small" label="Registrado por" value={editing.created_by || "—"} disabled fullWidth />
                </Stack>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Fecha de alta y registrado por se llenan solos al guardar.
                </Typography>
              )}
              {editing && (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    size="small"
                    label="Última modificación"
                    value={new Date(editing.updated_at).toLocaleString("es-MX")}
                    disabled
                    fullWidth
                  />
                  <TextField size="small" label="Modificado por" value={editing.updated_by || "—"} disabled fullWidth />
                </Stack>
              )}
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{soloLectura ? "Cerrar" : "Cancelar"}</Button>
          {!soloLectura && (
            <Button variant="contained" onClick={handleGuardar} disabled={saving}>
              {saving ? <CircularProgress size={16} /> : "Guardar"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!vinculando}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setVinculando(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {vinculando ? `Vincular CFDI a ${vinculando.id_flujo}` : ""}
          <IconButton onClick={() => setVinculando(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {vinculoError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {vinculoError}
            </Alert>
          )}
          <Stack spacing={2}>
            <Autocomplete
              openOnFocus
              size="small"
              fullWidth
              loading={buscandoFactura}
              value={vinculoFactura}
              inputValue={buscaFactura}
              onInputChange={(_, nuevoValor) => setBuscaFactura(nuevoValor)}
              onChange={(_, seleccion) => setVinculoFactura(seleccion)}
              options={opcionesFactura}
              getOptionLabel={(f) => `${f.comprobante_folio || f.timbre_uuid}${f.emisor_nombre ? ` — ${f.emisor_nombre}` : ""}`}
              isOptionEqualToValue={(a, b) => a.timbre_uuid === b.timbre_uuid}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Factura"
                  helperText="Escribe para buscar por folio, UUID o nombre."
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {buscandoFactura && <CircularProgress size={16} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            <Autocomplete
              openOnFocus
              size="small"
              fullWidth
              loading={buscandoComplemento}
              value={vinculoComplemento}
              inputValue={buscaComplemento}
              onInputChange={(_, nuevoValor) => setBuscaComplemento(nuevoValor)}
              onChange={(_, seleccion) => setVinculoComplemento(seleccion)}
              options={opcionesComplemento}
              getOptionLabel={(c) => `${c.folio || c.timbre_uuid}${c.emisor_nombre ? ` — ${c.emisor_nombre}` : ""}`}
              isOptionEqualToValue={(a, b) => a.timbre_uuid === b.timbre_uuid}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Complemento de pago"
                  helperText="Escribe para buscar por folio, UUID o nombre."
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {buscandoComplemento && <CircularProgress size={16} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {vinculando?.periodo_nomina && !creandoRecibo && (
              <Autocomplete
                openOnFocus
                size="small"
                fullWidth
                value={vinculoNomina}
                onChange={(_, seleccion) => setVinculoNomina(seleccion)}
                options={recNominas}
                getOptionLabel={(n) => `${n.folio || n.timbre_uuid}${n.receptor_nombre ? ` — ${n.receptor_nombre}` : ""}`}
                isOptionEqualToValue={(a, b) => a.timbre_uuid === b.timbre_uuid}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Recibo de nómina (CFDI)"
                    helperText="El comprobante timbrado de este empleado para este periodo."
                  />
                )}
              />
            )}
            {vinculando?.periodo_nomina && !creandoRecibo && (
              <Button size="small" onClick={() => setCreandoRecibo(true)} sx={{ alignSelf: "flex-start" }}>
                El recibo no existe todavía — crearlo aquí
              </Button>
            )}
            {vinculando?.periodo_nomina && creandoRecibo && (
              <Stack spacing={1.5} sx={{ border: 1, borderColor: "divider", borderRadius: 0, p: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Alta mínima del recibo de nómina (CFDI) — el detalle completo de percepciones/deducciones se sigue
                  capturando desde Recibos de Nómina si hace falta.
                </Typography>
                {errorNuevoRecibo && (
                  <Alert severity="error" sx={{ py: 0 }}>
                    {errorNuevoRecibo}
                  </Alert>
                )}
                <TextField
                  size="small"
                  label="UUID de timbrado"
                  value={nuevoRecibo.timbreUuid}
                  onChange={(e) => setNuevoRecibo({ ...nuevoRecibo, timbreUuid: e.target.value })}
                  fullWidth
                />
                <Stack direction="row" spacing={2}>
                  <TextField
                    size="small"
                    label="Folio"
                    value={nuevoRecibo.folio}
                    onChange={(e) => setNuevoRecibo({ ...nuevoRecibo, folio: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="Total"
                    value={nuevoRecibo.total}
                    onChange={(e) => setNuevoRecibo({ ...nuevoRecibo, total: e.target.value })}
                    fullWidth
                  />
                </Stack>
                <Stack direction="row" spacing={2}>
                  <TextField
                    size="small"
                    label="No. de empleado"
                    value={nuevoRecibo.nomReceptorNumEmpleado}
                    onChange={(e) => setNuevoRecibo({ ...nuevoRecibo, nomReceptorNumEmpleado: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    type="date"
                    label="Fecha de pago"
                    value={nuevoRecibo.nominaFechaPago}
                    onChange={(e) => setNuevoRecibo({ ...nuevoRecibo, nominaFechaPago: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setCreandoRecibo(false)}>
                    Cancelar
                  </Button>
                  <Button size="small" variant="contained" onClick={handleCrearRecibo} disabled={guardandoNuevoRecibo}>
                    {guardandoNuevoRecibo ? <CircularProgress size={16} /> : "Crear y vincular"}
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVinculando(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarVinculo} disabled={guardandoVinculo}>
            {guardandoVinculo ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Menu compacto de acciones por fila - un solo lugar para tabla y
      tarjetas (ver setMenuAnchor/setMenuFlujo arriba). */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuFlujo(null);
        }}
      >
        {menuFlujo && [
          <MenuItem
            key="editar"
            disabled={!puedeEditar}
            onClick={() => {
              abrirEdicion(menuFlujo);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <Pencil size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Editar</ListItemText>
          </MenuItem>,
          <MenuItem
            key="duplicar"
            disabled={!puedeCrear}
            onClick={() => {
              abrirDuplicado(menuFlujo);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <Copy size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Duplicar</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <MotorDocumentalDialog
        open={!!motorFlujo}
        onClose={() => setMotorFlujo(null)}
        contexto={
          motorFlujo
            ? {
                etiqueta: `comprobante del flujo ${motorFlujo.id_flujo}`,
                servicioSolicitante: "tesoreria-service",
                // Misma carpeta donde subir_comprobante() ya dejo el
                // archivo (ver TesoreriaFlujoViewSet.subir_comprobante,
                // views.py) - el analista lo analiza ahi mismo, no hace
                // falta subirlo de nuevo.
                carpeta: `Tesoreria/Flujos/${motorFlujo.id_flujo}`,
                permKey: "tesoreria.editar",
                // 25/Sep/2026, "que lo tome en automatico sin tener que dar
                // Ver archivos en Drive" - el flujo ya conoce su propio
                // comprobante (drive_file_id_comprobante, ver subir_comprobante
                // en views.py), no hace falta listar la carpeta para encontrarlo.
                archivoConocido: motorFlujo.drive_file_id_comprobante
                  ? {
                      file_id: motorFlujo.drive_file_id_comprobante,
                      nombre: `Comprobante de pago — ${motorFlujo.id_flujo}`,
                      web_view_link: urlDriveWebView(motorFlujo.drive_file_id_comprobante),
                    }
                  : undefined,
                expectedDocumentType: "tesoreria.comprobante_bancario",
                camposConfirmables: TESORERIA_FLUJO_CAMPOS_CONFIRMABLES,
                onConfirmar: handleConfirmarConciliacionFlujo,
              }
            : undefined
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
