"use client";

import { useEffect, useState } from "react";
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
  IconButton,
  InputAdornment,
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
} from "@mui/material";
import { FileMinus, Pencil, Plus, Search, Trash2, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  NotaCreditoConcepto,
  TesoreriaFactura,
  TesoreriaNotaCredito,
  createNotaCredito,
  createNotaCreditoConcepto,
  deleteNotaCreditoConcepto,
  listFacturas,
  listNotaCreditoConceptos,
  listNotasCredito,
  updateNotaCredito,
} from "@/lib/tesoreria";

// Renglones de la nota de credito (Sem 20, CRUD real agregado 24/Ago/2026 -
// mismo criterio que PanelConceptos en /tesoreria/facturas: enlace logico
// por uuid, sin FK real en el ERD). Solo aplica editando una nota ya
// guardada (necesita el timbre_uuid real).
function PanelConceptos({ uuidNota, puedeEditar }: { uuidNota: string; puedeEditar: boolean }) {
  const [items, setItems] = useState<NotaCreditoConcepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ descripcion: "", cantidad: "", claveUnidad: "", valorUnitario: "", importe: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listNotaCreditoConceptos(uuidNota)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [uuidNota]);

  async function handleAgregar() {
    if (!nuevo.descripcion) {
      setError("La descripción es obligatoria.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await createNotaCreditoConcepto(uuidNota, nuevo);
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
      await deleteNotaCreditoConcepto(id);
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
  comprobanteTipoDeComprobante: "",
  comprobanteMetodoPago: "",
  comprobanteLugarExpedicion: "",
  tipoRelacion: "",
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
  estado: "",
};

// Notas de credito CFDI - ajuste fiscal sobre una factura ya emitida.
// uuidRelacionado es FK real a TesoreriaFactura.timbre_uuid (a diferencia
// de ComplementoPago.uuid_relacion, que es texto plano - ver models.py).
export default function TesoreriaNotasCreditoPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<TesoreriaNotaCredito[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaNotaCredito | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Filtro por receptor (02/Sep/2026, pedido explicito: "en todo donde
  // aparezca una sociedad agrega el filtro por sociedad o receptor" ->
  // "receptor debe ser alguna sociedad" - el receptor de una nota de
  // credito es una sociedad propia de Cumbres (quien recibe el ajuste),
  // NO un TesoreriaContraparte - se filtra por RFC de general_sociedades).
  const [sociedadesFiltro, setSociedadesFiltro] = useState<GeneralSociedad[]>([]);
  const [filtroReceptor, setFiltroReceptor] = useState("");

  // Factura relacionada (25/Ago/2026, confirmado contra el ERD:
  // tesoreria_notas_credito.UUID_Relacionado tiene FK real a
  // tesoreria_facturas.Timbre_UUID, no es texto libre) - Autocomplete con
  // busqueda en vivo, mismo patron que vincularFactura en Flujos.
  const [facturaRelacionada, setFacturaRelacionada] = useState<TesoreriaFactura | null>(null);
  const [buscaFactura, setBuscaFactura] = useState("");
  const [opcionesFactura, setOpcionesFactura] = useState<TesoreriaFactura[]>([]);
  const [buscandoFactura, setBuscandoFactura] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
    listSociedades()
      .then(setSociedadesFiltro)
      .catch(() => setSociedadesFiltro([]));
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    setBuscandoFactura(true);
    const timeout = setTimeout(() => {
      listFacturas(buscaFactura || undefined)
        .then(setOpcionesFactura)
        .catch(() => setOpcionesFactura([]))
        .finally(() => setBuscandoFactura(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaFactura, dialogOpen]);

  const puedeCrear = session?.perm_keys.includes("facturacion-cfdi.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("facturacion-cfdi.editar") ?? false;

  function refresh() {
    setLoading(true);
    listNotasCredito(search || undefined, undefined, filtroReceptor || undefined)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroReceptor]);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFacturaRelacionada(null);
    setBuscaFactura("");
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(n: TesoreriaNotaCredito) {
    setEditing(n);
    setBuscaFactura("");
    if (n.uuid_relacionado) {
      listFacturas(n.uuid_relacionado)
        .then((facturas) => setFacturaRelacionada(facturas.find((f) => f.timbre_uuid === n.uuid_relacionado) || null))
        .catch(() => setFacturaRelacionada(null));
    } else {
      setFacturaRelacionada(null);
    }
    setForm({
      timbreUuid: n.timbre_uuid || "",
      comprobanteVersion: n.comprobante_version || "",
      comprobanteSerie: n.comprobante_serie || "",
      comprobanteFolio: n.comprobante_folio || "",
      comprobanteFecha: n.comprobante_fecha ? n.comprobante_fecha.slice(0, 10) : "",
      comprobanteFormaPago: n.comprobante_forma_pago || "",
      comprobanteNoCertificado: n.comprobante_no_certificado || "",
      comprobanteSubTotal: n.comprobante_sub_total || "",
      comprobanteMoneda: n.comprobante_moneda || "",
      comprobanteExportacion: n.comprobante_exportacion || "",
      comprobanteTipoCambio: n.comprobante_tipo_cambio || "",
      comprobanteTotal: n.comprobante_total || "",
      comprobanteTipoDeComprobante: n.comprobante_tipo_de_comprobante || "",
      comprobanteMetodoPago: n.comprobante_metodo_pago || "",
      comprobanteLugarExpedicion: n.comprobante_lugar_expedicion || "",
      tipoRelacion: n.tipo_relacion || "",
      emisorRfc: n.emisor_rfc || "",
      emisorNombre: n.emisor_nombre || "",
      emisorRegimenFiscal: n.emisor_regimen_fiscal || "",
      receptorRfc: n.receptor_rfc || "",
      receptorNombre: n.receptor_nombre || "",
      receptorDomicilioFiscalReceptor: n.receptor_domicilio_fiscal_receptor || "",
      receptorRegimenFiscalReceptor: n.receptor_regimen_fiscal_receptor || "",
      receptorUsoCfdi: n.receptor_uso_cfdi || "",
      timbreVersion: n.timbre_version || "",
      timbreFechaTimbrado: n.timbre_fecha_timbrado || "",
      timbreRfcProvCertif: n.timbre_rfc_prov_certif || "",
      timbreNoCertificadoSat: n.timbre_no_certificado_sat || "",
      tipoFactura: n.tipo_factura || "",
      linkPdf: n.link_pdf || "",
      estado: n.estado || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && !form.timbreUuid) {
      setFormError("El UUID de timbrado es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const params = { ...form, uuidRelacionado: facturaRelacionada?.timbre_uuid || undefined };
      if (editing) {
        await updateNotaCredito(editing.id, params);
      } else {
        await createNotaCredito(params);
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
        <FileMinus size={22} strokeWidth={1.5} />
        <Typography variant="h5">Notas de crédito</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Ajuste fiscal sobre una factura ya emitida (CFDI de egreso).
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
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="filtro-receptor-nota-label">Filtrar por receptor</InputLabel>
            <Select
              labelId="filtro-receptor-nota-label"
              label="Filtrar por receptor"
              value={filtroReceptor}
              onChange={(e) => setFiltroReceptor(e.target.value)}
            >
              <MenuItem value="">
                <em>Todos los receptores</em>
              </MenuItem>
              {sociedadesFiltro.map((s) => (
                <MenuItem key={s.rfc} value={s.rfc}>
                  {s.alias_sociedad || s.razon_social || s.rfc}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: "auto" } }}
            >
              Nueva nota de crédito
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
                <TableCell>UUID</TableCell>
                <TableCell>Folio</TableCell>
                <TableCell>Factura relacionada</TableCell>
                <TableCell>Emisor</TableCell>
                <TableCell>Receptor</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin notas de crédito registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((n) => (
                  <TableRow key={n.id} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{n.timbre_uuid}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {n.comprobante_serie || ""}
                      {n.comprobante_folio || "—"}
                    </TableCell>
                    <TableCell>{n.factura_folio || "—"}</TableCell>
                    <TableCell>{n.emisor_nombre || n.emisor_rfc || "—"}</TableCell>
                    <TableCell>{n.receptor_nombre || n.receptor_rfc || "—"}</TableCell>
                    <TableCell align="right">{n.comprobante_total || "—"}</TableCell>
                    <TableCell>{n.estado && <Chip size="small" label={n.estado} variant="outlined" />}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(n)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
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
          ) : items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Sin notas de crédito registradas.
            </Typography>
          ) : (
            items.map((n) => (
              <Paper key={n.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {n.comprobante_serie || ""}
                      {n.comprobante_folio || "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}>
                      {n.timbre_uuid}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(n)} disabled={!puedeEditar}>
                      <Pencil size={14} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Factura relacionada:</strong> {n.factura_folio || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Emisor:</strong> {n.emisor_nombre || n.emisor_rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Receptor:</strong> {n.receptor_nombre || n.receptor_rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Total:</strong> {n.comprobante_total || "—"}
                  </Typography>
                  {n.estado && <Chip size="small" label={n.estado} variant="outlined" sx={{ alignSelf: "flex-start" }} />}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar nota ${editing.comprobante_folio || editing.timbre_uuid}` : "Nueva nota de crédito"}
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
            <TextField
              size="small"
              label="UUID de timbrado"
              value={form.timbreUuid}
              onChange={(e) => setForm({ ...form, timbreUuid: e.target.value })}
              disabled={!!editing}
              fullWidth
            />
            <Autocomplete
              openOnFocus
              size="small"
              fullWidth
              loading={buscandoFactura}
              value={facturaRelacionada}
              inputValue={buscaFactura}
              onInputChange={(_, nuevoValor) => setBuscaFactura(nuevoValor)}
              onChange={(_, seleccion) => setFacturaRelacionada(seleccion)}
              options={opcionesFactura}
              getOptionLabel={(f) => `${f.comprobante_folio || f.timbre_uuid}${f.emisor_nombre ? ` — ${f.emisor_nombre}` : ""}`}
              isOptionEqualToValue={(a, b) => a.timbre_uuid === b.timbre_uuid}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Factura relacionada"
                  helperText="Escribe para buscar por folio, UUID o nombre — es un FK real, no texto libre."
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
                label="Versión"
                value={form.comprobanteVersion}
                onChange={(e) => setForm({ ...form, comprobanteVersion: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Sub total"
                value={form.comprobanteSubTotal}
                onChange={(e) => setForm({ ...form, comprobanteSubTotal: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Total"
                value={form.comprobanteTotal}
                onChange={(e) => setForm({ ...form, comprobanteTotal: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Moneda"
                value={form.comprobanteMoneda}
                onChange={(e) => setForm({ ...form, comprobanteMoneda: e.target.value })}
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
                label="Método de pago"
                value={form.comprobanteMetodoPago}
                onChange={(e) => setForm({ ...form, comprobanteMetodoPago: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Tipo de comprobante"
                value={form.comprobanteTipoDeComprobante}
                onChange={(e) => setForm({ ...form, comprobanteTipoDeComprobante: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Exportación"
                value={form.comprobanteExportacion}
                onChange={(e) => setForm({ ...form, comprobanteExportacion: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="No. de certificado"
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
              <TextField
                size="small"
                label="Tipo de relación"
                value={form.tipoRelacion}
                onChange={(e) => setForm({ ...form, tipoRelacion: e.target.value })}
                fullWidth
              />
            </Stack>
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
              <TextField
                size="small"
                label="Régimen fiscal emisor"
                value={form.emisorRegimenFiscal}
                onChange={(e) => setForm({ ...form, emisorRegimenFiscal: e.target.value })}
                fullWidth
              />
            </Stack>
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Domicilio fiscal receptor"
                value={form.receptorDomicilioFiscalReceptor}
                onChange={(e) => setForm({ ...form, receptorDomicilioFiscalReceptor: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Régimen fiscal receptor"
                value={form.receptorRegimenFiscalReceptor}
                onChange={(e) => setForm({ ...form, receptorRegimenFiscalReceptor: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Uso de CFDI"
                value={form.receptorUsoCfdi}
                onChange={(e) => setForm({ ...form, receptorUsoCfdi: e.target.value })}
                fullWidth
              />
            </Stack>
            <Divider sx={{ pt: 1 }} />
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
                type="datetime-local"
                label="Fecha de timbrado"
                value={form.timbreFechaTimbrado ? form.timbreFechaTimbrado.slice(0, 16) : ""}
                onChange={(e) => setForm({ ...form, timbreFechaTimbrado: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="RFC proveedor de certificación"
                value={form.timbreRfcProvCertif}
                onChange={(e) => setForm({ ...form, timbreRfcProvCertif: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="No. de certificado SAT"
                value={form.timbreNoCertificadoSat}
                onChange={(e) => setForm({ ...form, timbreNoCertificadoSat: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Tipo de factura"
                value={form.tipoFactura}
                onChange={(e) => setForm({ ...form, tipoFactura: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Estado"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Link al PDF"
              value={form.linkPdf}
              onChange={(e) => setForm({ ...form, linkPdf: e.target.value })}
              fullWidth
            />
            {editing && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField size="small" label="Registrado por" value={editing.created_by || "—"} disabled fullWidth />
                <TextField size="small" label="Modificado por" value={editing.updated_by || "—"} disabled fullWidth />
              </Stack>
            )}
            {editing && (
              <>
                <Divider sx={{ pt: 1 }} />
                <PanelConceptos uuidNota={editing.timbre_uuid} puedeEditar={puedeEditar} />
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
    </AppShell>
  );
}
