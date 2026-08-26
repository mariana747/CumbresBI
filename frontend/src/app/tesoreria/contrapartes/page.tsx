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
import { Pencil, Plus, Search, Shield, Trash2, Users, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  TesoreriaContraparte,
  TesoreriaContraparteRelacion,
  TesoreriaTipoPersona,
  TesoreriaTipoRelacion,
  createContraparte,
  createContraparteRelacion,
  deleteContraparte,
  deleteContraparteRelacion,
  generarIdCorto,
  listContraparteRelaciones,
  listContrapartes,
  updateContraparte,
} from "@/lib/tesoreria";

const TIPO_RELACION_LABELS: Record<TesoreriaTipoRelacion, string> = {
  "REP LEGAL": "Representante legal",
  "BENEF CONTROLADOR": "Beneficiario controlador",
};

const TIPO_PERSONA_LABELS: Record<TesoreriaTipoPersona, string> = {
  fisica: "Física",
  moral: "Moral",
  fisica_act_emp: "Física con actividad empresarial",
  fideicomiso: "Fideicomiso",
};

const FORM_VACIO = {
  razonSocial: "",
  rfc: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  // "" cabe aqui (union con TesoreriaTipoPersona) porque una contraparte
  // pudo haberse dado de alta minima desde otro modulo (ej. PLD, ver
  // docs/architecture, "contraparte maestra unica") sin este campo todavia.
  tipoPersona: "moral" as TesoreriaTipoPersona | "",
  genero: "" as "MUJER" | "HOMBRE" | "",
  email: "",
  contacto: "",
  telefonoSms: "",
  cliente: false,
  proveedor: false,
  comentarios: "",
};

// Catalogo maestro de contrapartes (arranque formal de Fase 4, 18/Ago/2026)
// - primera pantalla real de tesoreria-service. Sin ScopedManager a
// proposito (catalogo compartido entre sociedades, ver
// tesoreria/serializers.py) - el filtro real es por permiso
// (tesoreria.crear/.editar), mismo criterio que /admin/organizacion.
export default function TesoreriaContrapartesPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [contrapartes, setContrapartes] = useState<TesoreriaContraparte[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaContraparte | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // ID mostrado en el dialogo de alta - generado al abrirlo, ver abrirAlta().
  const [idNuevo, setIdNuevo] = useState("");

  // Relaciones (rep. legal / benef. controlador, dato pedido por PLD/AML) -
  // dialogo por contraparte, ver TesoreriaContraparteRelacionViewSet
  // (filtro ?contraparte=<id>).
  const [relacionesContraparte, setRelacionesContraparte] = useState<TesoreriaContraparte | null>(null);
  const [relaciones, setRelaciones] = useState<TesoreriaContraparteRelacion[]>([]);
  const [loadingRelaciones, setLoadingRelaciones] = useState(false);
  const [relacionFormOpen, setRelacionFormOpen] = useState(false);
  const [relacionForm, setRelacionForm] = useState({ contraparteRelacion: "", tipoRelacion: "REP LEGAL" as TesoreriaTipoRelacion });
  const [savingRelacion, setSavingRelacion] = useState(false);
  const [relacionFormError, setRelacionFormError] = useState<string | null>(null);
  // ID mostrado en el formulario inline de alta - generado al abrirlo.
  const [idRelacionNueva, setIdRelacionNueva] = useState("");

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  function refresh() {
    setLoading(true);
    listContrapartes(search || undefined)
      .then(setContrapartes)
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
    setIdNuevo(generarIdCorto());
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(c: TesoreriaContraparte) {
    setEditing(c);
    setForm({
      razonSocial: c.razon_social,
      rfc: c.rfc || "",
      apellidoPaterno: c.apellido_paterno || "",
      apellidoMaterno: c.apellido_materno || "",
      tipoPersona: c.tipo_persona || "",
      genero: c.genero || "",
      email: c.email || "",
      contacto: c.contacto || "",
      telefonoSms: c.telefono_sms || "",
      cliente: c.cliente,
      proveedor: c.proveedor,
      comentarios: c.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!form.razonSocial.trim()) {
      setFormError("La razón social es requerida.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const params = {
        razonSocial: form.razonSocial,
        rfc: form.rfc || null,
        apellidoPaterno: form.apellidoPaterno || null,
        apellidoMaterno: form.apellidoMaterno || null,
        tipoPersona: form.tipoPersona || null,
        genero: form.genero || null,
        email: form.email || null,
        contacto: form.contacto || null,
        telefonoSms: form.telefonoSms || null,
        cliente: form.cliente,
        proveedor: form.proveedor,
        comentarios: form.comentarios || null,
      };
      if (editing) {
        await updateContraparte(editing.id_contraparte, params);
      } else {
        await createContraparte({ ...params, idContraparte: idNuevo });
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrar(c: TesoreriaContraparte) {
    if (!window.confirm(`¿Borrar la contraparte ${c.razon_social}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteContraparte(c.id_contraparte);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function abrirRelaciones(c: TesoreriaContraparte) {
    setRelacionesContraparte(c);
    setRelacionForm({ contraparteRelacion: "", tipoRelacion: "REP LEGAL" });
    setRelacionFormError(null);
    setRelacionFormOpen(false);
    refreshRelaciones(c.id_contraparte);
  }

  function refreshRelaciones(idContraparte: string) {
    setLoadingRelaciones(true);
    listContraparteRelaciones(idContraparte)
      .then(setRelaciones)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingRelaciones(false));
  }

  async function handleGuardarRelacion() {
    if (!relacionesContraparte) return;
    if (!relacionForm.contraparteRelacion) {
      setRelacionFormError("Selecciona la persona relacionada.");
      return;
    }
    setSavingRelacion(true);
    setRelacionFormError(null);
    try {
      await createContraparteRelacion({
        idRelacion: idRelacionNueva,
        contraparte: relacionesContraparte.id_contraparte,
        contraparteRelacion: relacionForm.contraparteRelacion,
        tipoRelacion: relacionForm.tipoRelacion,
      });
      setRelacionFormOpen(false);
      refreshRelaciones(relacionesContraparte.id_contraparte);
    } catch (err) {
      setRelacionFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingRelacion(false);
    }
  }

  async function handleBorrarRelacion(r: TesoreriaContraparteRelacion) {
    if (!relacionesContraparte) return;
    if (!window.confirm("¿Borrar esta relación? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      await deleteContraparteRelacion(r.id_relacion);
      refreshRelaciones(relacionesContraparte.id_contraparte);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Users size={22} strokeWidth={1.5} />
        <Typography variant="h5">Contrapartes</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Catálogo maestro de contrapartes (clientes/proveedores) — compartido entre sociedades, base para
        generar contratos de Tesorería.
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
            placeholder="Buscar por razón social, RFC o contacto..."
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
              Nueva contraparte
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Razón social</TableCell>
                <TableCell>RFC</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Contacto</TableCell>
                <TableCell>Cliente / Proveedor</TableCell>
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
              ) : contrapartes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin contrapartes registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                contrapartes.map((c) => (
                  <TableRow key={c.id_contraparte} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.id_contraparte}</TableCell>
                    <TableCell>{c.razon_social}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.rfc || "—"}</TableCell>
                    <TableCell>{c.tipo_persona ? TIPO_PERSONA_LABELS[c.tipo_persona] ?? c.tipo_persona : "—"}</TableCell>
                    <TableCell>{c.contacto || c.email || "—"}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        {c.cliente && <Chip size="small" label="Cliente" color="success" variant="outlined" />}
                        {c.proveedor && <Chip size="small" label="Proveedor" color="info" variant="outlined" />}
                        {!c.cliente && !c.proveedor && "—"}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Relaciones (PLD)" onClick={() => abrirRelaciones(c)}>
                        <Shield size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(c)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrar(c)} disabled={!puedeEditar}>
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
          {editing ? `Editar ${editing.razon_social}` : "Nueva contraparte"}
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
            {/* Campos de solo lectura - generados por el sistema, se
            muestran siempre (incluso al crear) para que se vea que existen
            aunque todavia no tengan valor. */}
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="ID contraparte"
                value={editing ? editing.id_contraparte : idNuevo}
                disabled
                fullWidth
              />
              {editing && (
                <TextField size="small" label="Creado por" value={editing.created_by || "—"} disabled fullWidth />
              )}
            </Stack>
            {editing && (
              <Stack direction="row" spacing={2}>
                <TextField
                  size="small"
                  label="Creado el"
                  value={new Date(editing.created_at).toLocaleString("es-MX")}
                  disabled
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Última actualización"
                  value={new Date(editing.updated_at).toLocaleString("es-MX")}
                  disabled
                  fullWidth
                />
              </Stack>
            )}
            <TextField
              size="small"
              label="Razón social"
              value={form.razonSocial}
              onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="RFC"
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Apellido paterno"
                value={form.apellidoPaterno}
                onChange={(e) => setForm({ ...form, apellidoPaterno: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Apellido materno"
                value={form.apellidoMaterno}
                onChange={(e) => setForm({ ...form, apellidoMaterno: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-persona-label">Tipo de persona</InputLabel>
                <Select
                  labelId="tipo-persona-label"
                  label="Tipo de persona"
                  value={form.tipoPersona}
                  onChange={(e) => setForm({ ...form, tipoPersona: e.target.value as TesoreriaTipoPersona | "" })}
                >
                  {Object.entries(TIPO_PERSONA_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="genero-label">Género</InputLabel>
                <Select
                  labelId="genero-label"
                  label="Género"
                  value={form.genero}
                  onChange={(e) => setForm({ ...form, genero: e.target.value as "MUJER" | "HOMBRE" | "" })}
                >
                  <MenuItem value="MUJER">Mujer</MenuItem>
                  <MenuItem value="HOMBRE">Hombre</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <TextField
              size="small"
              label="Correo"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Contacto"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Teléfono / SMS"
              value={form.telefonoSms}
              onChange={(e) => setForm({ ...form, telefonoSms: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.cliente}
                    onChange={(e) => setForm({ ...form, cliente: e.target.checked })}
                  />
                }
                label="Cliente"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.proveedor}
                    onChange={(e) => setForm({ ...form, proveedor: e.target.checked })}
                  />
                }
                label="Proveedor"
              />
            </Stack>
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

      {/* Relaciones (rep. legal / benef. controlador) de una contraparte */}
      <Dialog open={!!relacionesContraparte} onClose={() => setRelacionesContraparte(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Relaciones — {relacionesContraparte?.razon_social}
          <IconButton onClick={() => setRelacionesContraparte(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Representante legal / beneficiario controlador — dato requerido por PLD/AML.
          </Typography>
          {puedeCrear && !relacionFormOpen && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={() => {
                setIdRelacionNueva(generarIdCorto());
                setRelacionFormOpen(true);
              }}
              sx={{ mb: 2 }}
            >
              Nueva relación
            </Button>
          )}
          {relacionFormOpen && (
            <Stack spacing={2} sx={{ mb: 2, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              {relacionFormError && <Alert severity="error">{relacionFormError}</Alert>}
              <TextField size="small" label="ID" value={idRelacionNueva} disabled fullWidth />
              <FormControl size="small" fullWidth>
                <InputLabel id="relacion-contraparte-label">Persona relacionada</InputLabel>
                <Select
                  labelId="relacion-contraparte-label"
                  label="Persona relacionada"
                  value={relacionForm.contraparteRelacion}
                  onChange={(e) => setRelacionForm({ ...relacionForm, contraparteRelacion: e.target.value })}
                >
                  {contrapartes
                    .filter((c) => c.id_contraparte !== relacionesContraparte?.id_contraparte)
                    .map((c) => (
                      <MenuItem key={c.id_contraparte} value={c.id_contraparte}>
                        {c.razon_social}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="relacion-tipo-label">Tipo de relación</InputLabel>
                <Select
                  labelId="relacion-tipo-label"
                  label="Tipo de relación"
                  value={relacionForm.tipoRelacion}
                  onChange={(e) => setRelacionForm({ ...relacionForm, tipoRelacion: e.target.value as TesoreriaTipoRelacion })}
                >
                  {Object.entries(TIPO_RELACION_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" onClick={() => setRelacionFormOpen(false)}>
                  Cancelar
                </Button>
                <Button size="small" variant="contained" onClick={handleGuardarRelacion} disabled={savingRelacion}>
                  {savingRelacion ? <CircularProgress size={16} /> : "Guardar"}
                </Button>
              </Stack>
            </Stack>
          )}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Persona</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingRelaciones ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : relaciones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        Sin relaciones registradas.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  relaciones.map((r) => (
                    <TableRow key={r.id_relacion} hover>
                      <TableCell>{r.contraparte_relacion_nombre}</TableCell>
                      <TableCell>{TIPO_RELACION_LABELS[r.tipo_relacion] ?? r.tipo_relacion}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrarRelacion(r)} disabled={!puedeEditar}>
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRelacionesContraparte(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
