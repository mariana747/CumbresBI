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
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Building2, Pencil, Plus, Trash2, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { TicketsCentro, createCentro, deleteCentro, listCentros, updateCentro } from "@/lib/tickets";

const CENTRO_VACIO = { id: "", denominacion: "", descripcion: "", comentarios: "" };

// Pantalla dedicada a Centros (24/Sep/2026, pedido explicito) - catalogo
// raiz de la jerarquia de Tickets, sin FK propia. Antes solo se
// gestionaba desde un dialogo dentro de /tickets; esta pantalla es el
// CRUD completo aparte.
export default function TicketsCentrosPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [centros, setCentros] = useState<TicketsCentro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(CENTRO_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const puedeCrear = session?.perm_keys.includes("tickets.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tickets.editar") ?? false;

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  function refresh() {
    setLoading(true);
    listCentros(search || undefined)
      .then((res) => setCentros(res.results))
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function abrirNuevo() {
    setForm(CENTRO_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEditar(c: TicketsCentro) {
    setForm({
      id: c.id_tickets_centro,
      denominacion: c.denominacion,
      descripcion: c.descripcion || "",
      comentarios: c.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function guardar() {
    if (!form.denominacion) {
      setFormError("La denominación es obligatoria.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (form.id) {
        await updateCentro(form.id, {
          denominacion: form.denominacion,
          descripcion: form.descripcion || undefined,
          comentarios: form.comentarios || undefined,
        });
      } else {
        await createCentro({
          denominacion: form.denominacion,
          descripcion: form.descripcion || undefined,
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

  async function borrar(c: TicketsCentro) {
    if (!window.confirm(`¿Borrar el centro "${c.denominacion}"? Esto falla si ya tiene proyectos.`)) return;
    try {
      await deleteCentro(c.id_tickets_centro);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Building2 size={22} strokeWidth={1.5} />
        <Typography variant="h5">Centros</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Catálogo raíz de Tickets — nivel más alto de la jerarquía (Centro → Proyecto → Subproyecto → Ticket).
      </Typography>

      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por denominación..."
        actions={
          puedeCrear ? (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirNuevo}
              sx={{ flexShrink: 0 }}
            >
              Nuevo Centro
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={24} />
        </Stack>
      ) : centros.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Sin centros registrados todavía.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Denominación</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Comentarios</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {centros.map((c) => (
                <TableRow key={c.id_tickets_centro} hover>
                  <TableCell>{c.denominacion}</TableCell>
                  <TableCell>{c.descripcion || "—"}</TableCell>
                  <TableCell>{c.comentarios || "—"}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Editar">
                        <span>
                          <IconButton size="small" aria-label="Editar" onClick={() => abrirEditar(c)} disabled={!puedeEditar}>
                            <Pencil size={13} strokeWidth={1.5} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Borrar">
                        <span>
                          <IconButton size="small" aria-label="Borrar" onClick={() => borrar(c)} disabled={!puedeEditar}>
                            <Trash2 size={13} strokeWidth={1.5} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={dialogOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setDialogOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {form.id ? "Editar Centro" : "Nuevo Centro"}
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
              autoFocus
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
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardar} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
