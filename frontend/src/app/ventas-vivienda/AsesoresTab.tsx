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
  FormControlLabel,
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
import { ViviendaAsesor, createAsesor, deleteAsesor, listAsesores, updateAsesor } from "@/lib/vivienda";

const FORM_VACIO = {
  nombre: "",
  email: "",
  telefonoSms: "",
  contacto: "",
  personaMoral: false,
  razonSocial: "",
  // Porcentaje mostrado en pantalla (0-99%); el backend guarda la fraccion
  // 0.00-0.99 (ver lib/vivienda.ts) - se divide/multiplica por 100 al
  // convertir, nunca se manda el numero tal cual escribe el usuario.
  porcComisionPct: "",
  rfcAfiliacion: "",
  comentarios: "",
};

export default function AsesoresTab({
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [asesores, setAsesores] = useState<ViviendaAsesor[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaAsesor | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listAsesores(search || undefined)
      .then(setAsesores)
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

  function abrirEdicion(a: ViviendaAsesor) {
    setEditing(a);
    setForm({
      nombre: a.nombre,
      email: a.email,
      telefonoSms: a.telefono_sms || "",
      contacto: a.contacto || "",
      personaMoral: a.persona_moral,
      razonSocial: a.razon_social || "",
      porcComisionPct: (Number(a.porc_comision) * 100).toString(),
      rfcAfiliacion: a.rfc_afiliacion || "",
      comentarios: a.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim() || !form.email.trim()) {
      setFormError("Nombre y correo son requeridos.");
      return;
    }
    const pct = Number(form.porcComisionPct);
    if (Number.isNaN(pct) || pct < 0 || pct >= 100) {
      setFormError("El % de comisión debe ser un número entre 0 y 99.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const porcComision = (pct / 100).toFixed(2);
      if (editing) {
        await updateAsesor(
          editing.id_asesor,
          {
            nombre: form.nombre,
            email: form.email,
            telefonoSms: form.telefonoSms || null,
            contacto: form.contacto || null,
            porcComision,
            comentarios: form.comentarios || null,
          },
          actorId
        );
      } else {
        await createAsesor({
          nombre: form.nombre,
          email: form.email,
          telefonoSms: form.telefonoSms || null,
          contacto: form.contacto || null,
          personaMoral: form.personaMoral,
          razonSocial: form.razonSocial || null,
          porcComision,
          rfcAfiliacion: form.rfcAfiliacion || null,
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

  async function handleBorrar(a: ViviendaAsesor) {
    if (!window.confirm(`¿Borrar al asesor ${a.nombre}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteAsesor(a.id_asesor);
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
            placeholder="Buscar por nombre, correo o razón social..."
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
              Nuevo asesor
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Correo</TableCell>
                <TableCell>Contacto</TableCell>
                <TableCell>% Comisión</TableCell>
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
              ) : asesores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin asesores registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                asesores.map((a) => (
                  <TableRow key={a.id_asesor} hover>
                    <TableCell>{a.nombre}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>{a.contacto || "—"}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {(Number(a.porc_comision) * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(a)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrar(a)} disabled={!puedeEditar}>
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
          {editing ? `Editar ${editing.nombre}` : "Nuevo asesor"}
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
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Correo"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Teléfono / SMS"
              value={form.telefonoSms}
              onChange={(e) => setForm({ ...form, telefonoSms: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Contacto"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              fullWidth
            />
            {!editing && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.personaMoral}
                    onChange={(e) => setForm({ ...form, personaMoral: e.target.checked })}
                  />
                }
                label="Persona moral"
              />
            )}
            {!editing && form.personaMoral && (
              <TextField
                size="small"
                label="Razón social"
                value={form.razonSocial}
                onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
                fullWidth
              />
            )}
            <TextField
              size="small"
              label="% de comisión"
              type="number"
              value={form.porcComisionPct}
              onChange={(e) => setForm({ ...form, porcComisionPct: e.target.value })}
              helperText="Un número entre 0 y 99"
              fullWidth
            />
            {!editing && (
              <TextField
                size="small"
                label="RFC de afiliación"
                value={form.rfcAfiliacion}
                onChange={(e) => setForm({ ...form, rfcAfiliacion: e.target.value })}
                fullWidth
              />
            )}
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
