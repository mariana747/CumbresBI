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
import { Ticket, TicketEstado, TicketPrioridad, createTicket, updateTicket } from "@/lib/tickets";

const PRIORIDADES: TicketPrioridad[] = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
const ESTADOS: TicketEstado[] = ["PENDIENTE", "EN CURSO", "EN REVISION", "COMPLETADO", "CANCELADO"];

const VACIO = {
  denominacion: "",
  descripcion: "",
  categoria: "",
  prioridad: "MEDIA" as TicketPrioridad,
  estado: "PENDIENTE" as TicketEstado,
  asignadoA: "",
  fechaInicioProg: "",
  fechaFinProg: "",
  fechaInicioReal: "",
  fechaFinReal: "",
  estimacionHoras: "",
  carpeta: "",
  instruccionesEntrega: "",
  comentarios: "",
};

// Alta/edicion de Ticket (24/Sep/2026) - la tarea individual, ultimo
// nivel real de la jerarquia antes de Dependencias/Log. `estado` es
// extension sobre el ERD (ver models.py del backend, decision 24/Sep).
export default function TicketFormDialog({
  open,
  onClose,
  idSubproyecto,
  ticket,
  usuarios,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  idSubproyecto: string;
  ticket: Ticket | null;
  usuarios: IamUser[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState(VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (ticket) {
      setForm({
        denominacion: ticket.denominacion,
        descripcion: ticket.descripcion || "",
        categoria: ticket.categoria || "",
        prioridad: ticket.prioridad,
        estado: ticket.estado,
        asignadoA: ticket.asignado_a || "",
        fechaInicioProg: ticket.fecha_inicio_prog || "",
        fechaFinProg: ticket.fecha_fin_prog || "",
        fechaInicioReal: ticket.fecha_inicio_real || "",
        fechaFinReal: ticket.fecha_fin_real || "",
        estimacionHoras: ticket.estimacion_horas || "",
        carpeta: ticket.carpeta || "",
        instruccionesEntrega: ticket.instrucciones_entrega || "",
        comentarios: ticket.comentarios || "",
      });
    } else {
      setForm(VACIO);
    }
  }, [open, ticket]);

  async function guardar() {
    if (!form.denominacion) {
      setError("La denominación es obligatoria.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (ticket) {
        await updateTicket(ticket.id_ticket, {
          denominacion: form.denominacion,
          descripcion: form.descripcion || undefined,
          categoria: form.categoria || undefined,
          prioridad: form.prioridad,
          estado: form.estado,
          asignadoA: form.asignadoA || undefined,
          fechaInicioProg: form.fechaInicioProg || undefined,
          fechaFinProg: form.fechaFinProg || undefined,
          fechaInicioReal: form.fechaInicioReal || undefined,
          fechaFinReal: form.fechaFinReal || undefined,
          estimacionHoras: form.estimacionHoras || undefined,
          carpeta: form.carpeta || undefined,
          instruccionesEntrega: form.instruccionesEntrega || undefined,
          comentarios: form.comentarios || undefined,
        });
      } else {
        await createTicket({
          denominacion: form.denominacion,
          descripcion: form.descripcion || undefined,
          idSubproyecto,
          categoria: form.categoria || undefined,
          prioridad: form.prioridad,
          estado: form.estado,
          asignadoA: form.asignadoA || undefined,
          fechaInicioProg: form.fechaInicioProg || undefined,
          fechaFinProg: form.fechaFinProg || undefined,
          estimacionHoras: form.estimacionHoras || undefined,
          carpeta: form.carpeta || undefined,
          instruccionesEntrega: form.instruccionesEntrega || undefined,
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
        {ticket ? "Editar Ticket" : "Nuevo Ticket"}
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
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              size="small"
              label="Categoría"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="ticket-prioridad-label">Prioridad</InputLabel>
              <Select
                labelId="ticket-prioridad-label"
                label="Prioridad"
                value={form.prioridad}
                onChange={(e) => setForm({ ...form, prioridad: e.target.value as TicketPrioridad })}
              >
                {PRIORIDADES.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="ticket-estado-label">Estado</InputLabel>
              <Select
                labelId="ticket-estado-label"
                label="Estado"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as TicketEstado })}
              >
                {ESTADOS.map((e) => (
                  <MenuItem key={e} value={e}>
                    {e}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <Autocomplete
            size="small"
            fullWidth
            openOnFocus
            options={usuarios}
            value={usuarios.find((u) => u.user_id === form.asignadoA) || null}
            onChange={(_, value) => setForm({ ...form, asignadoA: value?.user_id || "" })}
            getOptionLabel={(u) => u.display_name || u.primary_email}
            isOptionEqualToValue={(o, v) => o.user_id === v.user_id}
            renderInput={(params) => <TextField {...params} label="Asignado a" />}
          />
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
              label="Fecha inicio (prog.)"
              value={form.fechaInicioProg}
              onChange={(e) => setForm({ ...form, fechaInicioProg: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              size="small"
              type="date"
              label="Fecha fin (prog.)"
              value={form.fechaFinProg}
              onChange={(e) => setForm({ ...form, fechaFinProg: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
          {ticket && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                type="date"
                label="Fecha inicio (real)"
                value={form.fechaInicioReal}
                onChange={(e) => setForm({ ...form, fechaInicioReal: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Fecha fin (real)"
                value={form.fechaFinReal}
                onChange={(e) => setForm({ ...form, fechaFinReal: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
          )}
          <TextField
            size="small"
            type="number"
            label="Estimación (horas)"
            value={form.estimacionHoras}
            onChange={(e) => setForm({ ...form, estimacionHoras: e.target.value })}
            fullWidth
          />
          <TextField
            size="small"
            label="Carpeta (Drive)"
            value={form.carpeta}
            onChange={(e) => setForm({ ...form, carpeta: e.target.value })}
            fullWidth
          />
          <TextField
            size="small"
            label="Instrucciones de entrega"
            value={form.instruccionesEntrega}
            onChange={(e) => setForm({ ...form, instruccionesEntrega: e.target.value })}
            fullWidth
            multiline
            minRows={2}
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
