"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Autocomplete,
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
  Typography,
} from "@mui/material";
import {
  CreditCard,
  ExternalLink,
  Eye,
  FilePenLine,
  MoreVertical,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X as CloseIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import ContraparteSelector from "@/components/ContraparteSelector";
import FiltrosBar from "@/components/FiltrosBar";
import PanelReferenciaCruzada, { ReferenciaCruzada } from "@/components/PanelReferenciaCruzada";
import { ToggleCard } from "@/components/ToggleCard";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  CONTRATO_CATEGORIA_LABELS,
  CONTRATO_DOCUMENTO_NOMBRE_OPCIONES,
  TesoreriaContraparte,
  TesoreriaContrato,
  TesoreriaContratoCategoria,
  TesoreriaContratoDocumento,
  TesoreriaContratoDocumentoNombre,
  TesoreriaContratoStatus,
  TesoreriaContratoTipo,
  TesoreriaFrecuencia,
  TesoreriaMoneda,
  TesoreriaProyectoCodigo,
  TesoreriaTipoPago,
  createContrato,
  createContratoDocumento,
  createProyectoCodigo,
  deleteContratoDocumento,
  enviarRecordatorioDocumentos,
  getContrato,
  listContrapartes,
  listContratoDocumentos,
  listContratos,
  listProyectoCodigos,
  updateContrato,
} from "@/lib/tesoreria";

// Sentinel para "Sin sociedad" (23/Sep/2026, gasto corporativo compartido) -
// distinto de "" (que en el Select significa "no elegido todavia") - se
// traduce a null al mandar al backend (ver handleGuardar). Solo lo ve alcance
// GLOBAL (ScopedQuerySet.for_scope: sociedad__in nunca hace match con NULL).
const SIN_SOCIEDAD = "__SIN_SOCIEDAD__";

const FORM_VACIO = {
  sociedad: "",
  contraparte: "",
  categoria: "" as TesoreriaContratoCategoria | "",
  tipo: "INTERNO" as TesoreriaContratoTipo,
  fechaGeneracion: new Date().toISOString().slice(0, 10),
  fechaVencimiento: "",
  proyecto: "",
  propiedad: "",
  centro: "",
  tipoPago: "" as TesoreriaTipoPago | "",
  frecuencia: "" as TesoreriaFrecuencia | "",
  duracion: "",
  fechaProyectada: "",
  moneda: "MXP" as TesoreriaMoneda,
  montoPeriodoIvaMxp: "",
  montoTotalIvaMxp: "",
  conceptoFactura: "",
  linkCarpeta: "",
  linkContrato: "",
  requiereFactura: false,
  status: "ACTIVO" as TesoreriaContratoStatus,
  comentarios: "",
  permiso: "",
  autorizacion: false,
};

// Calcula monto total = monto por periodo x duracion (numero de periodos) -
// si no hay duracion capturada, asume un solo periodo (contrato de pago
// unico). Regresa "" si el monto por periodo no es un numero valido (no
// hay nada que calcular todavia).
function calcularMontoTotal(montoPeriodo: string, duracion: string): string {
  const periodo = parseFloat(montoPeriodo);
  if (Number.isNaN(periodo)) return "";
  const periodos = parseFloat(duracion) || 1;
  return (periodo * periodos).toFixed(2);
}

const STATUS_COLOR: Record<TesoreriaContratoStatus, "success" | "default"> = {
  ACTIVO: "success",
  INACTIVO: "default",
};

// Pestañas del formulario (25/Ago/2026) - mismo criterio que Flujos: un
// solo formulario de una columna con los 22 campos capturables se sentía
// poco amigable (feedback directo), se agrupan segun a que le sirven.
// Detalles = quien/que/cuando; Pago = condiciones de cobro/pago; Enlaces =
// documentos y comentarios; Control = estado interno.
const TABS_CONTRATO = ["Detalles", "Pago", "Enlaces", "Control", "Documentos"] as const;
type TabContrato = (typeof TABS_CONTRATO)[number];

// Contratos (arranque formal de Fase 4, 18/Ago/2026, tercer corte tras
// Contrapartes/Cuentas) - "Para cada contrato: Sociedad + Contraparte ->
// genera flujos -> facturas ligadas" (notas originales de Tesoreria). Es
// el primer recurso con alcance real por sociedad (el backend ya filtra
// por sociedad_rfcs del usuario, ver tesoreria/models.py).
// useSearchParams() obliga a envolver en Suspense para el build de
// produccion (mismo motivo ya documentado en admin/usuarios/page.tsx) - lo
// necesitamos para el deep link "ir a este contrato" desde el dialogo de
// Contratos en Contrapartes.
export default function TesoreriaContratosPage() {
  return (
    <Suspense fallback={null}>
      <TesoreriaContratosPageContent />
    </Suspense>
  );
}

function TesoreriaContratosPageContent() {
  const searchParams = useSearchParams();
  const idContratoDeepLink = searchParams.get("id_contrato");
  const [session, setSession] = useState<SessionUser | null>(null);
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  // Catalogo de codigos de Proyecto (25/Sep/2026, antes texto libre sin
  // catalogo - ver TesoreriaProyectoCodigo). Se carga una sola vez al abrir
  // la pantalla, no por busqueda en vivo (volumen bajo, a diferencia de
  // Contrapartes).
  const [proyectoCodigos, setProyectoCodigos] = useState<TesoreriaProyectoCodigo[]>([]);
  const [creandoProyectoCodigo, setCreandoProyectoCodigo] = useState(false);
  const [nuevoProyectoCodigo, setNuevoProyectoCodigo] = useState<{ codigo: string; significado: string } | null>(
    null
  );
  // Buscador en vivo (23/Sep/2026, "no aparecen las contrapartes nuevas" -
  // antes era una sola carga de 200 sin buscador, y ya hay 500+ contrapartes:
  // una nueva que no cae en las primeras 200 alfabeticas nunca aparecia aqui).
  // Se re-consulta contra el catalogo real cada vez que se escribe, mismo
  // criterio que ContraparteSelector.
  const [contrapartes, setContrapartes] = useState<TesoreriaContraparte[]>([]);
  const [filtroContraparteInput, setFiltroContraparteInput] = useState("");
  const [buscandoContrapartesFiltro, setBuscandoContrapartesFiltro] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroSociedad, setFiltroSociedad] = useState("");
  // Precargado desde ?contraparte=<id> - solo muestra los contratos de esa
  // contraparte (por sociedad y proyecto), mismo criterio que filtroSociedad,
  // filtro del lado del cliente sobre la lista completa.
  const [filtroContraparte, setFiltroContraparte] = useState(searchParams.get("contraparte") || "");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  // Paginacion server-side (21/Sep/2026, mismo fix del 503 aplicado a
  // Flujos/Facturas - ver TesoreriaContratoViewSet.pagination_class).
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(20);
  const [totalContratos, setTotalContratos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaContrato | null>(null);
  // Ver vs. Editar (mismo criterio que Contrapartes/Flujos): "Ver" visible
  // siempre, "Editar" vive en el menu de tres puntos - mismo
  // dialogo/formulario, con todo deshabilitado y sin boton de Guardar
  // cuando soloLectura es true.
  const [soloLectura, setSoloLectura] = useState(false);
  // Referencia cruzada al proveedor
  const [panelReferencia, setPanelReferencia] = useState<ReferenciaCruzada>(null);
  const [form, setForm] = useState(FORM_VACIO);
  // 07/Sep/2026: solo FORMAL_RECURRENTE usa el modelo completo (vigencia,
  // periodicidad, contrato firmado, autorizacion interna) - las otras 3
  // categorias (GASTO_SUELTO, REEMBOLSO_EMPLEADO, COMPRA_ADQUISICION) son
  // todas variantes de "sin vigencia, sin contrato firmado, pago unico o
  // por evento" (caso real: GASTO_SUELTO como Restaurant Izel). Sin
  // categoria elegida no se oculta nada (mismo comportamiento de siempre,
  // contratos viejos sin categoria incluidos).
  const ocultaCamposFormales = form.categoria !== "" && form.categoria !== "FORMAL_RECURRENTE";
  const [tab, setTab] = useState<TabContrato>("Detalles");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Previsualiza el proximo id_contrato ("{sociedad}-{contraparte}-{consecutivo}",
  // ver perform_create en views.py) - solo se puede calcular una vez que
  // sociedad Y contraparte estan elegidas (el consecutivo es por esa
  // combinacion). Es solo vista previa: el ID real siempre lo asigna el
  // servidor al guardar, mismo riesgo de condicion de carrera ya
  // documentado y aceptado en TesoreriaContratoViewSet.perform_create.
  const [idContratoPrevio, setIdContratoPrevio] = useState("");
  // Objeto completo de la contraparte elegida en el alta (23/Sep/2026,
  // ContraparteSelector lo requiere controlado) - form.contraparte sigue
  // siendo el id plano que ya usaba el resto del formulario/backend.
  const [contraparteSeleccionada, setContraparteSeleccionada] = useState<TesoreriaContraparte | null>(null);

  // Checklist de documentos requeridos (diseño Tesoreria2.pdf, 28/Ago/2026)
  // - solo tiene sentido con un id_contrato ya existente (al editar), por
  // eso la pestaña "Documentos" no aparece en el alta de un contrato nuevo.
  const [documentos, setDocumentos] = useState<TesoreriaContratoDocumento[]>([]);
  const [documentosLoading, setDocumentosLoading] = useState(false);
  const [nuevoDocumentoNombre, setNuevoDocumentoNombre] = useState<TesoreriaContratoDocumentoNombre | "">("");
  const [documentosError, setDocumentosError] = useState<string | null>(null);
  const [enviandoRecordatorio, setEnviandoRecordatorio] = useState(false);
  // Selección manual de a quién avisar - el usuario elige cuáles documentos
  // pendientes incluir, no se manda automatico por todos los pendientes.
  const [documentosSeleccionados, setDocumentosSeleccionados] = useState<number[]>([]);
  const [recordatorioMensaje, setRecordatorioMensaje] = useState<string | null>(null);

  // Menu compacto de acciones por fila (28/Ago/2026, mismo patron que
  // Flujos/Contrapartes).
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuContrato, setMenuContrato] = useState<TesoreriaContrato | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listProyectoCodigos()
      .then((r) => setProyectoCodigos(r.results))
      .catch(() => setProyectoCodigos([]));
  }, []);

  // Busqueda en vivo del filtro "Filtrar por contraparte" (ver comentario
  // del estado arriba) - sin gate por texto vacio, igual que
  // ContraparteSelector: abrir el campo ya muestra el catalogo.
  useEffect(() => {
    setBuscandoContrapartesFiltro(true);
    const timeout = setTimeout(() => {
      listContrapartes(filtroContraparteInput || undefined, undefined, undefined, undefined, 200)
        .then((res) => setContrapartes(res.results))
        .catch(() => setContrapartes([]))
        .finally(() => setBuscandoContrapartesFiltro(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [filtroContraparteInput]);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  // nombreSociedad (02/Sep/2026, pedido explicito: "en contratos la columna
  // sociedad pon el nombre") - c.sociedad es un CharField plano (referencia
  // laxa a general_sociedades.rfc, ver TesoreriaContrato.sociedad), se
  // resuelve a razon_social del lado del cliente, mismo patron que
  // tesoreria/contrapartes/page.tsx.
  const nombreSociedad = (rfc: string) => sociedades.find((s) => s.rfc === rfc)?.razon_social || rfc;

  function refresh() {
    setLoading(true);
    listContratos(
      search || undefined,
      filtroContraparte || undefined,
      pagina + 1,
      filasPorPagina,
      filtroSociedad || undefined,
      filtroProyecto || undefined,
      filtroFechaDesde || undefined,
      filtroFechaHasta || undefined
    )
      .then((res) => {
        setContratos(res.results);
        setTotalContratos(res.count);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroSociedad, filtroContraparte, filtroProyecto, filtroFechaDesde, filtroFechaHasta, pagina, filasPorPagina]);

  // Volver a la primera pagina cuando cambia cualquier filtro (21/Sep/2026,
  // mismo motivo que en Flujos/Facturas).
  useEffect(() => {
    setPagina(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroSociedad, filtroContraparte, filtroProyecto, filtroFechaDesde, filtroFechaHasta]);

  // Deep link "ir a este contrato" (?id_contrato=..., desde el dialogo de
  // Contratos en Contrapartes) - abre la edicion de ese contrato en cuanto
  // llega en la URL. yaAbierto evita reabrirlo solo si el usuario lo cierra
  // a mano (sin esto, cualquier refresh() posterior a cerrar el dialogo lo
  // volveria a abrir porque el query param sigue en la URL).
  //
  // getContrato() directo por PK (21/Sep/2026, fix paginacion) - antes
  // buscaba en el array `contratos` ya cargado, que con paginacion real
  // puede no incluir ese contrato si esta en otra pagina/filtro.
  const deepLinkYaAbierto = useRef(false);
  useEffect(() => {
    if (deepLinkYaAbierto.current || !idContratoDeepLink) return;
    deepLinkYaAbierto.current = true;
    getContrato(idContratoDeepLink)
      .then((contrato) => {
        // Abre en modo "Ver" (28/Ago/2026) - el deep link viene de un boton
        // de solo lectura ("Ir a este contrato" en Contrapartes); si quiere
        // editar, usa el menu de tres puntos desde aqui.
        abrirEdicion(contrato, true);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idContratoDeepLink]);

  // Filtros de sociedad/contraparte/proyecto/fecha (25/Ago/2026, movidos al
  // servidor 21/Sep/2026 - con paginacion el cliente ya no tiene todas las
  // filas para filtrar localmente, ver refresh() y
  // TesoreriaContratoViewSet.get_queryset).
  const contratosFiltrados = contratos;

  function abrirAlta() {
    setEditing(null);
    setSoloLectura(false);
    setForm(FORM_VACIO);
    setContraparteSeleccionada(null);
    setTab("Detalles");
    setFormError(null);
    setIdContratoPrevio("");
    setDocumentos([]);
    setDocumentosError(null);
    setNuevoDocumentoNombre("");
    setRecordatorioMensaje(null);
    setDocumentosSeleccionados([]);
    setDialogOpen(true);
  }

  useEffect(() => {
    if (editing || !dialogOpen || !form.sociedad || !form.contraparte) {
      if (!editing) setIdContratoPrevio("");
      return;
    }
    // "Sin sociedad" (23/Sep/2026) - prefijo "SINSOC", mismo criterio que
    // TesoreriaContratoViewSet.perform_create. El conteo aqui es solo
    // vista previa (no filtra por "sin sociedad" especificamente, el
    // backend no distingue "sin filtro" de "sociedad NULL") - el ID real
    // siempre lo asigna el servidor al guardar.
    const esSinSociedad = form.sociedad === SIN_SOCIEDAD;
    const prefijo = esSinSociedad ? "SINSOC" : form.sociedad;
    // pageSize:1 (21/Sep/2026, fix paginacion) - solo hace falta el conteo
    // total (res.count), mismo patron que idFlujoPrevio en flujos/page.tsx.
    listContratos(undefined, form.contraparte, 1, 1, esSinSociedad ? undefined : form.sociedad)
      .then((res) => {
        const consecutivo = res.count + 1;
        setIdContratoPrevio(`${prefijo}-${form.contraparte}-${consecutivo.toString().padStart(3, "0")}`);
      })
      .catch(() => setIdContratoPrevio(""));
  }, [dialogOpen, editing, form.sociedad, form.contraparte]);

  function refreshDocumentos(idContrato: string) {
    setDocumentosLoading(true);
    setDocumentosError(null);
    listContratoDocumentos(idContrato)
      .then(setDocumentos)
      .catch((err) => setDocumentosError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setDocumentosLoading(false));
  }

  async function handleAgregarDocumento() {
    if (!editing || !nuevoDocumentoNombre) return;
    setDocumentosError(null);
    try {
      await createContratoDocumento({ contrato: editing.id_contrato, nombre: nuevoDocumentoNombre });
      setNuevoDocumentoNombre("");
      refreshDocumentos(editing.id_contrato);
    } catch (err) {
      setDocumentosError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function toggleDocumentoSeleccionado(id: number) {
    setDocumentosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleEnviarRecordatorio() {
    if (!editing || documentosSeleccionados.length === 0) return;
    setEnviandoRecordatorio(true);
    setDocumentosError(null);
    setRecordatorioMensaje(null);
    try {
      const resultado = await enviarRecordatorioDocumentos(
        editing.id_contrato,
        documentosSeleccionados,
        session?.user_id
      );
      setRecordatorioMensaje(
        `Se enviaron ${resultado.enviados.length} de ${resultado.total_pendientes} correos (uno por documento seleccionado).`
      );
      setDocumentosSeleccionados([]);
    } catch (err) {
      setDocumentosError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEnviandoRecordatorio(false);
    }
  }

  async function handleBorrarDocumento(id: number) {
    if (!editing) return;
    setDocumentosError(null);
    try {
      await deleteContratoDocumento(id);
      setDocumentosSeleccionados((prev) => prev.filter((x) => x !== id));
      refreshDocumentos(editing.id_contrato);
    } catch (err) {
      setDocumentosError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function abrirEdicion(c: TesoreriaContrato, verSolo = false) {
    setEditing(c);
    setSoloLectura(verSolo);
    setTab("Detalles");
    setDocumentos([]);
    setRecordatorioMensaje(null);
    setDocumentosSeleccionados([]);
    refreshDocumentos(c.id_contrato);
    setForm({
      sociedad: c.sociedad,
      contraparte: c.contraparte,
      categoria: c.categoria || "",
      tipo: c.tipo || "INTERNO",
      fechaGeneracion: c.fecha_generacion || "",
      fechaVencimiento: c.fecha_vencimiento || "",
      proyecto: c.proyecto || "",
      propiedad: c.propiedad || "",
      centro: c.centro || "",
      tipoPago: c.tipo_pago || "",
      frecuencia: c.frecuencia || "",
      duracion: c.duracion || "",
      fechaProyectada: c.fecha_proyectada || "",
      moneda: c.moneda || "MXP",
      montoPeriodoIvaMxp: c.monto_periodo_iva_mxp || "",
      montoTotalIvaMxp: c.monto_total_iva_mxp || "",
      conceptoFactura: c.concepto_factura || "",
      linkCarpeta: c.link_carpeta || "",
      linkContrato: c.link_contrato || "",
      requiereFactura: c.requiere_factura ?? false,
      status: c.status || "ACTIVO",
      comentarios: c.comentarios || "",
      permiso: c.permiso || "",
      autorizacion: c.autorizacion ?? false,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && (!form.sociedad || !form.contraparte)) {
      setFormError("Selecciona sociedad y contraparte.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateContrato(editing.id_contrato, {
          categoria: form.categoria || undefined,
          tipo: form.tipo,
          fechaGeneracion: form.fechaGeneracion || undefined,
          fechaVencimiento: form.fechaVencimiento || undefined,
          proyecto: form.proyecto || undefined,
          propiedad: form.propiedad || undefined,
          centro: form.centro || undefined,
          tipoPago: form.tipoPago || undefined,
          frecuencia: form.frecuencia || undefined,
          duracion: form.duracion || undefined,
          fechaProyectada: form.fechaProyectada || undefined,
          moneda: form.moneda,
          montoPeriodoIvaMxp: form.montoPeriodoIvaMxp || undefined,
          montoTotalIvaMxp: form.montoTotalIvaMxp || undefined,
          conceptoFactura: form.conceptoFactura || undefined,
          linkCarpeta: form.linkCarpeta || undefined,
          linkContrato: form.linkContrato || undefined,
          requiereFactura: form.requiereFactura,
          status: form.status,
          comentarios: form.comentarios || undefined,
          permiso: form.permiso || undefined,
          autorizacion: form.autorizacion,
        });
      } else {
        await createContrato({
          sociedad: form.sociedad === SIN_SOCIEDAD ? "" : form.sociedad,
          contraparte: form.contraparte,
          categoria: form.categoria || undefined,
          tipo: form.tipo,
          fechaGeneracion: form.fechaGeneracion || undefined,
          fechaVencimiento: form.fechaVencimiento || undefined,
          proyecto: form.proyecto || undefined,
          propiedad: form.propiedad || undefined,
          centro: form.centro || undefined,
          tipoPago: form.tipoPago || undefined,
          frecuencia: form.frecuencia || undefined,
          duracion: form.duracion || undefined,
          fechaProyectada: form.fechaProyectada || undefined,
          moneda: form.moneda,
          montoPeriodoIvaMxp: form.montoPeriodoIvaMxp || undefined,
          montoTotalIvaMxp: form.montoTotalIvaMxp || undefined,
          conceptoFactura: form.conceptoFactura || undefined,
          linkCarpeta: form.linkCarpeta || undefined,
          linkContrato: form.linkContrato || undefined,
          requiereFactura: form.requiereFactura,
          status: form.status,
          comentarios: form.comentarios || undefined,
          permiso: form.permiso || undefined,
          autorizacion: form.autorizacion,
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

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FilePenLine size={22} strokeWidth={1.5} />
        <Typography variant="h5">Contratos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Une una sociedad con una contraparte — de aquí cuelgan los flujos y facturas de Tesorería.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <FiltrosBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por ID de contrato o sociedad..."
          actions={
            puedeCrear && (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={abrirAlta}
                sx={{ flexShrink: 0 }}
              >
                Nuevo Contrato
              </Button>
            )
          }
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="filtro-sociedad-label">Filtrar por sociedad</InputLabel>
            <Select
              labelId="filtro-sociedad-label"
              label="Filtrar por sociedad"
              value={filtroSociedad}
              onChange={(e) => setFiltroSociedad(e.target.value)}
            >
              <MenuItem value="">
                <em>Todas las sociedades</em>
              </MenuItem>
              {sociedades.map((s) => (
                <MenuItem key={s.rfc} value={s.rfc}>
                  {s.razon_social || s.rfc}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            size="small"
            openOnFocus
            sx={{ minWidth: 220 }}
            loading={buscandoContrapartesFiltro}
            options={contrapartes}
            value={contrapartes.find((c) => c.id_contraparte === filtroContraparte) || null}
            inputValue={filtroContraparteInput}
            onInputChange={(_, nuevoValor) => setFiltroContraparteInput(nuevoValor)}
            onChange={(_, seleccion) => setFiltroContraparte(seleccion?.id_contraparte || "")}
            getOptionLabel={(c) => c.razon_social}
            isOptionEqualToValue={(a, b) => a.id_contraparte === b.id_contraparte}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Filtrar por contraparte"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {buscandoContrapartesFiltro && <CircularProgress size={16} />}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <TextField
            size="small"
            label="Filtrar por proyecto"
            value={filtroProyecto}
            onChange={(e) => setFiltroProyecto(e.target.value)}
            sx={{ minWidth: 160 }}
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
        tarjetas apiladas (ver abajo) - una tabla de 7 columnas no cabe en un
        telefono sin scroll horizontal incomodo. */}
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID de contrato</TableCell>
                <TableCell>Sociedad</TableCell>
                <TableCell>Contraparte</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Vencimiento</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : contratosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin contratos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                contratosFiltrados.map((c) => (
                  <TableRow key={c.id_contrato} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.id_contrato}</TableCell>
                    <TableCell>{nombreSociedad(c.sociedad)}</TableCell>
                    <TableCell>{c.contraparte_nombre}</TableCell>
                    <TableCell>{c.tipo || "—"}</TableCell>
                    <TableCell>{c.fecha_vencimiento || "—"}</TableCell>
                    <TableCell>
                      {c.status && (
                        <Chip size="small" label={c.status} color={STATUS_COLOR[c.status]} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <IconButton size="small" aria-label="Ver" onClick={() => abrirEdicion(c, true)}>
                          <Eye size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Más acciones"
                          onClick={(e) => {
                            setMenuAnchor(e.currentTarget);
                            setMenuContrato(c);
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
          ) : contratosFiltrados.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Sin contratos registrados.
            </Typography>
          ) : (
            contratosFiltrados.map((c) => (
              <Paper key={c.id_contrato} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {c.id_contrato}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.contraparte_nombre}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton size="small" aria-label="Ver" onClick={() => abrirEdicion(c, true)}>
                      <Eye size={14} strokeWidth={1.5} />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Más acciones"
                      onClick={(e) => {
                        setMenuAnchor(e.currentTarget);
                        setMenuContrato(c);
                      }}
                    >
                      <MoreVertical size={14} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Sociedad:</strong> {nombreSociedad(c.sociedad)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Contraparte:</strong> {c.contraparte_nombre}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Tipo:</strong> {c.tipo || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Vencimiento:</strong> {c.fecha_vencimiento || "—"}
                  </Typography>
                  {c.status && (
                    <Stack direction="row" spacing={0.5}>
                      <Chip size="small" label={c.status} color={STATUS_COLOR[c.status]} variant="outlined" />
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>

        <TablePagination
          component="div"
          count={totalContratos}
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

      {/* Menu compacto de acciones por fila - un solo lugar para tabla y
      tarjetas (ver setMenuAnchor/setMenuContrato arriba). */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuContrato(null);
        }}
      >
        {menuContrato && [
          <MenuItem
            key="editar"
            disabled={!puedeEditar}
            onClick={() => {
              abrirEdicion(menuContrato);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <Pencil size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Editar</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {soloLectura ? `Ver ${editing?.id_contrato}` : editing ? `Editar ${editing.id_contrato}` : "Nuevo Contrato"}
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <Tabs
          value={tab}
          onChange={(_, value: TabContrato) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          {TABS_CONTRATO.filter((t) => t !== "Documentos" || editing).map((t) => (
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
            {/* "Ver proveedor" fuera del fieldset (17/Sep/2026: un
            <fieldset disabled> de HTML apaga TODOS sus botones internos,
            incluida navegacion que si debe funcionar en modo "Ver" -
            mismo hallazgo que Flujos). */}
            {editing && editing.contraparte && (
              <Button
                size="small"
                startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                onClick={() => setPanelReferencia({ tipo: "proveedor", id: editing.contraparte as string })}
                sx={{ alignSelf: "flex-start", mb: 1 }}
              >
                Ver proveedor
              </Button>
            )}
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <TextField
                size="small"
                label="ID de contrato"
                value={
                  editing
                    ? editing.id_contrato
                    : idContratoPrevio || "Elige sociedad y contraparte para ver el ID"
                }
                disabled
                fullWidth
              />
              {/* Categoria (07/Sep/2026) - distingue la naturaleza del
                  gasto/relacion; opcional, sin default forzado (a
                  diferencia de Tipo) porque los contratos viejos no la
                  tienen y no se les hizo backfill. Elegir GASTO_SUELTO
                  oculta abajo los campos que no aplican (vigencia,
                  periodicidad, link de contrato firmado, autorizacion). */}
              <FormControl size="small" fullWidth>
                <InputLabel id="categoria-label">Categoría (opcional)</InputLabel>
                <Select
                  labelId="categoria-label"
                  label="Categoría (opcional)"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value as TesoreriaContratoCategoria | "" })}
                  disabled={soloLectura}
                >
                  <MenuItem value="">
                    <em>Sin especificar</em>
                  </MenuItem>
                  {Object.entries(CONTRATO_CATEGORIA_LABELS).map(([valor, label]) => (
                    <MenuItem key={valor} value={valor}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  size="small"
                  type="date"
                  label="Fecha de generación"
                  value={form.fechaGeneracion}
                  onChange={(e) => setForm({ ...form, fechaGeneracion: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                {!ocultaCamposFormales && (
                  <TextField
                    size="small"
                    type="date"
                    label="Fecha de vencimiento"
                    value={form.fechaVencimiento}
                    onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                )}
              </Stack>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-label">Tipo</InputLabel>
                <Select
                  labelId="tipo-label"
                  label="Tipo"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as TesoreriaContratoTipo })}
                  disabled={soloLectura}
                >
                  <MenuItem value="INTERNO">Interno</MenuItem>
                  <MenuItem value="EXTERNO">Externo</MenuItem>
                </Select>
              </FormControl>
              {!editing && (
                <>
                  <ContraparteSelector
                    value={contraparteSeleccionada}
                    onChange={(seleccion) => {
                      setContraparteSeleccionada(seleccion);
                      setForm({ ...form, contraparte: seleccion?.id_contraparte || "" });
                    }}
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel id="sociedad-label">Sociedad</InputLabel>
                    <Select
                      labelId="sociedad-label"
                      label="Sociedad"
                      value={form.sociedad}
                      onChange={(e) => setForm({ ...form, sociedad: e.target.value })}
                    >
                      {sociedades.map((s) => (
                        <MenuItem key={s.rfc} value={s.rfc}>
                          {s.razon_social || s.rfc}
                        </MenuItem>
                      ))}
                      {/* "Sin sociedad" (23/Sep/2026, gasto corporativo
                          compartido) - solo alcance GLOBAL vera despues este
                          contrato (ver SIN_SOCIEDAD arriba). */}
                      <MenuItem value={SIN_SOCIEDAD}>
                        <em>Sin sociedad</em>
                      </MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}
              {/* Proyecto/Propiedad/Centro no aplican a un gasto suelto
                  (07/Sep/2026) - son forma de ligar un contrato formal a
                  una obra/inmueble/area de costo especifica; un consumo
                  unico como Restaurant Izel no se asigna a ninguno de los
                  3. */}
              {!ocultaCamposFormales && (
                <>
                  <Autocomplete
                    size="small"
                    fullWidth
                    freeSolo
                    disabled={soloLectura}
                    options={proyectoCodigos}
                    value={proyectoCodigos.find((p) => p.codigo === form.proyecto) || form.proyecto || null}
                    getOptionLabel={(opcion) =>
                      typeof opcion === "string" ? opcion : `${opcion.codigo}${opcion.significado ? ` - ${opcion.significado}` : ""}`
                    }
                    isOptionEqualToValue={(a, b) => a.codigo === (typeof b === "string" ? b : b.codigo)}
                    filterOptions={(opciones, params) => {
                      const texto = params.inputValue.trim().toUpperCase();
                      const filtradas = opciones.filter(
                        (o) => o.codigo.includes(texto) || (o.significado || "").toUpperCase().includes(texto)
                      );
                      // "Crear nuevo" (25/Sep/2026, pedido explicito: mismo
                      // criterio que Contraparte) - solo si el texto no es ya
                      // un codigo existente y cabe en 3 caracteres.
                      if (texto && texto.length <= 3 && !opciones.some((o) => o.codigo === texto)) {
                        filtradas.push({ codigo: texto, significado: null, created_at: "", created_by: null, __crear: true } as any);
                      }
                      return filtradas;
                    }}
                    onChange={(_, seleccion) => {
                      if (!seleccion) {
                        setForm({ ...form, proyecto: "" });
                        return;
                      }
                      if (typeof seleccion === "string") {
                        setForm({ ...form, proyecto: seleccion.toUpperCase().slice(0, 3) });
                        return;
                      }
                      if ((seleccion as any).__crear) {
                        setNuevoProyectoCodigo({ codigo: seleccion.codigo, significado: "" });
                        return;
                      }
                      setForm({ ...form, proyecto: seleccion.codigo });
                    }}
                    renderOption={(props, opcion) => (
                      <li {...props} key={opcion.codigo}>
                        {(opcion as any).__crear ? `Crear nuevo "${opcion.codigo}"...` : opcion.significado ? `${opcion.codigo} - ${opcion.significado}` : opcion.codigo}
                      </li>
                    )}
                    renderInput={(params) => <TextField {...params} label="Proyecto" />}
                  />
                  <TextField
                    size="small"
                    label="Propiedad"
                    value={form.propiedad}
                    onChange={(e) => setForm({ ...form, propiedad: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="Centro"
                    value={form.centro}
                    onChange={(e) => setForm({ ...form, centro: e.target.value })}
                    fullWidth
                  />
                </>
              )}
            </Stack>
            </>
          )}

          {tab === "Pago" && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-pago-label">Tipo de pago (opcional)</InputLabel>
                <Select
                  labelId="tipo-pago-label"
                  label="Tipo de pago (opcional)"
                  value={form.tipoPago}
                  onChange={(e) => setForm({ ...form, tipoPago: e.target.value as TesoreriaTipoPago })}
                  disabled={soloLectura}
                >
                  <MenuItem value="">
                    <em>Sin especificar</em>
                  </MenuItem>
                  <MenuItem value="REGULAR">Regular</MenuItem>
                  <MenuItem value="IRREGULAR">Irregular</MenuItem>
                  <MenuItem value="UNICO">Único</MenuItem>
                </Select>
              </FormControl>
              {/* Periodicidad/Duracion/Fecha proyectada no aplican a un
                  gasto suelto (07/Sep/2026) - un consumo unico no se repite
                  ni tiene una siguiente ocurrencia que proyectar. */}
              {!ocultaCamposFormales && (
                <>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="frecuencia-label">Periodicidad</InputLabel>
                    <Select
                      labelId="frecuencia-label"
                      label="Periodicidad"
                      value={form.frecuencia}
                      onChange={(e) => setForm({ ...form, frecuencia: e.target.value as TesoreriaFrecuencia })}
                      disabled={soloLectura}
                    >
                      <MenuItem value="">
                        <em>Sin especificar</em>
                      </MenuItem>
                      {["MENSUAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL", "SEMANAL", "OTRA"].map((f) => (
                        <MenuItem key={f} value={f}>
                          {f}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                      size="small"
                      label="Duración (periodos)"
                      value={form.duracion}
                      onChange={(e) => {
                        const duracion = e.target.value;
                        setForm({
                          ...form,
                          duracion,
                          montoTotalIvaMxp: calcularMontoTotal(form.montoPeriodoIvaMxp, duracion),
                        });
                      }}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      type="date"
                      label="Fecha proyectada"
                      value={form.fechaProyectada}
                      onChange={(e) => setForm({ ...form, fechaProyectada: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Stack>
                </>
              )}
              <FormControl size="small" fullWidth>
                <InputLabel id="moneda-label">Moneda</InputLabel>
                <Select
                  labelId="moneda-label"
                  label="Moneda"
                  value={form.moneda}
                  onChange={(e) => setForm({ ...form, moneda: e.target.value as TesoreriaMoneda })}
                  disabled={soloLectura}
                >
                  <MenuItem value="MXP">MXP</MenuItem>
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="EUR">EUR</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Monto por periodo (IVA incluido, MXP)"
                value={form.montoPeriodoIvaMxp}
                onChange={(e) => {
                  const montoPeriodoIvaMxp = e.target.value;
                  setForm({
                    ...form,
                    montoPeriodoIvaMxp,
                    montoTotalIvaMxp: calcularMontoTotal(montoPeriodoIvaMxp, form.duracion),
                  });
                }}
                fullWidth
              />
              <TextField
                size="small"
                label="Monto total (IVA incluido, MXP)"
                helperText="Se calcula solo (monto por periodo × duración) - puedes ajustarlo a mano si el contrato es irregular."
                value={form.montoTotalIvaMxp}
                onChange={(e) => setForm({ ...form, montoTotalIvaMxp: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Concepto"
                value={form.conceptoFactura}
                onChange={(e) => setForm({ ...form, conceptoFactura: e.target.value })}
                fullWidth
              />
              <ToggleCard
                icon={CreditCard}
                title="Requiere factura"
                description="La contraparte debe emitir CFDI por este contrato"
                checked={form.requiereFactura}
                onChange={(checked) => setForm({ ...form, requiereFactura: checked })}
                disabled={soloLectura}
              />
            </Stack>
          )}

          {tab === "Enlaces" && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <TextField
                size="small"
                label="Link carpeta"
                value={form.linkCarpeta}
                onChange={(e) => setForm({ ...form, linkCarpeta: e.target.value })}
                fullWidth
              />
              {/* Link contrato no aplica a un gasto suelto (07/Sep/2026) -
                  no hay documento firmado de por medio. */}
              {!ocultaCamposFormales && (
                <TextField
                  size="small"
                  label="Link contrato"
                  value={form.linkContrato}
                  onChange={(e) => setForm({ ...form, linkContrato: e.target.value })}
                  fullWidth
                />
              )}
              <TextField
                size="small"
                label="Comentarios"
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
                multiline
                minRows={3}
                fullWidth
              />
            </Stack>
          )}

          {tab === "Control" && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="status-label">Estado</InputLabel>
                <Select
                  labelId="status-label"
                  label="Estado"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as TesoreriaContratoStatus })}
                  disabled={soloLectura}
                >
                  <MenuItem value="ACTIVO">Activo</MenuItem>
                  <MenuItem value="INACTIVO">Inactivo</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Permiso"
                value={form.permiso}
                onChange={(e) => setForm({ ...form, permiso: e.target.value })}
                fullWidth
              />
              {/* Autorizacion no aplica a un gasto suelto (07/Sep/2026) -
                  no hay un contrato formal que autorizar internamente. */}
              {!ocultaCamposFormales && (
                <ToggleCard
                  icon={ShieldCheck}
                  title="Autorización"
                  description="El contrato ya fue autorizado internamente"
                  checked={form.autorizacion}
                  onChange={(checked) => setForm({ ...form, autorizacion: checked })}
                  disabled={soloLectura}
                />
              )}
              {editing && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="overline" color="text.secondary">
                    Auditoría
                  </Typography>
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
                </>
              )}
            </Stack>
          )}

          {tab === "Documentos" && editing && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <Typography variant="body2" color="text.secondary">
                Checklist de documentos que este contrato requiere para poder operarse (ej. póliza,
                identificación del fiador). El cliente sube el archivo real por su cuenta, vía el enlace
                que le llega por correo al avisarle que le falta un documento.
              </Typography>
              {documentosError && <Alert severity="error">{documentosError}</Alert>}
              {recordatorioMensaje && <Alert severity="success">{recordatorioMensaje}</Alert>}
              <Stack direction="row" spacing={1}>
                <FormControl size="small" fullWidth disabled={!puedeCrear || soloLectura}>
                  <InputLabel id="nuevo-documento-label">Documento a agregar</InputLabel>
                  <Select
                    labelId="nuevo-documento-label"
                    label="Documento a agregar"
                    value={nuevoDocumentoNombre}
                    onChange={(e) => setNuevoDocumentoNombre(e.target.value as TesoreriaContratoDocumentoNombre)}
                    disabled={!puedeCrear || soloLectura}
                  >
                    {CONTRATO_DOCUMENTO_NOMBRE_OPCIONES.map((opcion) => (
                      <MenuItem key={opcion.value} value={opcion.value}>
                        {opcion.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleAgregarDocumento}
                  disabled={!puedeCrear || !nuevoDocumentoNombre || soloLectura}
                  sx={{ flexShrink: 0 }}
                >
                  Agregar
                </Button>
              </Stack>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={handleEnviarRecordatorio}
                disabled={!puedeEditar || enviandoRecordatorio || documentosSeleccionados.length === 0 || soloLectura}
                sx={{ alignSelf: "flex-start" }}
              >
                {enviandoRecordatorio ? (
                  <CircularProgress size={14} />
                ) : documentosSeleccionados.length > 0 ? (
                  `Avisar a la contraparte (${documentosSeleccionados.length} seleccionado${documentosSeleccionados.length > 1 ? "s" : ""})`
                ) : (
                  "Selecciona documentos pendientes para avisar"
                )}
              </Button>
              {documentosLoading ? (
                <Stack alignItems="center" sx={{ py: 2 }}>
                  <CircularProgress size={20} />
                </Stack>
              ) : documentos.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                  Sin documentos en el checklist todavía.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {documentos.map((doc) => (
                    <Paper key={doc.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        {doc.recibido ? (
                          <Checkbox checked disabled size="small" title="Recibido" />
                        ) : (
                          <Checkbox
                            checked={documentosSeleccionados.includes(doc.id)}
                            onChange={() => toggleDocumentoSeleccionado(doc.id)}
                            size="small"
                            title="Seleccionar para avisar a la contraparte"
                          />
                        )}
                        <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="body2">
                            {doc.nombre_display}
                            {doc.obligatorio && (
                              <Chip
                                size="small"
                                label="Obligatorio"
                                variant="outlined"
                                sx={{ ml: 1, height: 18 }}
                              />
                            )}
                          </Typography>
                          {doc.link_archivo && (
                            <Typography
                              variant="caption"
                              component="a"
                              href={doc.link_archivo}
                              target="_blank"
                              rel="noopener noreferrer"
                              color="primary"
                            >
                              Ver archivo
                            </Typography>
                          )}
                        </Stack>
                        {/* El cliente sube su archivo via magic link (correo de
                        "Avisar a la contraparte..."), el analista nunca sube
                        directamente desde aquí - solo un chip de estado, sin acción. */}
                        <Chip
                          size="small"
                          label={doc.recibido ? "Recibido" : "Pendiente del cliente"}
                          color={doc.recibido ? "success" : "default"}
                          variant="outlined"
                        />
                        {/* Un documento ya recibido (el cliente lo subió) ya no se
                        puede quitar del checklist - solo mientras sigue pendiente. */}
                        {!doc.recibido && (
                          <IconButton
                            size="small"
                            aria-label="Quitar del checklist"
                            onClick={() => handleBorrarDocumento(doc.id)}
                            disabled={!puedeEditar || soloLectura}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </IconButton>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
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

      {/* Crear codigo de Proyecto al vuelo (25/Sep/2026) - mismo criterio
          "Dialog solo cierra con X" del resto de la app. */}
      <Dialog open={!!nuevoProyectoCodigo} onClose={() => {}} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Nuevo código de proyecto
          <IconButton size="small" onClick={() => setNuevoProyectoCodigo(null)}>
            <CloseIcon size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Código" value={nuevoProyectoCodigo?.codigo || ""} disabled fullWidth />
            <TextField
              size="small"
              label="Significado"
              placeholder="Ej. Fideicomiso"
              value={nuevoProyectoCodigo?.significado || ""}
              onChange={(e) =>
                setNuevoProyectoCodigo((prev) => (prev ? { ...prev, significado: e.target.value } : prev))
              }
              fullWidth
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNuevoProyectoCodigo(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={creandoProyectoCodigo || !nuevoProyectoCodigo?.codigo}
            onClick={async () => {
              if (!nuevoProyectoCodigo) return;
              setCreandoProyectoCodigo(true);
              try {
                const creado = await createProyectoCodigo({
                  codigo: nuevoProyectoCodigo.codigo,
                  significado: nuevoProyectoCodigo.significado || undefined,
                });
                setProyectoCodigos((prev) => [...prev, creado].sort((a, b) => a.codigo.localeCompare(b.codigo)));
                setForm((prev) => ({ ...prev, proyecto: creado.codigo }));
                setNuevoProyectoCodigo(null);
              } catch (e) {
                setFormError(e instanceof Error ? e.message : "No se pudo crear el código.");
              } finally {
                setCreandoProyectoCodigo(false);
              }
            }}
          >
            {creandoProyectoCodigo ? <CircularProgress size={16} /> : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>

      <PanelReferenciaCruzada referencia={panelReferencia} onClose={() => setPanelReferencia(null)} />
    </AppShell>
  );
}
