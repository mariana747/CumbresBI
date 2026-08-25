"use client";

import { useEffect, useState } from "react";
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
  IconButton,
  InputAdornment,
  Paper,
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
import {
  NotaCreditoConcepto,
  TesoreriaNotaCredito,
  createNotaCredito,
  createNotaCreditoConcepto,
  deleteNotaCreditoConcepto,
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
  comprobanteSerie: "",
  comprobanteFolio: "",
  comprobanteFecha: "",
  comprobanteTotal: "",
  uuidRelacionado: "",
  emisorRfc: "",
  emisorNombre: "",
  receptorRfc: "",
  receptorNombre: "",
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

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("facturacion-cfdi.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("facturacion-cfdi.editar") ?? false;

  function refresh() {
    setLoading(true);
    listNotasCredito(search || undefined)
      .then(setItems)
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

  function abrirEdicion(n: TesoreriaNotaCredito) {
    setEditing(n);
    setForm({
      timbreUuid: n.timbre_uuid || "",
      comprobanteSerie: n.comprobante_serie || "",
      comprobanteFolio: n.comprobante_folio || "",
      comprobanteFecha: n.comprobante_fecha ? n.comprobante_fecha.slice(0, 10) : "",
      comprobanteTotal: n.comprobante_total || "",
      uuidRelacionado: n.uuid_relacionado || "",
      emisorRfc: n.emisor_rfc || "",
      emisorNombre: n.emisor_nombre || "",
      receptorRfc: n.receptor_rfc || "",
      receptorNombre: n.receptor_nombre || "",
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
      if (editing) {
        await updateNotaCredito(editing.id, form);
      } else {
        await createNotaCredito(form);
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
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
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
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin notas de crédito registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((n) => (
                  <TableRow key={n.id} hover>
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
            <TextField
              size="small"
              label="UUID de la factura relacionada"
              value={form.uuidRelacionado}
              onChange={(e) => setForm({ ...form, uuidRelacionado: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
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
            <Stack direction="row" spacing={2}>
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
                label="Total"
                value={form.comprobanteTotal}
                onChange={(e) => setForm({ ...form, comprobanteTotal: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
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
            <Stack direction="row" spacing={2}>
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
            <Stack direction="row" spacing={2}>
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
