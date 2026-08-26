"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  Typography,
} from "@mui/material";
import { CreditCard, FilePenLine, Pencil, Plus, Search, ShieldCheck, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { ToggleCard } from "@/components/ToggleCard";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  TesoreriaContraparte,
  TesoreriaContrato,
  TesoreriaContratoStatus,
  TesoreriaContratoTipo,
  TesoreriaFrecuencia,
  TesoreriaMoneda,
  TesoreriaTipoPago,
  createContrato,
  listContrapartes,
  listContratos,
  updateContrato,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  sociedad: "",
  contraparte: "",
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

const STATUS_COLOR: Record<TesoreriaContratoStatus, "success" | "default"> = {
  ACTIVO: "success",
  INACTIVO: "default",
};

// Pestañas del formulario (25/Ago/2026) - mismo criterio que Flujos: un
// solo formulario de una columna con los 22 campos capturables se sentía
// poco amigable (feedback directo), se agrupan segun a que le sirven.
// Detalles = quien/que/cuando; Pago = condiciones de cobro/pago; Enlaces =
// documentos y comentarios; Control = estado interno.
const TABS_CONTRATO = ["Detalles", "Pago", "Enlaces", "Control"] as const;
type TabContrato = (typeof TABS_CONTRATO)[number];

// Contratos (arranque formal de Fase 4, 18/Ago/2026, tercer corte tras
// Contrapartes/Cuentas) - "Para cada contrato: Sociedad + Contraparte ->
// genera flujos -> facturas ligadas" (notas originales de Tesoreria). Es
// el primer recurso con alcance real por sociedad (el backend ya filtra
// por sociedad_rfcs del usuario, ver tesoreria/models.py).
export default function TesoreriaContratosPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [contrapartes, setContrapartes] = useState<TesoreriaContraparte[]>([]);
  const [search, setSearch] = useState("");
  const [filtroSociedad, setFiltroSociedad] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaContrato | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
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

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listContrapartes().then(setContrapartes).catch(() => setContrapartes([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  function refresh() {
    setLoading(true);
    listContratos(search || undefined)
      .then(setContratos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Filtros de sociedad y fecha de generacion (25/Ago/2026) - del lado
  // del cliente: listContratos solo soporta ?search= en el backend (ver
  // TesoreriaContratoViewSet.search_fields), no hay parametro de sociedad
  // ni de fecha todavia.
  const contratosFiltrados = useMemo(() => {
    return contratos.filter((c) => {
      if (filtroSociedad && c.sociedad !== filtroSociedad) return false;
      if (filtroFechaDesde && (!c.fecha_generacion || c.fecha_generacion < filtroFechaDesde)) return false;
      if (filtroFechaHasta && (!c.fecha_generacion || c.fecha_generacion > filtroFechaHasta)) return false;
      return true;
    });
  }, [contratos, filtroSociedad, filtroFechaDesde, filtroFechaHasta]);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setTab("Detalles");
    setFormError(null);
    setIdContratoPrevio("");
    setDialogOpen(true);
  }

  useEffect(() => {
    if (editing || !dialogOpen || !form.sociedad || !form.contraparte) {
      if (!editing) setIdContratoPrevio("");
      return;
    }
    listContratos()
      .then((todos) => {
        const consecutivo =
          todos.filter((c) => c.sociedad === form.sociedad && c.contraparte === form.contraparte).length + 1;
        setIdContratoPrevio(`${form.sociedad}-${form.contraparte}-${consecutivo.toString().padStart(3, "0")}`);
      })
      .catch(() => setIdContratoPrevio(""));
  }, [dialogOpen, editing, form.sociedad, form.contraparte]);

  function abrirEdicion(c: TesoreriaContrato) {
    setEditing(c);
    setTab("Detalles");
    setForm({
      sociedad: c.sociedad,
      contraparte: c.contraparte,
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
          sociedad: form.sociedad,
          contraparte: form.contraparte,
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

      <Paper variant="outlined">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "flex-start" }}
          justifyContent="space-between"
          sx={{ p: 2 }}
        >
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 2 }}>
            <TextField
              size="small"
              placeholder="Buscar por ID de contrato o sociedad..."
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
              Nuevo contrato
            </Button>
          )}
        </Stack>
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
                    <TableCell>{c.sociedad}</TableCell>
                    <TableCell>{c.contraparte_nombre}</TableCell>
                    <TableCell>{c.tipo || "—"}</TableCell>
                    <TableCell>{c.fecha_vencimiento || "—"}</TableCell>
                    <TableCell>
                      {c.status && (
                        <Chip size="small" label={c.status} color={STATUS_COLOR[c.status]} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(c)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
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
          {editing ? `Editar ${editing.id_contrato}` : "Nuevo contrato"}
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <Tabs
          value={tab}
          onChange={(_, value: TabContrato) => setTab(value)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          {TABS_CONTRATO.map((t) => (
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
                label="ID de contrato"
                value={
                  editing
                    ? editing.id_contrato
                    : idContratoPrevio || "Elige sociedad y contraparte para ver el ID"
                }
                disabled
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small"
                  type="date"
                  label="Fecha de generación"
                  value={form.fechaGeneracion}
                  onChange={(e) => setForm({ ...form, fechaGeneracion: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  size="small"
                  type="date"
                  label="Fecha de vencimiento"
                  value={form.fechaVencimiento}
                  onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-label">Tipo</InputLabel>
                <Select
                  labelId="tipo-label"
                  label="Tipo"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as TesoreriaContratoTipo })}
                >
                  <MenuItem value="INTERNO">Interno</MenuItem>
                  <MenuItem value="EXTERNO">Externo</MenuItem>
                </Select>
              </FormControl>
              {!editing && (
                <>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="contraparte-label">Contraparte</InputLabel>
                    <Select
                      labelId="contraparte-label"
                      label="Contraparte"
                      value={form.contraparte}
                      onChange={(e) => setForm({ ...form, contraparte: e.target.value })}
                    >
                      {contrapartes.map((c) => (
                        <MenuItem key={c.id_contraparte} value={c.id_contraparte}>
                          {c.razon_social}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
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
                    </Select>
                  </FormControl>
                </>
              )}
              <TextField
                size="small"
                label="Proyecto"
                value={form.proyecto}
                onChange={(e) => setForm({ ...form, proyecto: e.target.value })}
                fullWidth
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
            </Stack>
          )}

          {tab === "Pago" && (
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-pago-label">Tipo de pago (opcional)</InputLabel>
                <Select
                  labelId="tipo-pago-label"
                  label="Tipo de pago (opcional)"
                  value={form.tipoPago}
                  onChange={(e) => setForm({ ...form, tipoPago: e.target.value as TesoreriaTipoPago })}
                >
                  <MenuItem value="">
                    <em>Sin especificar</em>
                  </MenuItem>
                  <MenuItem value="REGULAR">Regular</MenuItem>
                  <MenuItem value="IRREGULAR">Irregular</MenuItem>
                  <MenuItem value="UNICO">Único</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="frecuencia-label">Periodicidad</InputLabel>
                <Select
                  labelId="frecuencia-label"
                  label="Periodicidad"
                  value={form.frecuencia}
                  onChange={(e) => setForm({ ...form, frecuencia: e.target.value as TesoreriaFrecuencia })}
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
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small"
                  label="Duración (periodos)"
                  value={form.duracion}
                  onChange={(e) => setForm({ ...form, duracion: e.target.value })}
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
              <FormControl size="small" fullWidth>
                <InputLabel id="moneda-label">Moneda</InputLabel>
                <Select
                  labelId="moneda-label"
                  label="Moneda"
                  value={form.moneda}
                  onChange={(e) => setForm({ ...form, moneda: e.target.value as TesoreriaMoneda })}
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
                onChange={(e) => setForm({ ...form, montoPeriodoIvaMxp: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Monto total (IVA incluido, MXP)"
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
              />
            </Stack>
          )}

          {tab === "Enlaces" && (
            <Stack spacing={2}>
              <TextField
                size="small"
                label="Link carpeta"
                value={form.linkCarpeta}
                onChange={(e) => setForm({ ...form, linkCarpeta: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Link contrato"
                value={form.linkContrato}
                onChange={(e) => setForm({ ...form, linkContrato: e.target.value })}
                fullWidth
              />
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
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="status-label">Estado</InputLabel>
                <Select
                  labelId="status-label"
                  label="Estado"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as TesoreriaContratoStatus })}
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
              <ToggleCard
                icon={ShieldCheck}
                title="Autorización"
                description="El contrato ya fue autorizado internamente"
                checked={form.autorizacion}
                onChange={(checked) => setForm({ ...form, autorizacion: checked })}
              />
              {editing && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="overline" color="text.secondary">
                    Auditoría
                  </Typography>
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
                </>
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
    </AppShell>
  );
}
