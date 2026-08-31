"use client";

import { useEffect, useMemo, useState } from "react";
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
  InputAdornment,
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
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  Banknote,
  Check,
  Copy,
  Eye,
  FileCheck2,
  Link2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  ThumbsUp,
  Undo2,
  Upload,
  X,
  X as CloseIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { ToggleCard } from "@/components/ToggleCard";
import { SessionUser, getSession } from "@/lib/auth";
import {
  TESORERIA_FLUJO_CAMPOS_CONFIRMABLES,
  TesoreriaComplementoPago,
  TesoreriaContrato,
  TesoreriaCuenta,
  TesoreriaFactura,
  TesoreriaFlujo,
  TesoreriaValidacionEstado,
  aprobarFlujo,
  confirmarConciliacionFlujo,
  createFlujo,
  listComplementosPago,
  listContratos,
  listCuentas,
  listFacturas,
  listFlujos,
  rechazarFlujo,
  registrarPagoFlujo,
  subirComprobanteFlujo,
  updateFlujo,
  vincularFactura,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  // Detalles
  contrato: "",
  cuenta: "",
  totalMxp: "",
  fechaEfectiva: new Date().toISOString().slice(0, 10),
  concepto: "",
  reembolso: false,
  idEmpleadoReembolso: "",
  comentarios: "",
  fechaPagoOriginal: "",
  linkComprobanteBanco: "",
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
const TABS_FLUJO = ["Detalles", "Referencias", "CFDI", "Control"] as const;
type TabFlujo = (typeof TABS_FLUJO)[number];

const VALIDACION_COLOR: Record<TesoreriaValidacionEstado, "warning" | "success" | "error"> = {
  PENDIENTE: "warning",
  APROBADA: "success",
  RECHAZADA: "error",
};

// Flujos de caja (24/Ago/2026, Sem 21 del cronograma) - un movimiento real
// de dinero (pago a proveedor, reembolso, nomina) ligado a un contrato.
// Ciclo de vida propio con segregacion de funciones: capturar (cualquiera
// con tesoreria.crear/.editar) -> aprobar/rechazar (solo tesoreria.aprobar,
// ej. FINANZAS_MANAGER) -> registrar_pago (de vuelta a tesoreria.editar,
// el analista es quien de verdad hace la transferencia una vez autorizada).
export default function TesoreriaFlujosPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [flujos, setFlujos] = useState<TesoreriaFlujo[]>([]);
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [facturas, setFacturas] = useState<TesoreriaFactura[]>([]);
  const [complementos, setComplementos] = useState<TesoreriaComplementoPago[]>([]);
  const [search, setSearch] = useState("");
  const [filtroContrato, setFiltroContrato] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaFlujo | null>(null);
  // Ver vs. Editar (28/Ago/2026, pedido explicito de Mariana: mismo
  // criterio que Contrapartes/Contratos - "Ver" visible siempre, "Editar"
  // se mueve al menu de tres puntos) - mismo dialogo/formulario, con todo
  // deshabilitado y sin boton de Guardar cuando soloLectura es true.
  const [soloLectura, setSoloLectura] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [tab, setTab] = useState<TabFlujo>("Detalles");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<TesoreriaFlujo | null>(null);
  const [vinculoFactura, setVinculoFactura] = useState<TesoreriaFactura | null>(null);
  const [vinculoComplemento, setVinculoComplemento] = useState<TesoreriaComplementoPago | null>(null);
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

  // Dialogo de "Registrar pago" / "Subir comprobante" (26/Ago/2026,
  // finanzas.md: "upload receipts/references from their computer" - antes
  // registrar_pago se disparaba directo sin poder adjuntar nada). Mismo
  // dialogo sirve para los dos casos: si el flujo aun no esta pagado,
  // tambien llama a registrarPagoFlujo; si ya esta pagado, solo sube/
  // reemplaza el comprobante.
  const [pagoDialogFlujo, setPagoDialogFlujo] = useState<TesoreriaFlujo | null>(null);
  const [pagoDescripcion, setPagoDescripcion] = useState("");
  const [pagoArchivo, setPagoArchivo] = useState<File | null>(null);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [pagoEnviando, setPagoEnviando] = useState(false);
  // Conciliacion bancaria por IA (28/Ago/2026, ver memoria
  // "tesoreria-flujos-registro-y-conciliacion-ia-plan") - el analista ya
  // subio el comprobante (subir_comprobante) y ahora lo analiza con el
  // Motor Documental para catalogar el movimiento y proponer la
  // contraparte, en vez de capturar todo a mano.
  const [motorFlujo, setMotorFlujo] = useState<TesoreriaFlujo | null>(null);

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
      listFacturas(buscaFactura || undefined)
        .then(setOpcionesFactura)
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
      listComplementosPago(buscaComplemento || undefined)
        .then(setOpcionesComplemento)
        .catch(() => setOpcionesComplemento([]))
        .finally(() => setBuscandoComplemento(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaComplemento, vinculando]);

  useEffect(() => {
    getSession().then(setSession);
    listContratos().then(setContratos).catch(() => setContratos([]));
    listCuentas().then(setCuentas).catch(() => setCuentas([]));
    listFacturas().then(setFacturas).catch(() => setFacturas([]));
    listComplementosPago().then(setComplementos).catch(() => setComplementos([]));
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

  function abrirVinculo(f: TesoreriaFlujo) {
    setVinculando(f);
    setVinculoFactura(facturas.find((x) => x.timbre_uuid === f.factura) || null);
    setVinculoComplemento(complementos.find((x) => x.timbre_uuid === f.complemento) || null);
    setBuscaFactura("");
    setBuscaComplemento("");
    setVinculoError(null);
  }

  async function handleGuardarVinculo() {
    if (!vinculando) return;
    if (!vinculoFactura && !vinculoComplemento) {
      setVinculoError("Selecciona al menos una factura o un complemento de pago.");
      return;
    }
    setGuardandoVinculo(true);
    setVinculoError(null);
    try {
      await vincularFactura(vinculando.id_flujo, {
        factura: vinculoFactura?.timbre_uuid || undefined,
        complemento: vinculoComplemento?.timbre_uuid || undefined,
      });
      setVinculando(null);
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
    await confirmarConciliacionFlujo(motorFlujo.id_flujo, {
      campos: Object.keys(campos).length > 0 ? campos : undefined,
      contraparte_nombre: typeof contraparte_nombre === "string" ? contraparte_nombre : undefined,
      factura: typeof factura === "string" ? factura : undefined,
      complemento: typeof complemento === "string" ? complemento : undefined,
    });
    refresh();
  }

  function refresh() {
    setLoading(true);
    listFlujos({ search: search || undefined, contrato: filtroContrato || undefined })
      .then(setFlujos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroContrato]);

  // Filtro de fecha (25/Ago/2026) - por rango de fecha_efectiva, del lado
  // del cliente: listFlujos no tiene parametro de fecha en el backend
  // todavia (solo ?search=/?contrato=, ver TesoreriaFlujoViewSet).
  const flujosFiltrados = useMemo(() => {
    return flujos.filter((f) => {
      if (filtroFechaDesde && (!f.fecha_efectiva || f.fecha_efectiva < filtroFechaDesde)) return false;
      if (filtroFechaHasta && (!f.fecha_efectiva || f.fecha_efectiva > filtroFechaHasta)) return false;
      return true;
    });
  }, [flujos, filtroFechaDesde, filtroFechaHasta]);

  function abrirAlta() {
    setEditing(null);
    setSoloLectura(false);
    setForm(FORM_VACIO);
    setTab("Detalles");
    setFormError(null);
    setIdFlujoPrevio("");
    listFlujos()
      .then((todos) => setIdFlujoPrevio(`FLJ-${(todos.length + 1).toString().padStart(6, "0")}`))
      .catch(() => setIdFlujoPrevio(""));
    setDialogOpen(true);
  }

  function abrirEdicion(f: TesoreriaFlujo, verSolo = false) {
    setEditing(f);
    setSoloLectura(verSolo);
    setForm({
      contrato: f.contrato || "",
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
    });
    setTab("Detalles");
    setFormError(null);
    setIdFlujoPrevio("");
    listFlujos()
      .then((todos) => setIdFlujoPrevio(`FLJ-${(todos.length + 1).toString().padStart(6, "0")}`))
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
        });
      } else {
        await createFlujo({
          contrato: form.contrato,
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
      await aprobarFlujo(f.id_flujo);
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
      await rechazarFlujo(f.id_flujo);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
    }
  }

  function abrirDialogoPago(f: TesoreriaFlujo) {
    setPagoDialogFlujo(f);
    setPagoDescripcion("");
    setPagoArchivo(null);
    setPagoError(null);
  }

  async function handleConfirmarPago() {
    if (!pagoDialogFlujo) return;
    setPagoEnviando(true);
    setPagoError(null);
    try {
      if (pagoArchivo) {
        await subirComprobanteFlujo(pagoDialogFlujo.id_flujo, pagoArchivo, session?.user_id);
      }
      if (!pagoDialogFlujo.pagado) {
        await registrarPagoFlujo(pagoDialogFlujo.id_flujo, {
          descripcionPago: pagoDescripcion || undefined,
        });
      }
      setPagoDialogFlujo(null);
      refresh();
    } catch (err) {
      setPagoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPagoEnviando(false);
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

      <Paper variant="outlined">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "flex-start" }}
          justifyContent="space-between"
          sx={{ p: 2 }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ flexWrap: "wrap", gap: 2 }}>
            <TextField
              size="small"
              placeholder="Buscar por ID de flujo o concepto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 240 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} strokeWidth={1.5} />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="filtro-contrato-label">Filtrar por contrato</InputLabel>
              <Select
                labelId="filtro-contrato-label"
                label="Filtrar por contrato"
                value={filtroContrato}
                onChange={(e) => setFiltroContrato(e.target.value)}
              >
                <MenuItem value="">
                  <em>Todos los contratos</em>
                </MenuItem>
                {contratos.map((c) => (
                  <MenuItem key={c.id_contrato} value={c.id_contrato}>
                    {c.id_contrato} — {c.contraparte_nombre}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
          </Stack>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ flexShrink: 0 }}
            >
              Nuevo flujo
            </Button>
          )}
        </Stack>
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
                <TableCell>Descripción de Pago</TableCell>
                <TableCell>Fecha Efectiva</TableCell>
                <TableCell>Concepto</TableCell>

                <TableCell align="right">Total MXP</TableCell>
                <TableCell>CFDI vinculado</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Pagado</TableCell>
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
              ) : flujosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
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
                    <TableCell>{f.descripcion_pago || "—"}</TableCell>
                    <TableCell>{f.fecha_efectiva || "—"}</TableCell>
                    <TableCell>{f.concepto || "—"}</TableCell>
                    <TableCell align="right">
                      {f.total_mxp
                        ? Number(f.total_mxp).toLocaleString("es-MX", { style: "currency", currency: "MXN" })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {f.factura || f.complemento ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          {f.factura && <Chip size="small" label={`Factura ${folioFactura(f.factura)}`} variant="outlined" />}
                          {f.complemento && (
                            <Chip size="small" label={`REP ${folioComplemento(f.complemento)}`} variant="outlined" />
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
                    {f.factura || f.complemento ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                        {f.factura && <Chip size="small" label={`Factura ${folioFactura(f.factura)}`} variant="outlined" />}
                        {f.complemento && (
                          <Chip size="small" label={`REP ${folioComplemento(f.complemento)}`} variant="outlined" />
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
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {soloLectura ? `Ver ${editing?.id_flujo}` : editing ? `Editar ${editing.id_flujo}` : "Nuevo flujo"}
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <Tabs
          value={tab}
          onChange={(_, value: TabFlujo) => setTab(value)}
          variant="fullWidth"
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
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <TextField
                size="small"
                label="ID de flujo"
                value={editing ? editing.id_flujo : idFlujoPrevio}
                disabled
                fullWidth
              />
              <FormControl size="small" fullWidth required disabled={!!editing}>
                <InputLabel id="contrato-label">Contrato</InputLabel>
                <Select
                  labelId="contrato-label"
                  label="Contrato"
                  value={form.contrato}
                  onChange={(e) => setForm({ ...form, contrato: e.target.value })}
                >
                  {contratos.map((c) => (
                    <MenuItem key={c.id_contrato} value={c.id_contrato}>
                      {c.id_contrato} — {c.contraparte_nombre}
                    </MenuItem>
                  ))}
                </Select>
                {form.reembolso && (
                  <FormHelperText>
                    Para reembolsos sin contrato de obra, usa el contrato genérico (GEN-REEMBOLSOS-001).
                  </FormHelperText>
                )}
              </FormControl>
              {editing && editing.descripcion_pago && (
                <TextField size="small" label="Descripción de pago" value={editing.descripcion_pago} disabled fullWidth />
              )}
              <TextField
                size="small"
                type="date"
                label="Fecha efectiva"
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
              <FormControl size="small" fullWidth disabled={!!editing}>
                <InputLabel id="cuenta-label">Cuenta bancaria</InputLabel>
                <Select
                  labelId="cuenta-label"
                  label="Cuenta bancaria"
                  value={form.cuenta}
                  onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
                >
                  {cuentas.map((c) => (
                    <MenuItem key={c.id_cuenta_bancaria} value={c.id_cuenta_bancaria}>
                      {c.alias || c.clabe}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
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
                  label="Fecha de pago original"
                  value={form.fechaPagoOriginal}
                  onChange={(e) => setForm({ ...form, fechaPagoOriginal: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Comprobante de banco (link)"
                  value={form.linkComprobanteBanco}
                  onChange={(e) => setForm({ ...form, linkComprobanteBanco: e.target.value })}
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
                        label="Fecha de autorización"
                        value={editing.fecha_autorizacion || "—"}
                        disabled
                        fullWidth
                      />
                    </Stack>
                  )}
                  <TextField size="small" label="Pagado" value={editing.pagado ? "Sí" : "No"} disabled fullWidth />
                  {editing.pagado && (
                    <TextField size="small" label="Fecha de pago" value={editing.fecha_pago || "—"} disabled fullWidth />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Se actualizan con las acciones Aprobar / Rechazar / Registrar pago, no
                    aquí.
                  </Typography>
                </>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Autorización / autorizado por / fecha de autorización, y pagado / fecha de
                  pago / descripción del pago / comprobante (se sube el archivo, no un link) se
                  capturan con las acciones Aprobar / Rechazar / Registrar pago, no aquí.
                </Typography>
              )}
            </Stack>
          )}

          {tab === "Referencias" && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <TextField
                size="small"
                label="ID de empleado"
                value={form.idEmpleado}
                onChange={(e) => setForm({ ...form, idEmpleado: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="ID de requisición"
                value={form.idRequisicion}
                onChange={(e) => setForm({ ...form, idRequisicion: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Link de referencia"
                value={form.linkReferencia}
                onChange={(e) => setForm({ ...form, linkReferencia: e.target.value })}
                fullWidth
              />
            </Stack>
          )}

          {tab === "CFDI" && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                Factura, complemento de pago y recibo de nómina se vinculan {editing ? "" : "después de crear el flujo, "}
                con «Vincular CFDI» en la tabla (Facturación CFDI todavía no tiene catálogo de
                nóminas propio).
              </Typography>
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
                label="Estado del CFDI"
                value={form.estadoCfdi}
                onChange={(e) => setForm({ ...form, estadoCfdi: e.target.value })}
                fullWidth
              />
            </Stack>
          )}

          {tab === "Control" && (
            <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <TextField
                size="small"
                label="Comprobación asignada a"
                value={form.comprobacionAsignadaA}
                onChange={(e) => setForm({ ...form, comprobacionAsignadaA: e.target.value })}
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
                label="Permiso para enviar pago"
                value={form.permisoEnviarPago}
                onChange={(e) => setForm({ ...form, permisoEnviarPago: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Información de envío"
                value={form.informacionEnvio}
                onChange={(e) => setForm({ ...form, informacionEnvio: e.target.value })}
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
                label="Permiso"
                value={form.permiso}
                onChange={(e) => setForm({ ...form, permiso: e.target.value })}
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

      <Dialog open={!!vinculando} onClose={() => setVinculando(null)} fullWidth maxWidth="sm">
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
          <MenuItem
            key="vincular"
            disabled={!puedeEditar}
            onClick={() => {
              abrirVinculo(menuFlujo);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <Link2 size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Vincular factura/complemento</ListItemText>
          </MenuItem>,
          puedeEditar && menuFlujo.link_comprobante_banco && (
            <MenuItem
              key="conciliar-ia"
              onClick={() => {
                setMotorFlujo(menuFlujo);
                setMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <Sparkles size={16} strokeWidth={1.5} />
              </ListItemIcon>
              <ListItemText>Conciliar con IA</ListItemText>
            </MenuItem>
          ),
          puedeAprobar && menuFlujo.validacion_estado !== "APROBADA" && (
            <MenuItem
              key="aprobar"
              disabled={accionando === menuFlujo.id_flujo}
              onClick={() => {
                handleAprobar(menuFlujo);
                setMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <ThumbsUp size={16} strokeWidth={1.5} color="var(--mui-palette-success-main, #2e7d32)" />
              </ListItemIcon>
              <ListItemText>Aprobar</ListItemText>
            </MenuItem>
          ),
          puedeAprobar && menuFlujo.validacion_estado !== "RECHAZADA" && (
            <MenuItem
              key="rechazar"
              disabled={accionando === menuFlujo.id_flujo}
              onClick={() => {
                handleRechazar(menuFlujo);
                setMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <X size={16} strokeWidth={1.5} color="var(--mui-palette-error-main, #d32f2f)" />
              </ListItemIcon>
              <ListItemText>Rechazar</ListItemText>
            </MenuItem>
          ),
          puedeEditar && !menuFlujo.pagado && (
            <MenuItem
              key="registrar-pago"
              disabled={!menuFlujo.autorizacion}
              onClick={() => {
                abrirDialogoPago(menuFlujo);
                setMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <Check size={16} strokeWidth={1.5} />
              </ListItemIcon>
              <ListItemText>
                {menuFlujo.autorizacion ? "Registrar pago" : "Falta autorizar antes de pagar"}
              </ListItemText>
            </MenuItem>
          ),
          puedeEditar && menuFlujo.pagado && (
            <MenuItem
              key="subir-comprobante"
              onClick={() => {
                abrirDialogoPago(menuFlujo);
                setMenuAnchor(null);
              }}
            >
              <ListItemIcon>
                <Upload size={16} strokeWidth={1.5} />
              </ListItemIcon>
              <ListItemText>
                {menuFlujo.link_comprobante_banco ? "Reemplazar comprobante" : "Subir comprobante"}
              </ListItemText>
            </MenuItem>
          ),
        ]}
      </Menu>

      <Dialog open={!!pagoDialogFlujo} onClose={() => setPagoDialogFlujo(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {pagoDialogFlujo?.pagado ? "Subir comprobante" : "Registrar pago"} — {pagoDialogFlujo?.id_flujo}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {pagoError && (
              <Alert severity="error" onClose={() => setPagoError(null)}>
                {pagoError}
              </Alert>
            )}
            {!pagoDialogFlujo?.pagado && (
              <TextField
                size="small"
                label="Descripción de pago"
                value={pagoDescripcion}
                onChange={(e) => setPagoDescripcion(e.target.value)}
                fullWidth
              />
            )}
            <Button component="label" variant="outlined" startIcon={<Upload size={16} strokeWidth={1.5} />}>
              {pagoArchivo ? pagoArchivo.name : "Elegir comprobante desde mi computadora"}
              <input
                type="file"
                hidden
                onChange={(e) => setPagoArchivo(e.target.files?.[0] ?? null)}
              />
            </Button>
            {pagoDialogFlujo?.link_comprobante_banco && !pagoArchivo && (
              <FormHelperText>
                Ya hay un comprobante subido. Elige un archivo para reemplazarlo.
              </FormHelperText>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPagoDialogFlujo(null)} disabled={pagoEnviando}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmarPago}
            disabled={pagoEnviando || (!!pagoDialogFlujo?.pagado && !pagoArchivo)}
          >
            {pagoEnviando ? <CircularProgress size={20} /> : "Confirmar"}
          </Button>
        </DialogActions>
      </Dialog>

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
                expectedDocumentType: "tesoreria.comprobante_bancario",
                camposConfirmables: TESORERIA_FLUJO_CAMPOS_CONFIRMABLES,
                onConfirmar: handleConfirmarConciliacionFlujo,
              }
            : undefined
        }
      />
    </AppShell>
  );
}
