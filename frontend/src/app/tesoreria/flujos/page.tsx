"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
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
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Banknote,
  Check,
  FileCheck2,
  Link2,
  Pencil,
  Plus,
  Search,
  ThumbsUp,
  Undo2,
  X,
  X as CloseIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { ToggleCard } from "@/components/ToggleCard";
import { SessionUser, getSession } from "@/lib/auth";
import {
  TesoreriaComplementoPago,
  TesoreriaContrato,
  TesoreriaCuenta,
  TesoreriaFactura,
  TesoreriaFlujo,
  TesoreriaValidacionEstado,
  aprobarFlujo,
  createFlujo,
  listComplementosPago,
  listContratos,
  listCuentas,
  listFacturas,
  listFlujos,
  rechazarFlujo,
  registrarPagoFlujo,
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
    setForm(FORM_VACIO);
    setTab("Detalles");
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(f: TesoreriaFlujo) {
    setEditing(f);
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
    });
    setTab("Detalles");
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
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
        });
      } else {
        await createFlujo({
          contrato: form.contrato || undefined,
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
      await aprobarFlujo(f.id_flujo, session.user_id);
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

  async function handleRegistrarPago(f: TesoreriaFlujo) {
    setAccionando(f.id_flujo);
    try {
      await registrarPagoFlujo(f.id_flujo);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
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
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ p: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Buscar por ID de flujo o concepto..."
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
          />
          <TextField
            size="small"
            type="date"
            label="Fecha hasta"
            value={filtroFechaHasta}
            onChange={(e) => setFiltroFechaHasta(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: "auto" } }}
            >
              Nuevo flujo
            </Button>
          )}
        </Stack>
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
                  <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : flujosFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
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
                    <TableCell>{f.cuenta_alias || f.cuenta}</TableCell>
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
                        <Tooltip title="Editar">
                          <span>
                            <IconButton
                              size="small"
                              aria-label="Editar"
                              onClick={() => abrirEdicion(f)}
                              disabled={!puedeEditar}
                            >
                              <Pencil size={14} strokeWidth={1.5} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Vincular factura/complemento">
                          <span>
                            <IconButton
                              size="small"
                              aria-label="Vincular factura/complemento"
                              onClick={() => abrirVinculo(f)}
                              disabled={!puedeEditar}
                            >
                              <Link2 size={14} strokeWidth={1.5} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        {puedeAprobar && f.validacion_estado !== "APROBADA" && (
                          <Tooltip title="Aprobar">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Aprobar"
                                color="success"
                                onClick={() => handleAprobar(f)}
                                disabled={accionando === f.id_flujo}
                              >
                                <ThumbsUp size={14} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {puedeAprobar && f.validacion_estado !== "RECHAZADA" && (
                          <Tooltip title="Rechazar">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Rechazar"
                                color="error"
                                onClick={() => handleRechazar(f)}
                                disabled={accionando === f.id_flujo}
                              >
                                <X size={14} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {puedeEditar && !f.pagado && (
                          <Tooltip title={f.autorizacion ? "Registrar pago" : "Falta autorizar antes de pagar"}>
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Registrar pago"
                                color="primary"
                                onClick={() => handleRegistrarPago(f)}
                                disabled={!f.autorizacion || accionando === f.id_flujo}
                              >
                                <Check size={14} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar ${editing.id_flujo}` : "Nuevo flujo"}
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
            <Stack spacing={2}>
              <TextField
                size="small"
                label="ID de flujo"
                value={editing ? editing.id_flujo : "Se genera automático al guardar (FLJ-000000)"}
                disabled
                fullWidth
              />
              <FormControl size="small" fullWidth disabled={!!editing}>
                <InputLabel id="contrato-label">Contrato (opcional)</InputLabel>
                <Select
                  labelId="contrato-label"
                  label="Contrato (opcional)"
                  value={form.contrato}
                  onChange={(e) => setForm({ ...form, contrato: e.target.value })}
                >
                  <MenuItem value="">
                    <em>Sin contrato (ej. reembolso suelto)</em>
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
              <Typography variant="caption" color="text.secondary">
                Autorización / autorizado por / fecha de autorización, y pagado / fecha de
                pago / descripción del pago / comprobante (se sube el archivo, no un link) se
                capturan con las acciones Aprobar / Rechazar / Registrar pago, no aquí.
              </Typography>
            </Stack>
          )}

          {tab === "Referencias" && (
            <Stack spacing={2}>
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
            <Stack spacing={2}>
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
            <Stack spacing={2}>
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
                <Stack direction="row" spacing={2}>
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
                <Stack direction="row" spacing={2}>
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
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardar} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
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
    </AppShell>
  );
}
