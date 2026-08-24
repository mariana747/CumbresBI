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
import { Receipt, Pencil, Plus, Search, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { TesoreriaComplementoPago, createComplementoPago, listComplementosPago, updateComplementoPago } from "@/lib/tesoreria";

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

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("facturacion-cfdi.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("facturacion-cfdi.editar") ?? false;

  function refresh() {
    setLoading(true);
    listComplementosPago(search || undefined)
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
        <Typography variant="h5">Complementos de pago</Typography>
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
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: "auto" } }}
            >
              Nuevo complemento
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
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
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin complementos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((c) => (
                  <TableRow key={c.id} hover>
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
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar complemento ${editing.folio || editing.timbre_uuid}` : "Nuevo complemento"}
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
            <Stack direction="row" spacing={2}>
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
            <Stack direction="row" spacing={2}>
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
