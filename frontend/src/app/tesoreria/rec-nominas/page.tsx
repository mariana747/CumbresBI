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
  IconButton,
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
import { Eye, Wallet2, Pencil, Plus, Upload, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import {
  TesoreriaFlujo,
  TesoreriaRecNomina,
  createRecNomina,
  listFlujos,
  listRecNominas,
  subirComprobanteRecNomina,
  updateRecNomina,
  urlVerComprobanteRecNomina,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  timbreUuid: "",
  folio: "",
  fecha: "",
  moneda: "",
  total: "",
  emisorRfc: "",
  emisorNombre: "",
  receptorRfc: "",
  receptorNombre: "",
  nomReceptorNumEmpleado: "",
  nominaFechaPago: "",
  tipoFactura: "",
  linkPdf: "",
  estado: "",
};

// Recibos de nomina CFDI - primer corte de encabezado/resumen (Sem 20 del
// cronograma). No expone los ~50 campos granulares de Percepcion_*/
// Deduccion_*/OtroPago_* del modelo heredado - eso vive en el propio PDF/
// XML del recibo, no hace falta capturarlo aqui (ver docstring del
// serializer). Mismo permiso que Facturas: facturacion-cfdi.crear/.editar.
export default function TesoreriaRecNominasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<TesoreriaRecNomina[]>([]);
  // Vinculado a un Flujo (10/Sep/2026, "y agrega un indicador de vinculado
  // a FLJ-XXX") - mismo criterio que las referencias cruzadas: se resuelve
  // del lado del cliente contra la lista completa de Flujos, no hay filtro
  // de backend por nomina_uuid todavia.
  const [flujos, setFlujos] = useState<TesoreriaFlujo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaRecNomina | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Comprobante de pago (11/Sep/2026, "subir comprobante no XML") - mismo
  // patron que Solicitudes de Pago: subida opcional + preview embebido,
  // distinto del PDF del CFDI (link_pdf).
  const [subiendoComprobante, setSubiendoComprobante] = useState<number | null>(null);
  const [previewComprobante, setPreviewComprobante] = useState<TesoreriaRecNomina | null>(null);

  async function handleSubirComprobante(id: number, archivo: File) {
    setSubiendoComprobante(id);
    setError(null);
    try {
      await subirComprobanteRecNomina(id, archivo);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el comprobante");
    } finally {
      setSubiendoComprobante(null);
    }
  }

  useEffect(() => {
    getSession().then(setSession);
    listFlujos().then(setFlujos).catch(() => setFlujos([]));
  }, []);

  function flujoVinculado(timbreUuid: string | null): TesoreriaFlujo | null {
    if (!timbreUuid) return null;
    return flujos.find((f) => f.nomina === timbreUuid) || null;
  }

  const puedeCrear = session?.perm_keys.includes("facturacion-cfdi.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("facturacion-cfdi.editar") ?? false;

  function refresh() {
    setLoading(true);
    listRecNominas(search || undefined)
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

  function abrirEdicion(n: TesoreriaRecNomina) {
    setEditing(n);
    setForm({
      timbreUuid: n.timbre_uuid || "",
      folio: n.folio || "",
      fecha: n.fecha ? n.fecha.slice(0, 10) : "",
      moneda: n.moneda || "",
      total: n.total || "",
      emisorRfc: n.emisor_rfc || "",
      emisorNombre: n.emisor_nombre || "",
      receptorRfc: n.receptor_rfc || "",
      receptorNombre: n.receptor_nombre || "",
      nomReceptorNumEmpleado: n.nom_receptor_num_empleado || "",
      nominaFechaPago: n.nomina_fecha_pago || "",
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
        await updateRecNomina(editing.id, form);
      } else {
        await createRecNomina(form);
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
        <Wallet2 size={22} strokeWidth={1.5} />
        <Typography variant="h5">Recibos de Nómina</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        CFDI de nómina — encabezado/resumen; el detalle de percepciones y deducciones vive en el PDF/XML del recibo.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <FiltrosBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por folio, UUID o nombre..."
          actions={
            puedeCrear ? (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={abrirAlta}
                sx={{ flexShrink: 0 }}
              >
                Nuevo Recibo
              </Button>
            ) : undefined
          }
        />

      <Paper variant="outlined">
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
                <TableCell>Empleado</TableCell>
                <TableCell>Receptor</TableCell>
                <TableCell>Fecha de pago</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Vinculado a</TableCell>
                <TableCell align="center">Comprobante</TableCell>
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
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin recibos de nómina registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((n) => (
                  <TableRow key={n.id} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{n.timbre_uuid}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{n.folio || "—"}</TableCell>
                    <TableCell>{n.nom_receptor_num_empleado || "—"}</TableCell>
                    <TableCell>{n.receptor_nombre || n.receptor_rfc || "—"}</TableCell>
                    <TableCell>{n.nomina_fecha_pago || "—"}</TableCell>
                    <TableCell align="right">{n.total || "—"}</TableCell>
                    <TableCell>{n.estado && <Chip size="small" label={n.estado} variant="outlined" />}</TableCell>
                    <TableCell>
                      {flujoVinculado(n.timbre_uuid) ? (
                        <Chip size="small" color="success" label={flujoVinculado(n.timbre_uuid)!.id_flujo} variant="outlined" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        {n.link_comprobante && (
                          <IconButton size="small" aria-label="Ver comprobante" onClick={() => setPreviewComprobante(n)}>
                            <Eye size={16} strokeWidth={1.5} />
                          </IconButton>
                        )}
                        {puedeEditar && (
                          <IconButton
                            component="label"
                            size="small"
                            aria-label={n.link_comprobante ? "Reemplazar comprobante" : "Subir comprobante"}
                            disabled={subiendoComprobante === n.id}
                          >
                            <Upload size={16} strokeWidth={1.5} />
                            <input
                              type="file"
                              hidden
                              accept="image/*,application/pdf"
                              onChange={(e) => {
                                const archivo = e.target.files?.[0];
                                if (archivo) handleSubirComprobante(n.id, archivo);
                                e.target.value = "";
                              }}
                            />
                          </IconButton>
                        )}
                        {!n.link_comprobante && !puedeEditar && (
                          <Typography variant="caption" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
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
              Sin recibos de nómina registrados.
            </Typography>
          ) : (
            items.map((n) => (
              <Paper key={n.id} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {n.folio || "—"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}
                    >
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
                    <strong>Empleado:</strong> {n.nom_receptor_num_empleado || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Receptor:</strong> {n.receptor_nombre || n.receptor_rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Fecha de pago:</strong> {n.nomina_fecha_pago || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Total:</strong> {n.total || "—"}
                  </Typography>
                  {n.estado && <Chip size="small" label={n.estado} variant="outlined" sx={{ alignSelf: "flex-start" }} />}
                  {flujoVinculado(n.timbre_uuid) && (
                    <Chip
                      size="small"
                      color="success"
                      label={`Vinculado a ${flujoVinculado(n.timbre_uuid)!.id_flujo}`}
                      variant="outlined"
                      sx={{ alignSelf: "flex-start" }}
                    />
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    {puedeEditar && (
                      <Button
                        component="label"
                        size="small"
                        startIcon={<Upload size={14} strokeWidth={1.5} />}
                        disabled={subiendoComprobante === n.id}
                      >
                        {n.link_comprobante ? "Reemplazar comprobante" : "Subir comprobante"}
                        <input
                          type="file"
                          hidden
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const archivo = e.target.files?.[0];
                            if (archivo) handleSubirComprobante(n.id, archivo);
                            e.target.value = "";
                          }}
                        />
                      </Button>
                    )}
                    {n.link_comprobante && (
                      <Button size="small" startIcon={<Eye size={14} strokeWidth={1.5} />} onClick={() => setPreviewComprobante(n)}>
                        Ver comprobante
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar Recibo ${editing.folio || editing.timbre_uuid}` : "Nuevo Recibo"}
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
                label="Folio"
                value={form.folio}
                onChange={(e) => setForm({ ...form, folio: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Fecha del comprobante"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Moneda"
                value={form.moneda}
                onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Total"
                value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
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
                label="No. de empleado"
                value={form.nomReceptorNumEmpleado}
                onChange={(e) => setForm({ ...form, nomReceptorNumEmpleado: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Fecha de pago de nómina"
                value={form.nominaFechaPago}
                onChange={(e) => setForm({ ...form, nominaFechaPago: e.target.value })}
                InputLabelProps={{ shrink: true }}
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardar} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <DocumentoPreviewDialog
        open={!!previewComprobante}
        onClose={() => setPreviewComprobante(null)}
        url={previewComprobante ? urlVerComprobanteRecNomina(previewComprobante.id) : null}
        titulo={previewComprobante ? `Comprobante ${previewComprobante.folio || previewComprobante.timbre_uuid}` : ""}
      />
    </AppShell>
  );
}
