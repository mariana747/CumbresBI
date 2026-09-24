"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
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
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ClipboardList, Layers, Pencil, Plus, Trash2, UserPlus, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { IamUser, listUsers } from "@/lib/iam";
import {
  TicketsCentro,
  TicketsProyecto,
  TicketsProyectoEstado,
  TicketsProyectoParticipante,
  TicketsSubproyecto,
  addParticipante,
  createCentro,
  createProyecto,
  deleteCentro,
  deleteProyecto,
  deleteSubproyecto,
  listCentros,
  listParticipantes,
  listProyectos,
  listSubproyectos,
  removeParticipante,
  updateCentro,
  updateProyecto,
} from "@/lib/tickets";
import SubproyectoDetalleDialog from "./SubproyectoDetalleDialog";
import SubproyectoFormDialog from "./SubproyectoFormDialog";

const ESTADOS: TicketsProyectoEstado[] = ["PLANEADO", "EN CURSO", "COMPLETADO", "CANCELADO"];

const ESTADO_COLOR: Record<TicketsProyectoEstado, "default" | "info" | "success" | "error"> = {
  PLANEADO: "default",
  "EN CURSO": "info",
  COMPLETADO: "success",
  CANCELADO: "error",
};

const CENTRO_VACIO = { id: "", denominacion: "", descripcion: "", comentarios: "" };

const PROYECTO_VACIO = {
  id: "",
  denominacion: "",
  descripcion: "",
  centro: "",
  carpeta: "",
  responsable: "",
  estado: "PLANEADO" as TicketsProyectoEstado,
  vencimiento: "",
  fechaInicio: "",
  fechaFin: "",
  progreso: "",
  comentarios: "",
};

// Pantalla principal del modulo Tickets (24/Sep/2026, ver memoria
// tickets-modulo-jerarquia-sin-construir): Proyectos por Centro, con
// Participantes y Subproyectos en el detalle. Cada Subproyecto abre su
// propio dialogo con sus Tickets (SubproyectoDetalleDialog), y cada
// Ticket el suyo con Dependencias/Log (TicketDetalleDialog) - Centros
// tiene pantalla aparte (ver /tickets/centros).
export default function TicketsPage() {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));

  const [session, setSession] = useState<SessionUser | null>(null);
  const [centros, setCentros] = useState<TicketsCentro[]>([]);
  const [proyectos, setProyectos] = useState<TicketsProyecto[]>([]);
  const [usuarios, setUsuarios] = useState<IamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtroCentro, setFiltroCentro] = useState("");

  const [centroDialogOpen, setCentroDialogOpen] = useState(false);
  const [centroForm, setCentroForm] = useState(CENTRO_VACIO);
  const [centroSaving, setCentroSaving] = useState(false);
  const [centroError, setCentroError] = useState<string | null>(null);

  const [proyectoDialogOpen, setProyectoDialogOpen] = useState(false);
  const [proyectoForm, setProyectoForm] = useState(PROYECTO_VACIO);
  const [proyectoSaving, setProyectoSaving] = useState(false);
  const [proyectoError, setProyectoError] = useState<string | null>(null);

  const [detalle, setDetalle] = useState<TicketsProyecto | null>(null);
  const [detalleTab, setDetalleTab] = useState<"participantes" | "subproyectos">("participantes");
  const [participantes, setParticipantes] = useState<TicketsProyectoParticipante[]>([]);
  const [cargandoParticipantes, setCargandoParticipantes] = useState(false);
  const [nuevoParticipante, setNuevoParticipante] = useState<IamUser | null>(null);
  const [agregandoParticipante, setAgregandoParticipante] = useState(false);

  // Subproyectos del Proyecto en detalle (24/Sep/2026, Fase 2) - mismo
  // patron de tab pegado a la tabla que Participantes.
  const [subproyectos, setSubproyectos] = useState<TicketsSubproyecto[]>([]);
  const [cargandoSubproyectos, setCargandoSubproyectos] = useState(false);
  const [subproyectoFormOpen, setSubproyectoFormOpen] = useState(false);
  const [subproyectoEditando, setSubproyectoEditando] = useState<TicketsSubproyecto | null>(null);
  const [subproyectoDetalle, setSubproyectoDetalle] = useState<TicketsSubproyecto | null>(null);

  const puedeCrear = session?.perm_keys.includes("tickets.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tickets.editar") ?? false;

  useEffect(() => {
    getSession().then(setSession);
    listUsers().then(setUsuarios).catch(() => setUsuarios([]));
    listCentros()
      .then((res) => setCentros(res.results))
      .catch(() => setCentros([]));
  }, []);

  function refresh() {
    setLoading(true);
    listProyectos({ centro: filtroCentro || undefined, search: search || undefined })
      .then((res) => setProyectos(res.results))
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroCentro, search]);

  function nombreUsuario(userId: string): string {
    const u = usuarios.find((x) => x.user_id === userId);
    return u?.display_name || u?.primary_email || userId;
  }

  function nombreCentro(idCentro: string): string {
    return centros.find((c) => c.id_tickets_centro === idCentro)?.denominacion || idCentro;
  }

  // --- Centros ---------------------------------------------------------------

  function abrirNuevoCentro() {
    setCentroForm(CENTRO_VACIO);
    setCentroError(null);
    setCentroDialogOpen(true);
  }

  function abrirEditarCentro(c: TicketsCentro) {
    setCentroForm({
      id: c.id_tickets_centro,
      denominacion: c.denominacion,
      descripcion: c.descripcion || "",
      comentarios: c.comentarios || "",
    });
    setCentroError(null);
    setCentroDialogOpen(true);
  }

  async function guardarCentro() {
    if (!centroForm.denominacion) {
      setCentroError("La denominación es obligatoria.");
      return;
    }
    setCentroSaving(true);
    setCentroError(null);
    try {
      if (centroForm.id) {
        await updateCentro(centroForm.id, {
          denominacion: centroForm.denominacion,
          descripcion: centroForm.descripcion || undefined,
          comentarios: centroForm.comentarios || undefined,
        });
      } else {
        await createCentro({
          denominacion: centroForm.denominacion,
          descripcion: centroForm.descripcion || undefined,
          comentarios: centroForm.comentarios || undefined,
        });
      }
      const res = await listCentros();
      setCentros(res.results);
      setCentroDialogOpen(false);
    } catch (err) {
      setCentroError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCentroSaving(false);
    }
  }

  async function borrarCentro(c: TicketsCentro) {
    if (!window.confirm(`¿Borrar el centro "${c.denominacion}"? Esto falla si ya tiene proyectos.`)) return;
    try {
      await deleteCentro(c.id_tickets_centro);
      const res = await listCentros();
      setCentros(res.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  // --- Proyectos ---------------------------------------------------------------

  function abrirNuevoProyecto() {
    setProyectoForm({ ...PROYECTO_VACIO, centro: filtroCentro });
    setProyectoError(null);
    setProyectoDialogOpen(true);
  }

  function abrirEditarProyecto(p: TicketsProyecto) {
    setProyectoForm({
      id: p.id_proyecto,
      denominacion: p.denominacion,
      descripcion: p.descripcion || "",
      centro: p.centro,
      carpeta: p.carpeta || "",
      responsable: p.responsable,
      estado: p.estado,
      vencimiento: p.vencimiento || "",
      fechaInicio: p.fecha_inicio || "",
      fechaFin: p.fecha_fin || "",
      progreso: p.progreso || "",
      comentarios: p.comentarios || "",
    });
    setProyectoError(null);
    setProyectoDialogOpen(true);
  }

  async function guardarProyecto() {
    if (!proyectoForm.denominacion || !proyectoForm.centro || !proyectoForm.responsable) {
      setProyectoError("Denominación, centro y responsable son obligatorios.");
      return;
    }
    setProyectoSaving(true);
    setProyectoError(null);
    try {
      if (proyectoForm.id) {
        await updateProyecto(proyectoForm.id, {
          denominacion: proyectoForm.denominacion,
          descripcion: proyectoForm.descripcion || undefined,
          carpeta: proyectoForm.carpeta || undefined,
          responsable: proyectoForm.responsable,
          estado: proyectoForm.estado,
          vencimiento: proyectoForm.vencimiento || undefined,
          fechaInicio: proyectoForm.fechaInicio || undefined,
          fechaFin: proyectoForm.fechaFin || undefined,
          progreso: proyectoForm.progreso || undefined,
          comentarios: proyectoForm.comentarios || undefined,
        });
      } else {
        await createProyecto({
          denominacion: proyectoForm.denominacion,
          descripcion: proyectoForm.descripcion || undefined,
          centro: proyectoForm.centro,
          carpeta: proyectoForm.carpeta || undefined,
          responsable: proyectoForm.responsable,
          estado: proyectoForm.estado,
          vencimiento: proyectoForm.vencimiento || undefined,
          fechaInicio: proyectoForm.fechaInicio || undefined,
          fechaFin: proyectoForm.fechaFin || undefined,
          progreso: proyectoForm.progreso || undefined,
          comentarios: proyectoForm.comentarios || undefined,
        });
      }
      setProyectoDialogOpen(false);
      refresh();
    } catch (err) {
      setProyectoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setProyectoSaving(false);
    }
  }

  async function borrarProyecto(p: TicketsProyecto) {
    if (!window.confirm(`¿Borrar el proyecto "${p.denominacion}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteProyecto(p.id_proyecto);
      setDetalle(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  // --- Participantes -----------------------------------------------------------

  function abrirDetalle(p: TicketsProyecto) {
    setDetalle(p);
    setDetalleTab("participantes");
    setNuevoParticipante(null);
    setCargandoParticipantes(true);
    listParticipantes(p.id_proyecto)
      .then((res) => setParticipantes(res.results))
      .catch(() => setParticipantes([]))
      .finally(() => setCargandoParticipantes(false));
    refrescarSubproyectos(p.id_proyecto);
  }

  async function agregarParticipante() {
    if (!detalle || !nuevoParticipante) return;
    setAgregandoParticipante(true);
    try {
      await addParticipante({ idProyecto: detalle.id_proyecto, idParticipante: nuevoParticipante.user_id });
      const res = await listParticipantes(detalle.id_proyecto);
      setParticipantes(res.results);
      setNuevoParticipante(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAgregandoParticipante(false);
    }
  }

  async function quitarParticipante(p: TicketsProyectoParticipante) {
    if (!detalle) return;
    try {
      await removeParticipante(p.id_proyectos_part);
      setParticipantes((prev) => prev.filter((x) => x.id_proyectos_part !== p.id_proyectos_part));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  const usuariosDisponibles = useMemo(
    () => usuarios.filter((u) => !participantes.some((p) => p.id_participante === u.user_id)),
    [usuarios, participantes]
  );

  // --- Subproyectos --------------------------------------------------------

  function refrescarSubproyectos(idProyecto: string) {
    setCargandoSubproyectos(true);
    listSubproyectos({ idProyecto })
      .then((res) => setSubproyectos(res.results))
      .catch(() => setSubproyectos([]))
      .finally(() => setCargandoSubproyectos(false));
  }

  async function borrarSubproyecto(s: TicketsSubproyecto) {
    if (!detalle) return;
    if (!window.confirm(`¿Borrar el subproyecto "${s.denominacion}"? Esto falla si ya tiene tickets.`)) return;
    try {
      await deleteSubproyecto(s.id_subproyecto);
      setSubproyectoDetalle(null);
      refrescarSubproyectos(detalle.id_proyecto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <ClipboardList size={22} strokeWidth={1.5} />
        <Typography variant="h5">Proyectos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Proyectos por Centro — responsables, participantes, subproyectos y tickets.
      </Typography>

      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por proyecto o responsable..."
        actions={
          puedeCrear ? (
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={abrirNuevoCentro} sx={{ flexShrink: 0 }}>
                Nuevo Centro
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={abrirNuevoProyecto}
                sx={{ flexShrink: 0 }}
              >
                Nuevo Proyecto
              </Button>
            </Stack>
          ) : undefined
        }
      >
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="filtro-centro-label">Filtrar por centro</InputLabel>
          <Select
            labelId="filtro-centro-label"
            label="Filtrar por centro"
            value={filtroCentro}
            onChange={(e) => setFiltroCentro(e.target.value)}
          >
            <MenuItem value="">
              <em>Todos los centros</em>
            </MenuItem>
            {centros.map((c) => (
              <MenuItem key={c.id_tickets_centro} value={c.id_tickets_centro}>
                {c.denominacion}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FiltrosBar>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={24} />
        </Stack>
      ) : proyectos.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {centros.length === 0
              ? "Todavía no hay centros — crea uno primero para poder dar de alta un proyecto."
              : "Sin proyectos registrados todavía."}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Proyecto</TableCell>
                <TableCell>Centro</TableCell>
                <TableCell>Responsable</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Progreso</TableCell>
                <TableCell>Vencimiento</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {proyectos.map((p) => (
                <TableRow key={p.id_proyecto} hover onClick={() => abrirDetalle(p)} sx={{ cursor: "pointer" }}>
                  <TableCell>{p.denominacion}</TableCell>
                  <TableCell>{nombreCentro(p.centro)}</TableCell>
                  <TableCell>{nombreUsuario(p.responsable)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={p.estado} color={ESTADO_COLOR[p.estado]} />
                  </TableCell>
                  <TableCell align="right">{p.progreso ? `${p.progreso}%` : "—"}</TableCell>
                  <TableCell>{p.vencimiento || "—"}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="Editar">
                        <span>
                          <IconButton size="small" aria-label="Editar" onClick={() => abrirEditarProyecto(p)} disabled={!puedeEditar}>
                            <Pencil size={13} strokeWidth={1.5} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Borrar">
                        <span>
                          <IconButton size="small" aria-label="Borrar" onClick={() => borrarProyecto(p)} disabled={!puedeEditar}>
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

      {/* Gestión de Centros (23/Sep/2026, catálogo raíz - sin FK propia,
      alta/edición en un diálogo simple aparte de Proyectos). */}
      <Dialog
        open={centroDialogOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setCentroDialogOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {centroForm.id ? "Editar Centro" : "Nuevo Centro"}
          <IconButton onClick={() => setCentroDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {centroError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {centroError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Denominación"
              value={centroForm.denominacion}
              onChange={(e) => setCentroForm({ ...centroForm, denominacion: e.target.value })}
              fullWidth
              autoFocus
            />
            <TextField
              size="small"
              label="Descripción"
              value={centroForm.descripcion}
              onChange={(e) => setCentroForm({ ...centroForm, descripcion: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              size="small"
              label="Comentarios"
              value={centroForm.comentarios}
              onChange={(e) => setCentroForm({ ...centroForm, comentarios: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>

          {/* Lista rapida de centros existentes, con borrar/editar inline -
          evita tener que armar una pantalla aparte solo para el catalogo raiz. */}
          {centros.length > 0 && (
            <Stack spacing={0.5} sx={{ mt: 3 }}>
              <Typography variant="caption" color="text.secondary">
                Centros existentes
              </Typography>
              {centros.map((c) => (
                <Stack key={c.id_tickets_centro} direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2">{c.denominacion}</Typography>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" aria-label="Editar" onClick={() => abrirEditarCentro(c)}>
                      <Pencil size={13} strokeWidth={1.5} />
                    </IconButton>
                    <IconButton size="small" aria-label="Borrar" onClick={() => borrarCentro(c)}>
                      <Trash2 size={13} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCentroDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarCentro} disabled={centroSaving}>
            {centroSaving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Alta/edición de Proyecto. */}
      <Dialog
        open={proyectoDialogOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setProyectoDialogOpen(false);
        }}
        fullWidth
        maxWidth="sm"
        fullScreen={esMovil}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {proyectoForm.id ? "Editar Proyecto" : "Nuevo Proyecto"}
          <IconButton onClick={() => setProyectoDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {proyectoError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {proyectoError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Denominación"
              value={proyectoForm.denominacion}
              onChange={(e) => setProyectoForm({ ...proyectoForm, denominacion: e.target.value })}
              fullWidth
              autoFocus
            />
            <FormControl size="small" fullWidth disabled={!!proyectoForm.id}>
              <InputLabel id="proyecto-centro-label">Centro</InputLabel>
              <Select
                labelId="proyecto-centro-label"
                label="Centro"
                value={proyectoForm.centro}
                onChange={(e) => setProyectoForm({ ...proyectoForm, centro: e.target.value })}
              >
                {centros.map((c) => (
                  <MenuItem key={c.id_tickets_centro} value={c.id_tickets_centro}>
                    {c.denominacion}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              size="small"
              fullWidth
              openOnFocus
              options={usuarios}
              value={usuarios.find((u) => u.user_id === proyectoForm.responsable) || null}
              onChange={(_, value) => setProyectoForm({ ...proyectoForm, responsable: value?.user_id || "" })}
              getOptionLabel={(u) => u.display_name || u.primary_email}
              isOptionEqualToValue={(o, v) => o.user_id === v.user_id}
              renderInput={(params) => <TextField {...params} label="Responsable" />}
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="proyecto-estado-label">Estado</InputLabel>
              <Select
                labelId="proyecto-estado-label"
                label="Estado"
                value={proyectoForm.estado}
                onChange={(e) => setProyectoForm({ ...proyectoForm, estado: e.target.value as TicketsProyectoEstado })}
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
              value={proyectoForm.descripcion}
              onChange={(e) => setProyectoForm({ ...proyectoForm, descripcion: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                type="date"
                label="Fecha inicio"
                value={proyectoForm.fechaInicio}
                onChange={(e) => setProyectoForm({ ...proyectoForm, fechaInicio: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Fecha fin"
                value={proyectoForm.fechaFin}
                onChange={(e) => setProyectoForm({ ...proyectoForm, fechaFin: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Vencimiento"
                value={proyectoForm.vencimiento}
                onChange={(e) => setProyectoForm({ ...proyectoForm, vencimiento: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              type="number"
              label="Progreso (%)"
              value={proyectoForm.progreso}
              onChange={(e) => setProyectoForm({ ...proyectoForm, progreso: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Carpeta (Drive)"
              value={proyectoForm.carpeta}
              onChange={(e) => setProyectoForm({ ...proyectoForm, carpeta: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Comentarios"
              value={proyectoForm.comentarios}
              onChange={(e) => setProyectoForm({ ...proyectoForm, comentarios: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProyectoDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarProyecto} disabled={proyectoSaving}>
            {proyectoSaving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detalle de Proyecto + gestion de Participantes (M2M, ver
      tickets_proyectos_participantes en el ERD). */}
      <Dialog
        open={!!detalle}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setDetalle(null);
        }}
        fullWidth
        maxWidth="sm"
        fullScreen={esMovil}
      >
        {detalle && (
          <>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {detalle.denominacion}
              <IconButton onClick={() => setDetalle(null)} size="small" aria-label="Cerrar">
                <CloseIcon size={18} strokeWidth={1.5} />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1.5} sx={{ mb: 3 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Centro
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {nombreCentro(detalle.centro)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Responsable
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {nombreUsuario(detalle.responsable)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    Estado
                  </Typography>
                  <Chip size="small" label={detalle.estado} color={ESTADO_COLOR[detalle.estado]} />
                </Stack>
                {detalle.progreso && (
                  <Box>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        Progreso
                      </Typography>
                      <Typography variant="body2">{detalle.progreso}%</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={Number(detalle.progreso)} />
                  </Box>
                )}
                {detalle.descripcion && (
                  <Typography variant="body2" color="text.secondary">
                    {detalle.descripcion}
                  </Typography>
                )}
              </Stack>

              <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
                <Tabs value={detalleTab} onChange={(_, v) => setDetalleTab(v)}>
                  <Tab value="participantes" label="Participantes" />
                  <Tab value="subproyectos" label="Subproyectos" />
                </Tabs>
              </Box>

              {detalleTab === "participantes" && (
                <>
                  {cargandoParticipantes ? (
                    <Stack alignItems="center" sx={{ py: 2 }}>
                      <CircularProgress size={20} />
                    </Stack>
                  ) : (
                    <Stack spacing={0.5} sx={{ mb: 2 }}>
                      {participantes.length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          Sin participantes todavía.
                        </Typography>
                      )}
                      {participantes.map((p) => (
                        <Stack key={p.id_proyectos_part} direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="body2">{nombreUsuario(p.id_participante)}</Typography>
                          {puedeEditar && (
                            <IconButton size="small" aria-label="Quitar" onClick={() => quitarParticipante(p)}>
                              <Trash2 size={13} strokeWidth={1.5} />
                            </IconButton>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  )}
                  {puedeEditar && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Autocomplete
                        size="small"
                        fullWidth
                        openOnFocus
                        options={usuariosDisponibles}
                        value={nuevoParticipante}
                        onChange={(_, value) => setNuevoParticipante(value)}
                        getOptionLabel={(u) => u.display_name || u.primary_email}
                        isOptionEqualToValue={(o, v) => o.user_id === v.user_id}
                        renderInput={(params) => <TextField {...params} label="Agregar participante" />}
                      />
                      <Tooltip title="Agregar">
                        <span>
                          <IconButton
                            color="primary"
                            onClick={agregarParticipante}
                            disabled={!nuevoParticipante || agregandoParticipante}
                          >
                            <UserPlus size={18} strokeWidth={1.5} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  )}
                </>
              )}

              {detalleTab === "subproyectos" && (
                <>
                  <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
                    {puedeCrear && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Plus size={14} strokeWidth={2} />}
                        onClick={() => {
                          setSubproyectoEditando(null);
                          setSubproyectoFormOpen(true);
                        }}
                      >
                        Nuevo Subproyecto
                      </Button>
                    )}
                  </Stack>
                  {cargandoSubproyectos ? (
                    <Stack alignItems="center" sx={{ py: 2 }}>
                      <CircularProgress size={20} />
                    </Stack>
                  ) : subproyectos.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      Sin subproyectos todavía.
                    </Typography>
                  ) : (
                    <Stack spacing={0.5}>
                      {subproyectos.map((s) => (
                        <Stack
                          key={s.id_subproyecto}
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          onClick={() => setSubproyectoDetalle(s)}
                          sx={{ cursor: "pointer", py: 0.5, "&:hover": { bgcolor: "action.hover" } }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Layers size={14} strokeWidth={1.5} />
                            <Typography variant="body2">{s.denominacion}</Typography>
                          </Stack>
                          <Chip size="small" label={s.estado} color={ESTADO_COLOR[s.estado]} />
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Tooltip title="Borrar proyecto">
                <span>
                  <IconButton aria-label="Borrar" onClick={() => borrarProyecto(detalle)} disabled={!puedeEditar}>
                    <Trash2 size={16} strokeWidth={1.5} />
                  </IconButton>
                </span>
              </Tooltip>
              <Button
                variant="contained"
                startIcon={<Pencil size={14} strokeWidth={2} />}
                onClick={() => abrirEditarProyecto(detalle)}
                disabled={!puedeEditar}
              >
                Editar
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <SubproyectoFormDialog
        open={subproyectoFormOpen}
        onClose={() => setSubproyectoFormOpen(false)}
        idProyecto={detalle?.id_proyecto || ""}
        subproyecto={subproyectoEditando}
        usuarios={usuarios}
        onSaved={() => detalle && refrescarSubproyectos(detalle.id_proyecto)}
      />

      <SubproyectoDetalleDialog
        open={!!subproyectoDetalle}
        onClose={() => setSubproyectoDetalle(null)}
        subproyecto={subproyectoDetalle}
        usuarios={usuarios}
        puedeEditar={puedeEditar}
        puedeCrear={puedeCrear}
        onEditar={() => {
          if (subproyectoDetalle) {
            setSubproyectoEditando(subproyectoDetalle);
            setSubproyectoFormOpen(true);
            setSubproyectoDetalle(null);
          }
        }}
        onBorrar={() => {
          if (subproyectoDetalle) borrarSubproyecto(subproyectoDetalle);
        }}
      />
    </AppShell>
  );
}
