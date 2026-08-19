"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
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
import { Pencil, Plus, Search, Trash2, X as CloseIcon } from "lucide-react";
import {
  ViviendaProyecto,
  ViviendaUnidad,
  createVivienda,
  deleteVivienda,
  listProyectos,
  listViviendas,
  updateVivienda,
} from "@/lib/vivienda";

const FORM_VACIO = {
  proyecto: "",
  denominacion: "",
  numOficial: "",
  etapa: "",
  tipo: "",
  modelo: "",
  habitaciones: "",
  supTerrenoM2: "",
  supConstM2: "",
  precioLista: "",
  disponible: true,
  comentarios: "",
};

export default function ViviendasTab({
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [viviendas, setViviendas] = useState<ViviendaUnidad[]>([]);
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaUnidad | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    listProyectos().then(setProyectos).catch(() => undefined);
  }, []);

  function refresh() {
    setLoading(true);
    listViviendas({ proyecto: filtroProyecto || undefined, search: search || undefined })
      .then(setViviendas)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroProyecto]);

  function abrirAlta() {
    setEditing(null);
    setForm({ ...FORM_VACIO, proyecto: filtroProyecto });
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(v: ViviendaUnidad) {
    setEditing(v);
    setForm({
      proyecto: v.proyecto,
      denominacion: v.denominacion || "",
      numOficial: v.num_oficial || "",
      etapa: v.etapa || "",
      tipo: v.tipo || "",
      modelo: v.modelo || "",
      habitaciones: v.habitaciones?.toString() || "",
      supTerrenoM2: v.sup_terreno_m2 || "",
      supConstM2: v.sup_const_m2 || "",
      precioLista: v.precio_lista || "",
      disponible: v.disponible ?? true,
      comentarios: v.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && !form.proyecto) {
      setFormError("Selecciona un proyecto.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const comunes = {
        denominacion: form.denominacion || null,
        numOficial: form.numOficial || null,
        etapa: form.etapa || null,
        tipo: form.tipo || null,
        modelo: form.modelo || null,
        habitaciones: form.habitaciones ? Number(form.habitaciones) : null,
        supTerrenoM2: form.supTerrenoM2 || null,
        supConstM2: form.supConstM2 || null,
        precioLista: form.precioLista || null,
        disponible: form.disponible,
        comentarios: form.comentarios || null,
      };
      if (editing) {
        await updateVivienda(editing.id_vivienda, comunes, actorId);
      } else {
        await createVivienda({ ...comunes, proyecto: form.proyecto, actorId });
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrar(v: ViviendaUnidad) {
    if (!window.confirm(`¿Borrar la unidad ${v.denominacion || v.id_vivienda}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteVivienda(v.id_vivienda);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
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
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="filtro-proyecto-label">Proyecto</InputLabel>
            <Select
              labelId="filtro-proyecto-label"
              label="Proyecto"
              value={filtroProyecto}
              onChange={(e) => setFiltroProyecto(e.target.value)}
            >
              <MenuItem value="">Todos los proyectos</MenuItem>
              {proyectos.map((p) => (
                <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                  {p.denominacion || p.id_proyecto}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            placeholder="Buscar por número, denominación, modelo o torre..."
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
              Nueva unidad
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Denominación</TableCell>
                <TableCell>Proyecto</TableCell>
                <TableCell>Modelo</TableCell>
                <TableCell>Precio de lista</TableCell>
                <TableCell>Disponible</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : viviendas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin unidades registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                viviendas.map((v) => (
                  <TableRow key={v.id_vivienda} hover>
                    <TableCell>{v.denominacion || v.num_oficial || "—"}</TableCell>
                    <TableCell>{v.proyecto_denominacion || "—"}</TableCell>
                    <TableCell>{v.modelo || "—"}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {v.precio_lista ? `$${v.precio_lista}` : "—"}
                    </TableCell>
                    <TableCell>{v.disponible ? "Sí" : "No"}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(v)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrar(v)} disabled={!puedeEditar}>
                        <Trash2 size={14} strokeWidth={1.5} />
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
          {editing ? `Editar ${editing.denominacion || editing.id_vivienda}` : "Nueva unidad"}
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
              <FormControl size="small" fullWidth>
                <InputLabel id="proyecto-label">Proyecto</InputLabel>
                <Select
                  labelId="proyecto-label"
                  label="Proyecto"
                  value={form.proyecto}
                  onChange={(e) => setForm({ ...form, proyecto: e.target.value })}
                >
                  {proyectos.map((p) => (
                    <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                      {p.denominacion || p.id_proyecto}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              size="small"
              label="Denominación"
              value={form.denominacion}
              onChange={(e) => setForm({ ...form, denominacion: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="No. oficial"
                value={form.numOficial}
                onChange={(e) => setForm({ ...form, numOficial: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Etapa"
                value={form.etapa}
                onChange={(e) => setForm({ ...form, etapa: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Modelo"
                value={form.modelo}
                onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Habitaciones"
                type="number"
                value={form.habitaciones}
                onChange={(e) => setForm({ ...form, habitaciones: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Sup. terreno (m²)"
                value={form.supTerrenoM2}
                onChange={(e) => setForm({ ...form, supTerrenoM2: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Sup. construida (m²)"
                value={form.supConstM2}
                onChange={(e) => setForm({ ...form, supConstM2: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Precio de lista"
              value={form.precioLista}
              onChange={(e) => setForm({ ...form, precioLista: e.target.value })}
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.disponible}
                  onChange={(e) => setForm({ ...form, disponible: e.target.checked })}
                />
              }
              label="Disponible"
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
    </>
  );
}
