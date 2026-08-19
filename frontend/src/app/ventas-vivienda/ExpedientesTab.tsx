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
  FormControl,
  IconButton,
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
import { Pencil, Plus, X as CloseIcon } from "lucide-react";
import {
  ViviendaAsesor,
  ViviendaExpediente,
  ViviendaExpedienteEstado,
  ViviendaUnidad,
  createExpediente,
  listAsesores,
  listExpedientes,
  listViviendas,
  updateExpediente,
} from "@/lib/vivienda";

const ESTADO_LABELS: Record<ViviendaExpedienteEstado, string> = {
  PENDIENTE: "Pendiente",
  "EN PROCESO": "En proceso",
  CONCLUIDO: "Concluido",
  CANCELADO: "Cancelado",
};

const ESTADO_COLORS: Record<ViviendaExpedienteEstado, "default" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  "EN PROCESO": "info",
  CONCLUIDO: "success",
  CANCELADO: "error",
};

const FORM_VACIO = {
  vivienda: "",
  asesor: "",
  idContrato: "",
  estado: "PENDIENTE" as ViviendaExpedienteEstado,
  comentarios: "",
};

export default function ExpedientesTab({
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [expedientes, setExpedientes] = useState<ViviendaExpediente[]>([]);
  const [viviendas, setViviendas] = useState<ViviendaUnidad[]>([]);
  const [asesores, setAsesores] = useState<ViviendaAsesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaExpediente | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    listViviendas().then(setViviendas).catch(() => undefined);
    listAsesores().then(setAsesores).catch(() => undefined);
  }, []);

  function refresh() {
    setLoading(true);
    listExpedientes()
      .then(setExpedientes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(e: ViviendaExpediente) {
    setEditing(e);
    setForm({
      vivienda: e.vivienda,
      asesor: e.asesor,
      idContrato: e.id_contrato,
      estado: e.estado,
      comentarios: e.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && (!form.vivienda || !form.asesor || !form.idContrato.trim())) {
      setFormError("Vivienda, asesor y contrato son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateExpediente(
          editing.id_expediente,
          { estado: form.estado, comentarios: form.comentarios || null },
          actorId
        );
      } else {
        await createExpediente({
          vivienda: form.vivienda,
          asesor: form.asesor,
          idContrato: form.idContrato,
          estado: form.estado,
          comentarios: form.comentarios || null,
          actorId,
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
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Expedientes de venta (vivienda + asesor + contrato de Tesorería).
          </Typography>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: "auto" } }}
            >
              Nuevo expediente
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Vivienda</TableCell>
                <TableCell>Asesor</TableCell>
                <TableCell>Contrato</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : expedientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin expedientes registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                expedientes.map((e) => (
                  <TableRow key={e.id_expediente} hover>
                    <TableCell>{e.vivienda_denominacion || "—"}</TableCell>
                    <TableCell>{e.asesor_nombre}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id_contrato}</TableCell>
                    <TableCell>
                      <Chip size="small" label={ESTADO_LABELS[e.estado]} color={ESTADO_COLORS[e.estado]} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(e)} disabled={!puedeEditar}>
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
          {editing ? `Editar expediente ${editing.id_expediente}` : "Nuevo expediente"}
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
                  <InputLabel id="vivienda-label">Vivienda</InputLabel>
                  <Select
                    labelId="vivienda-label"
                    label="Vivienda"
                    value={form.vivienda}
                    onChange={(e) => setForm({ ...form, vivienda: e.target.value })}
                  >
                    {viviendas.map((v) => (
                      <MenuItem key={v.id_vivienda} value={v.id_vivienda}>
                        {v.denominacion || v.num_oficial || v.id_vivienda} ({v.proyecto_denominacion})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel id="asesor-label">Asesor</InputLabel>
                  <Select
                    labelId="asesor-label"
                    label="Asesor"
                    value={form.asesor}
                    onChange={(e) => setForm({ ...form, asesor: e.target.value })}
                  >
                    {asesores.map((a) => (
                      <MenuItem key={a.id_asesor} value={a.id_asesor}>
                        {a.nombre}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="ID de contrato (Tesorería)"
                  value={form.idContrato}
                  onChange={(e) => setForm({ ...form, idContrato: e.target.value })}
                  helperText="Formato sociedad-contraparte-consecutivo, generado en Tesorería"
                  fullWidth
                />
              </>
            )}
            <FormControl size="small" fullWidth>
              <InputLabel id="estado-label">Estado</InputLabel>
              <Select
                labelId="estado-label"
                label="Estado"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as ViviendaExpedienteEstado })}
              >
                {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
    </>
  );
}
