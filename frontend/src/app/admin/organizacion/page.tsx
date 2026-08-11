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
import { Building2, MapPin, Milestone, Pencil, Plus, Trash2, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  GeneralSociedad,
  createSociedad,
  deleteSociedad,
  listSociedades,
  updateSociedad,
} from "@/lib/iam";

// Gestion organizacional (onboarding sec. 7.2: "CRUD de empresas
// (Sociedades), centros de trabajo (Centros) y visibilidad de proyectos").
//
// Solo Sociedades tiene CRUD real aqui - es el UNICO catalogo generico
// real del ERD (general_sociedades). Centro y Proyecto NO son catalogos
// genericos: en el esquema real solo existen tickets_centros/
// tickets_proyectos (modulo Tickets, Fase 2+) y vivienda_proyectos
// (modulo Vivienda, Fase 3) - construir un catalogo generico aqui
// inventaria una estructura que no existe en el ERD y probablemente no
// coincidiria con la real cuando esos modulos se construyan (decision de
// sesion, 10/Ago/2026 - ver memoria "pendiente-quitar-grupo-del-codigo"
// y conversacion sobre schema.csv).
export default function OrganizacionPage() {
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GeneralSociedad | null>(null);
  const [form, setForm] = useState({ rfc: "", razonSocial: "", regimenMercantil: "", aliasSociedad: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  // El backend ya bloquea con 403 (require_permission), esto es solo para
  // no mostrar botones que van a fallar - misma matriz que el sidebar
  // (roles-y-permisos.md sec. 3, "iam": create=iam.crear, editar/borrar=iam.editar).
  const puedeCrear = session?.perm_keys.includes("iam.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;

  function refresh() {
    setLoading(true);
    listSociedades()
      .then(setSociedades)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  function abrirAlta() {
    setEditing(null);
    setForm({ rfc: "", razonSocial: "", regimenMercantil: "", aliasSociedad: "" });
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(sociedad: GeneralSociedad) {
    setEditing(sociedad);
    setForm({
      rfc: sociedad.rfc,
      razonSocial: sociedad.razon_social || "",
      regimenMercantil: sociedad.regimen_mercantil || "",
      aliasSociedad: sociedad.alias_sociedad || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateSociedad(editing.rfc, {
          razonSocial: form.razonSocial,
          regimenMercantil: form.regimenMercantil,
          aliasSociedad: form.aliasSociedad,
        });
      } else {
        if (!form.rfc.trim()) {
          setFormError("El RFC es requerido.");
          setSaving(false);
          return;
        }
        await createSociedad({
          rfc: form.rfc.trim(),
          razonSocial: form.razonSocial,
          regimenMercantil: form.regimenMercantil,
          aliasSociedad: form.aliasSociedad,
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

  async function handleBorrar(sociedad: GeneralSociedad) {
    if (!window.confirm(`¿Borrar la sociedad ${sociedad.razon_social || sociedad.rfc}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteSociedad(sociedad.rfc);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Gestión organizacional
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Empresas (Sociedades), centros de trabajo y proyectos — catálogos usados por el alcance de roles.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Sociedades - unico catalogo generico real, CRUD completo */}
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2, pb: 1 }}>
          <Building2 size={18} strokeWidth={1.5} />
          <Typography variant="subtitle1" fontWeight={600}>
            Sociedades
          </Typography>
          {/* Oculto (no solo deshabilitado) para quien no tiene iam.crear
          - decision de producto 11/Ago/2026, mismo criterio que
          Invitaciones/PLD (distinto de Editar/Borrar de la tabla de
          abajo, que se dejan visibles-deshabilitados). */}
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: "auto" }}
            >
              Nueva sociedad
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>RFC</TableCell>
                <TableCell>Razón social</TableCell>
                <TableCell>Alias</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : sociedades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin sociedades registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sociedades.map((s) => (
                  <TableRow key={s.rfc} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{s.rfc}</TableCell>
                    <TableCell>{s.razon_social || "—"}</TableCell>
                    <TableCell>{s.alias_sociedad || "—"}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(s)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrar(s)} disabled={!puedeEditar}>
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

      {/* Centros - no es catalogo generico, pertenece al modulo de Tickets */}
      <Paper variant="outlined" sx={{ mb: 3, opacity: 0.7 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
          <MapPin size={18} strokeWidth={1.5} />
          <Typography variant="subtitle1" fontWeight={600}>
            Centros de trabajo
          </Typography>
          <Chip size="small" color="warning" label="Pendiente de construir" sx={{ ml: "auto" }} />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
          El grant de acceso (<code>IamUserCentroAccess</code>) ya existe y funciona, pero no hay
          catálogo genérico de centros — en el esquema real, "Centro" es una tabla propia del módulo
          de Tickets (<code>tickets_centros</code>), que todavía no se construye. Hoy el ID de centro
          se escribe a mano al otorgar acceso.
        </Typography>
      </Paper>

      {/* Proyectos - no es catalogo generico, pertenece al modulo de Vivienda */}
      <Paper variant="outlined" sx={{ opacity: 0.7 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
          <Milestone size={18} strokeWidth={1.5} />
          <Typography variant="subtitle1" fontWeight={600}>
            Proyectos
          </Typography>
          <Chip size="small" color="warning" label="Pendiente de construir" sx={{ ml: "auto" }} />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
          En el esquema real, "Proyecto" es una tabla propia del módulo de Ventas/Vivienda
          (<code>vivienda_proyectos</code>), Fase 3 — todavía no arranca. Hoy el ID de proyecto se
          escribe a mano al otorgar un rol con alcance PROYECTO.
        </Typography>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar ${editing.razon_social || editing.rfc}` : "Nueva sociedad"}
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
              label="RFC"
              value={form.rfc}
              disabled={!!editing}
              helperText={editing ? "El RFC no se puede cambiar — es el identificador de la sociedad." : undefined}
              onChange={(e) => setForm({ ...form, rfc: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Razón social"
              value={form.razonSocial}
              onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Régimen mercantil"
              value={form.regimenMercantil}
              onChange={(e) => setForm({ ...form, regimenMercantil: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Alias (nombre corto)"
              value={form.aliasSociedad}
              onChange={(e) => setForm({ ...form, aliasSociedad: e.target.value })}
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
