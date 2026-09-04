"use client";

import { useEffect, useState } from "react";
import {
  Alert,
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
import { Receipt, Pencil, Plus, Search, Trash2, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  FacturaDoctoRelacionado,
  TesoreriaComplementoPago,
  createComplementoPago,
  createFacturaDoctoRelacionado,
  deleteFacturaDoctoRelacionado,
  listComplementosPago,
  listFacturaDoctosRelacionados,
  updateComplementoPago,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  timbreUuid: "",
  serie: "",
  folio: "",
  fecha: "",
  moneda: "",
  total: "",
  emisorRfc: "",
  emisorNombre: "",
  receptorRfc: "",
  receptorNombre: "",
  fechaDePago: "",
  montoPagado: "",
  uuidRelacion: "",
  tipoFactura: "",
  linkPdf: "",
  estado: "",
};

// "Facturas PPD a liquidar" (24/Ago/2026, pedido explicito de Mariana,
// alineado al estandar del SAT) - el nodo "DoctoRelacionado" del XML de un
// Complemento de Pago (REP) describe QUE facturas PPD esta liquidando este
// pago y con que parcialidad, distinto del nodo "CfdiRelacionados" de una
// Factura normal (sustitucion/nota de credito, ese vive en
// TesoreriaFactura.tipo_relacion/uuid_relacionado). Por eso este panel vive
// aqui y no en /tesoreria/facturas - reusa la misma tabla/endpoint
// (factura_doctos_relacionados, FacturaDoctoRelacionadoViewSet) via
// timbre_uuid del propio complemento, sin FK real en el ERD (ver docstring
// del modelo).
function PanelFacturasPpdALiquidar({ timbreUuid, puedeEditar }: { timbreUuid: string; puedeEditar: boolean }) {
  const [items, setItems] = useState<FacturaDoctoRelacionado[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ idDocumento: "", numParcialidad: "", impSaldoAnt: "", impPagado: "", impSaldoInsoluto: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listFacturaDoctosRelacionados(timbreUuid)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [timbreUuid]);

  async function handleAgregar() {
    if (!nuevo.idDocumento) {
      setError("El UUID (folio fiscal) de la factura previa es obligatorio.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await createFacturaDoctoRelacionado(timbreUuid, nuevo);
      setNuevo({ idDocumento: "", numParcialidad: "", impSaldoAnt: "", impPagado: "", impSaldoInsoluto: "" });
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
      await deleteFacturaDoctoRelacionado(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Facturas PPD a liquidar</Typography>
      <Typography variant="caption" color="text.secondary">
        Cada renglón es una factura PPD que este pago liquida (total o parcialmente).
      </Typography>
      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>UUID (folio fiscal) de la factura previa</TableCell>
              <TableCell>Parcialidad</TableCell>
              <TableCell align="right">Saldo anterior</TableCell>
              <TableCell align="right">Pago aplicado</TableCell>
              <TableCell align="right">Saldo insoluto</TableCell>
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
                    Sin facturas ligadas a este pago.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{d.id_documento || "—"}</TableCell>
                  <TableCell>{d.num_parcialidad ?? "—"}</TableCell>
                  <TableCell align="right">{d.imp_saldo_ant || "—"}</TableCell>
                  <TableCell align="right">{d.imp_pagado || "—"}</TableCell>
                  <TableCell align="right">{d.imp_saldo_insoluto || "—"}</TableCell>
                  {puedeEditar && (
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Eliminar" onClick={() => handleEliminar(d.id)} disabled={guardando}>
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
                    placeholder="UUID de la factura"
                    value={nuevo.idDocumento}
                    onChange={(e) => setNuevo({ ...nuevo, idDocumento: e.target.value })}
                    fullWidth
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.numParcialidad}
                    onChange={(e) => setNuevo({ ...nuevo, numParcialidad: e.target.value })}
                    sx={{ width: 60 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.impSaldoAnt}
                    onChange={(e) => setNuevo({ ...nuevo, impSaldoAnt: e.target.value })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.impPagado}
                    onChange={(e) => setNuevo({ ...nuevo, impPagado: e.target.value })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <TextField
                    size="small"
                    variant="standard"
                    value={nuevo.impSaldoInsoluto}
                    onChange={(e) => setNuevo({ ...nuevo, impSaldoInsoluto: e.target.value })}
                    sx={{ width: 90 }}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" aria-label="Agregar factura a liquidar" onClick={handleAgregar} disabled={guardando}>
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

// Complementos de pago CFDI (REP) - confirman fiscalmente que una factura a
// credito ya se pago (ver docstring de TesoreriaComplementoPagoSerializer).
// Mismo permiso/patron que Facturas: facturacion-cfdi.crear/.editar.
export default function TesoreriaComplementosPagoPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<TesoreriaComplementoPago[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaComplementoPago | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Filtro por receptor (02/Sep/2026, pedido explicito: "en todo donde
  // aparezca una sociedad agrega el filtro por sociedad o receptor" ->
  // "receptor debe ser alguna sociedad" - el receptor del REP es una
  // sociedad propia de Cumbres (quien paga), NO un TesoreriaContraparte -
  // se filtra por RFC de general_sociedades).
  const [sociedadesFiltro, setSociedadesFiltro] = useState<GeneralSociedad[]>([]);
  const [filtroReceptor, setFiltroReceptor] = useState("");

  useEffect(() => {
    getSession().then(setSession);
    listSociedades()
      .then(setSociedadesFiltro)
      .catch(() => setSociedadesFiltro([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("facturacion-cfdi.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("facturacion-cfdi.editar") ?? false;

  function refresh() {
    setLoading(true);
    listComplementosPago(search || undefined, undefined, filtroReceptor || undefined)
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
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(c: TesoreriaComplementoPago) {
    setEditing(c);
    setForm({
      timbreUuid: c.timbre_uuid || "",
      serie: c.serie || "",
      folio: c.folio || "",
      fecha: c.fecha ? c.fecha.slice(0, 10) : "",
      moneda: c.moneda || "",
      total: c.total || "",
      emisorRfc: c.emisor_rfc || "",
      emisorNombre: c.emisor_nombre || "",
      receptorRfc: c.receptor_rfc || "",
      receptorNombre: c.receptor_nombre || "",
      fechaDePago: c.fecha_de_pago || "",
      montoPagado: c.monto_pagado || "",
      uuidRelacion: c.uuid_relacion || "",
      tipoFactura: c.tipo_factura || "",
      linkPdf: c.link_pdf || "",
      estado: c.estado || "",
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
      if (editing) {
        await updateComplementoPago(editing.id, form);
      } else {
        await createComplementoPago(form);
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
        <Receipt size={22} strokeWidth={1.5} />
        <Typography variant="h5">Complementos de Pago</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        CFDI de tipo REP que confirma el pago de una factura a crédito.
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
            <InputLabel id="filtro-receptor-complemento-label">Filtrar por receptor</InputLabel>
            <Select
              labelId="filtro-receptor-complemento-label"
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
              Nuevo Complemento
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
                <TableCell>Emisor</TableCell>
                <TableCell>Receptor</TableCell>
                <TableCell>Fecha de pago</TableCell>
                <TableCell align="right">Monto pagado</TableCell>
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
                      Sin complementos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.timbre_uuid}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {c.serie || ""}
                      {c.folio || "—"}
                    </TableCell>
                    <TableCell>{c.emisor_nombre || c.emisor_rfc || "—"}</TableCell>
                    <TableCell>{c.receptor_nombre || c.receptor_rfc || "—"}</TableCell>
                    <TableCell>{c.fecha_de_pago || "—"}</TableCell>
                    <TableCell align="right">{c.monto_pagado || "—"}</TableCell>
                    <TableCell>{c.estado && <Chip size="small" label={c.estado} variant="outlined" />}</TableCell>
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
        </Box>

        {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
        <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Sin complementos registrados.
            </Typography>
          ) : (
            items.map((c) => (
              <Paper key={c.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {c.serie || ""}
                      {c.folio || "—"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}
                    >
                      {c.timbre_uuid}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(c)} disabled={!puedeEditar}>
                      <Pencil size={14} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>Emisor:</strong> {c.emisor_nombre || c.emisor_rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Receptor:</strong> {c.receptor_nombre || c.receptor_rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Fecha de pago:</strong> {c.fecha_de_pago || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Monto pagado:</strong> {c.monto_pagado || "—"}
                  </Typography>
                  {c.estado && <Chip size="small" label={c.estado} variant="outlined" sx={{ alignSelf: "flex-start" }} />}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar Complemento ${editing.folio || editing.timbre_uuid}` : "Nuevo Complemento"}
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Serie"
                value={form.serie}
                onChange={(e) => setForm({ ...form, serie: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Folio"
                value={form.folio}
                onChange={(e) => setForm({ ...form, folio: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                type="date"
                label="Fecha del comprobante"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label="Moneda"
                value={form.moneda}
                onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Total"
              value={form.total}
              onChange={(e) => setForm({ ...form, total: e.target.value })}
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
                type="date"
                label="Fecha de pago"
                value={form.fechaDePago}
                onChange={(e) => setForm({ ...form, fechaDePago: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label="Monto pagado"
                value={form.montoPagado}
                onChange={(e) => setForm({ ...form, montoPagado: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="UUID de factura relacionada"
              value={form.uuidRelacion}
              onChange={(e) => setForm({ ...form, uuidRelacion: e.target.value })}
              fullWidth
            />
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
              <>
                <Divider sx={{ pt: 1 }} />
                <PanelFacturasPpdALiquidar timbreUuid={editing.timbre_uuid} puedeEditar={puedeEditar} />
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
