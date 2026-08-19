"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
import { FileText, Pencil, Plus, Search, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  TesoreriaContraparte,
  TesoreriaContrato,
  TesoreriaContratoStatus,
  TesoreriaContratoTipo,
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
  montoTotalIvaMxp: "",
  requiereFactura: false,
  status: "ACTIVO" as TesoreriaContratoStatus,
  comentarios: "",
};

const STATUS_COLOR: Record<TesoreriaContratoStatus, "success" | "default"> = {
  ACTIVO: "success",
  INACTIVO: "default",
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaContrato | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(c: TesoreriaContrato) {
    setEditing(c);
    setForm({
      sociedad: c.sociedad,
      contraparte: c.contraparte,
      tipo: c.tipo || "INTERNO",
      fechaGeneracion: c.fecha_generacion || "",
      fechaVencimiento: c.fecha_vencimiento || "",
      montoTotalIvaMxp: c.monto_total_iva_mxp || "",
      requiereFactura: c.requiere_factura ?? false,
      status: c.status || "ACTIVO",
      comentarios: c.comentarios || "",
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
          montoTotalIvaMxp: form.montoTotalIvaMxp || undefined,
          requiereFactura: form.requiereFactura,
          status: form.status,
          comentarios: form.comentarios || undefined,
        });
      } else {
        await createContrato({
          sociedad: form.sociedad,
          contraparte: form.contraparte,
          tipo: form.tipo,
          fechaGeneracion: form.fechaGeneracion || undefined,
          fechaVencimiento: form.fechaVencimiento || undefined,
          montoTotalIvaMxp: form.montoTotalIvaMxp || undefined,
          requiereFactura: form.requiereFactura,
          status: form.status,
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

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileText size={22} strokeWidth={1.5} />
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
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar por ID de contrato o sociedad..."
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
              ) : contratos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin contratos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                contratos.map((c) => (
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
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            {!editing && (
              <>
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
              </>
            )}
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
            <TextField
              size="small"
              label="Monto total (IVA incluido, MXP)"
              value={form.montoTotalIvaMxp}
              onChange={(e) => setForm({ ...form, montoTotalIvaMxp: e.target.value })}
              fullWidth
            />
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
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.requiereFactura}
                  onChange={(e) => setForm({ ...form, requiereFactura: e.target.checked })}
                />
              }
              label="Requiere factura"
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
