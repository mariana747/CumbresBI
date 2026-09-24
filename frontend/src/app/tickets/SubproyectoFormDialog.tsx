"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { X as CloseIcon } from "lucide-react";
import { IamUser } from "@/lib/iam";
import {
  TicketsProyectoEstado,
  TicketsSubproyecto,
  createSubproyecto,
  updateSubproyecto,
} from "@/lib/tickets";

const ESTADOS: TicketsProyectoEstado[] = ["PLANEADO", "EN CURSO", "COMPLETADO", "CANCELADO"];

const VACIO = {
  denominacion: "",
  descripcion: "",
  sociedad: "",
  responsable: "",
  estado: "PLANEADO" as TicketsProyectoEstado,
  vencimiento: "",
  fechaInicio: "",
  fechaFin: "",
  progreso: "",
  comentarios: "",
};

// Alta/edicion de Subproyecto (24/Sep/2026) - primer nivel de la
// jerarquia con columna `sociedad` propia (alcance real, ver
// TicketsSubproyecto.SCOPE_FIELD_SOCIEDAD en tickets-service/models.py).
export default function SubproyectoFormDialog({
  open,
  onClose,
  idProyecto,
  subproyecto,
  usuarios,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  idProyecto: string;
  subproyecto: TicketsSubproyecto | null;
  usuarios: IamUser[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState(VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (subproyecto) {
      setForm({
        denominacion: subproyecto.denominacion,
        descripcion: subproyecto.descripcion || "",
        sociedad: subproyecto.sociedad,
        responsable: subproyecto.responsable,
        estado: subproyecto.estado,
        vencimiento: subproyecto.vencimiento || "",
        fechaInicio: subproyecto.fecha_inicio || "",
        fechaFin: subproyecto.fecha_fin || "",
        progreso: subproyecto.progreso || "",
        comentarios: subproyecto.comentarios || "",
      });
    } else {
      setForm(VACIO);
    }
  }, [open, subproyecto]);

  async function guardar() {
    if (!form.denominacion || !form.sociedad || !form.responsable) {
      setError("Denominación, sociedad y responsable son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (subproyecto) {
        await updateSubproyecto(subproyecto.id_subproyecto, {
          denominacion: form.denominacion,
          descripcion: form.descripcion || undefined,
          sociedad: form.sociedad,
          responsable: form.responsable,
          estado: form.estado,
          vencimiento: form.vencimiento || undefined,
          fechaInicio: form.fechaInicio || undefined,
          fechaFin: form.fechaFin || undefined,
          progreso: form.progreso || undefined,
          comentarios: form.comentarios || undefined,
        });
      } else {
        await createSubproyecto({
          denominacion: form.denominacion,
          descripcion: form.descripcion || undefined,
          idProyecto,
          sociedad: form.sociedad,
          responsable: form.responsable,
          estado: form.estado,
          vencimiento: form.vencimiento || undefined,
          fechaInicio: form.fechaInicio || undefined,
          fechaFin: form.fechaFin || undefined,
          progreso: form.progreso || undefined,
          comentarios: form.comentarios || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
        onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {subproyecto ? "Editar Subproyecto" : "Nuevo Subproyecto"}
        <IconButton onClick={onClose} size="small" aria-label="Cerrar">
          <CloseIcon size={18} strokeWidth={1.5} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack spacing={2}>
          <TextField
            size="small"
            label="Denominación"
            value={form.denominacion}
            onChange={(e) => setForm({ ...form, denominacion: e.target.value })}
            fullWidth
            autoFocus
          />
          <TextField
            size="small"
            label="Sociedad (RFC)"
            value={form.sociedad}
            onChange={(e) => setForm({ ...form, sociedad: e.target.value.toUpperCase() })}
            fullWidth
            helperText="RFC de la sociedad — define el alcance real de este Subproyecto."
          />
          <Autocomplete
            size="small"
            fullWidth
            openOnFocus
            options={usuarios}
            value={usuarios.find((u) => u.user_id === form.responsable) || null}
            onChange={(_, value) => setForm({ ...form, responsable: value?.user_id || "" })}
            getOptionLabel={(u) => u.display_name || u.primary_email}
            isOptionEqualToValue={(o, v) => o.user_id === v.user_id}
            renderInput={(params) => <TextField {...params} label="Responsable" />}
          />
          <FormControl size="small" fullWidth>
            <InputLabel id="subproyecto-estado-label">Estado</InputLabel>
            <Select
              labelId="subproyecto-estado-label"
              label="Estado"
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value as TicketsProyectoEstado })}
            >
              {ESTADOS.map((e) => (
                <MenuItem key={e} value={e}>
                  {e}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Descripción"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            fullWidth
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              size="small"
              type="date"
              label="Fecha inicio"
              value={form.fechaInicio}
              onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              size="small"
              type="date"
              label="Fecha fin"
              value={form.fechaFin}
              onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              size="small"
              type="date"
              label="Vencimiento"
              value={form.vencimiento}
              onChange={(e) => setForm({ ...form, vencimiento: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
          <TextField
            size="small"
            type="number"
            label="Progreso (%)"
            value={form.progreso}
            onChange={(e) => setForm({ ...form, progreso: e.target.value })}
            fullWidth
          />
          <TextField
            size="small"
            label="Comentarios"
            value={form.comentarios}
            onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={guardar} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
