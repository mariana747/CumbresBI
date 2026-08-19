"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
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
import { Pencil, Plus, Search, Trash2, X as CloseIcon } from "lucide-react";
import {
  ViviendaProyecto,
  createProyecto,
  deleteProyecto,
  listProyectos,
  updateProyecto,
} from "@/lib/vivienda";

const FORM_VACIO = {
  denominacion: "",
  aliasProyecto: "",
  propietario: "",
  domCalle: "",
  domNumeroExt: "",
  domNumeroInt: "",
  domColonia: "",
  domMunicipioAlcaldia: "",
  domEstado: "",
  domCp: "",
  domPais: "Mexico",
  comentarios: "",
};

export default function ProyectosTab({
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaProyecto | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listProyectos(search || undefined)
      .then(setProyectos)
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

  function abrirEdicion(p: ViviendaProyecto) {
    setEditing(p);
    setForm({
      denominacion: p.denominacion || "",
      aliasProyecto: p.alias_proyecto || "",
      propietario: p.propietario || "",
      domCalle: p.dom_calle,
      domNumeroExt: p.dom_numero_ext,
      domNumeroInt: p.dom_numero_int,
      domColonia: p.dom_colonia,
      domMunicipioAlcaldia: p.dom_municipio_alcaldia,
      domEstado: p.dom_estado,
      domCp: p.dom_cp,
      domPais: p.dom_pais,
      comentarios: p.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!form.denominacion.trim()) {
      setFormError("La denominación es requerida.");
      return;
    }
    if (!form.domCalle.trim() || !form.domNumeroExt.trim() || !form.domNumeroInt.trim()) {
      setFormError("Calle, número exterior y número interior son requeridos (usa \"S/N\" si no aplica).");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const params = {
        denominacion: form.denominacion,
        aliasProyecto: form.aliasProyecto || null,
        propietario: form.propietario || null,
        domCalle: form.domCalle,
        domNumeroExt: form.domNumeroExt,
        domNumeroInt: form.domNumeroInt,
        domColonia: form.domColonia,
        domMunicipioAlcaldia: form.domMunicipioAlcaldia,
        domEstado: form.domEstado,
        domCp: form.domCp,
        domPais: form.domPais,
        comentarios: form.comentarios || null,
      };
      if (editing) {
        await updateProyecto(editing.id_proyecto, params, actorId);
      } else {
        await createProyecto({ ...params, actorId });
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrar(p: ViviendaProyecto) {
    if (!window.confirm(`¿Borrar el proyecto ${p.denominacion}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteProyecto(p.id_proyecto);
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
          <TextField
            size="small"
            placeholder="Buscar por denominación o alias..."
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
              Nuevo proyecto
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Denominación</TableCell>
                <TableCell>Alias</TableCell>
                <TableCell>Municipio / Estado</TableCell>
                <TableCell>Propietario</TableCell>
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
              ) : proyectos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin proyectos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                proyectos.map((p) => (
                  <TableRow key={p.id_proyecto} hover>
                    <TableCell>{p.denominacion || "—"}</TableCell>
                    <TableCell>{p.alias_proyecto || "—"}</TableCell>
                    <TableCell>
                      {p.dom_municipio_alcaldia}, {p.dom_estado}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {p.propietario || "—"}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(p)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrar(p)} disabled={!puedeEditar}>
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
          {editing ? `Editar ${editing.denominacion}` : "Nuevo proyecto"}
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
              label="Denominación"
              value={form.denominacion}
              onChange={(e) => setForm({ ...form, denominacion: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Alias (máx. 5 caracteres)"
              value={form.aliasProyecto}
              onChange={(e) => setForm({ ...form, aliasProyecto: e.target.value.slice(0, 5) })}
              fullWidth
            />
            <TextField
              size="small"
              label="Propietario (RFC de la sociedad)"
              value={form.propietario}
              onChange={(e) => setForm({ ...form, propietario: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Calle"
                value={form.domCalle}
                onChange={(e) => setForm({ ...form, domCalle: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="No. ext."
                value={form.domNumeroExt}
                onChange={(e) => setForm({ ...form, domNumeroExt: e.target.value })}
                sx={{ maxWidth: 120 }}
              />
              <TextField
                size="small"
                label="No. int."
                value={form.domNumeroInt}
                onChange={(e) => setForm({ ...form, domNumeroInt: e.target.value })}
                sx={{ maxWidth: 120 }}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Colonia"
                value={form.domColonia}
                onChange={(e) => setForm({ ...form, domColonia: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="CP"
                value={form.domCp}
                onChange={(e) => setForm({ ...form, domCp: e.target.value })}
                sx={{ maxWidth: 120 }}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Municipio / Alcaldía"
                value={form.domMunicipioAlcaldia}
                onChange={(e) => setForm({ ...form, domMunicipioAlcaldia: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Estado"
                value={form.domEstado}
                onChange={(e) => setForm({ ...form, domEstado: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="País"
              value={form.domPais}
              onChange={(e) => setForm({ ...form, domPais: e.target.value })}
              fullWidth
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
