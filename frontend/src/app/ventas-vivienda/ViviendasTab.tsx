"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
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
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Eye, Pencil, Plus, Trash2, X as CloseIcon } from "lucide-react";
import { downloadDriveFile, driveFileIdFromUrl } from "@/lib/drive";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import FiltrosBar from "@/components/FiltrosBar";
import {
  ViviendaExpediente,
  ViviendaExpedienteEstado,
  ViviendaExpedienteItem,
  ViviendaItemStatus,
  ViviendaProyecto,
  ViviendaUnidad,
  createItem,
  createVivienda,
  deleteVivienda,
  listExpedientes,
  listItems,
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
  frenteM2: "",
  fondoM2: "",
  supTerrenoM2: "",
  supConstM2: "",
  terrazaM2: "",
  balconesM2: "",
  bodegaM2: "",
  cajonesEst: "",
  precioLista: "",
  muestra: false,
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
  const [filtroDisponible, setFiltroDisponible] = useState<"" | "true" | "false">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaUnidad | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [soloLectura, setSoloLectura] = useState(false);
  const [verTab, setVerTab] = useState(0);
  const [expedientesVer, setExpedientesVer] = useState<ViviendaExpediente[]>([]);
  const [loadingExp, setLoadingExp] = useState(false);
  const [togglingDisp, setTogglingDisp] = useState(false);
  const [expedienteDrawer, setExpedienteDrawer] = useState<ViviendaExpediente | null>(null);
  const [itemsDrawer, setItemsDrawer] = useState<ViviendaExpedienteItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [previewDocBlobUrl, setPreviewDocBlobUrl] = useState<string | null>(null);
  const [fallbackDocUrl, setFallbackDocUrl] = useState<string | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [dispActual, setDispActual] = useState<boolean>(true);

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

  const viviendasFiltradas = filtroDisponible === ""
    ? viviendas
    : viviendas.filter((v) => (v.disponible ? "true" : "false") === filtroDisponible);

  useEffect(() => {
    setPage(0);
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroProyecto]);

  useEffect(() => { setPage(0); }, [filtroDisponible]);

  function abrirAlta() {
    setEditing(null);
    setForm({ ...FORM_VACIO, proyecto: filtroProyecto });
    setFormError(null);
    setSoloLectura(false);
    setDialogOpen(true);
  }

  function abrirEdicion(v: ViviendaUnidad) {
    setEditing(v);
    setDispActual(v.disponible ?? true);
    setForm({
      proyecto: v.proyecto,
      denominacion: v.denominacion || "",
      numOficial: v.num_oficial || "",
      etapa: v.etapa || "",
      tipo: v.tipo || "",
      modelo: v.modelo || "",
      habitaciones: v.habitaciones?.toString() || "",
      frenteM2: v.frente_m2 || "",
      fondoM2: v.fondo_m2 || "",
      supTerrenoM2: v.sup_terreno_m2 || "",
      supConstM2: v.sup_const_m2 || "",
      terrazaM2: v.terraza_m2 || "",
      balconesM2: v.balcones_m2 || "",
      bodegaM2: v.bodega_m2 || "",
      cajonesEst: v.cajones_est || "",
      precioLista: v.precio_lista || "",
      muestra: v.muestra ?? false,
      comentarios: v.comentarios || "",
    });
    setFormError(null);
    setSoloLectura(false);
    setDialogOpen(true);
  }

  function abrirVer(v: ViviendaUnidad) {
    setEditing(v);
    setDispActual(v.disponible ?? true);
    setForm({
      proyecto: v.proyecto,
      denominacion: v.denominacion || "",
      numOficial: v.num_oficial || "",
      etapa: v.etapa || "",
      tipo: v.tipo || "",
      modelo: v.modelo || "",
      habitaciones: v.habitaciones?.toString() || "",
      frenteM2: v.frente_m2 || "",
      fondoM2: v.fondo_m2 || "",
      supTerrenoM2: v.sup_terreno_m2 || "",
      supConstM2: v.sup_const_m2 || "",
      terrazaM2: v.terraza_m2 || "",
      balconesM2: v.balcones_m2 || "",
      bodegaM2: v.bodega_m2 || "",
      cajonesEst: v.cajones_est || "",
      precioLista: v.precio_lista || "",
      muestra: v.muestra ?? false,
      comentarios: v.comentarios || "",
    });
    setFormError(null);
    setVerTab(0);
    setExpedientesVer([]);
    setSoloLectura(true);
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
        frenteM2: form.frenteM2 || null,
        fondoM2: form.fondoM2 || null,
        supTerrenoM2: form.supTerrenoM2 || null,
        supConstM2: form.supConstM2 || null,
        terrazaM2: form.terrazaM2 || null,
        balconesM2: form.balconesM2 || null,
        bodegaM2: form.bodegaM2 || null,
        cajonesEst: form.cajonesEst || null,
        precioLista: form.precioLista || null,
        muestra: form.muestra,
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

      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por número, denominación, modelo o torre..."
        actions={
          puedeCrear ? (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
            >
              Nueva Unidad
            </Button>
          ) : undefined
        }
      >
        <FormControl size="small">
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
        <FormControl size="small">
          <InputLabel id="filtro-disponible-label">Disponibilidad</InputLabel>
          <Select
            labelId="filtro-disponible-label"
            label="Disponibilidad"
            value={filtroDisponible}
            onChange={(e) => setFiltroDisponible(e.target.value as "" | "true" | "false")}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="true">Disponibles</MenuItem>
            <MenuItem value="false">No disponibles</MenuItem>
          </Select>
        </FormControl>
      </FiltrosBar>

      <Paper variant="outlined">
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
              ) : viviendasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin unidades registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                viviendasFiltradas.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((v) => (
                  <TableRow key={v.id_vivienda} hover>
                    <TableCell>{v.denominacion || v.num_oficial || "—"}</TableCell>
                    <TableCell>{v.proyecto_denominacion || "—"}</TableCell>
                    <TableCell>{v.modelo || "—"}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {v.precio_lista ? `$${v.precio_lista}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={v.disponible ? "Disponible" : "No disponible"}
                        color={v.disponible ? "success" : "error"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Ver detalle" onClick={() => abrirVer(v)}>
                        <Eye size={14} strokeWidth={1.5} />
                      </IconButton>

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
        <TablePagination
          component="div"
          count={viviendasFiltradas.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Filas:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <span>{soloLectura ? (editing?.denominacion || editing?.num_oficial || editing?.id_vivienda || "Detalle") : editing ? `Editar ${editing.denominacion || editing.id_vivienda}` : "Nueva Unidad"}</span>
            {soloLectura && editing && (
              <Chip size="small" label={dispActual ? "Disponible" : "No disponible"} color={dispActual ? "success" : "error"} variant="outlined" />
            )}
          </Stack>
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        {soloLectura && (
          <Tabs
            value={verTab}
            onChange={(_, v) => {
              setVerTab(v);
              if (v === 1 && expedientesVer.length === 0 && editing) {
                setLoadingExp(true);
                listExpedientes({ vivienda: editing.id_vivienda })
                  .then(setExpedientesVer)
                  .finally(() => setLoadingExp(false));
              }
            }}
            sx={{ px: 3, borderBottom: "1px solid", borderColor: "divider" }}
          >
            <Tab label="Detalle" value={0} />
            <Tab label="Expedientes" value={1} />
          </Tabs>
        )}
        <DialogContent dividers>
          {formError && !soloLectura && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          {soloLectura && verTab === 1 ? (
            loadingExp ? (
              <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={24} /></Stack>
            ) : expedientesVer.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Sin expedientes para esta vivienda.</Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Expediente</TableCell>
                      <TableCell>Asesor</TableCell>
                      <TableCell>Contrato</TableCell>
                      <TableCell>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expedientesVer.map((e) => (
                      <TableRow
                        key={e.id_expediente}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => {
                          setExpedienteDrawer(e);
                          setItemsDrawer([]);
                          setLoadingItems(true);
                          listItems(e.id_expediente).then(setItemsDrawer).finally(() => setLoadingItems(false));
                        }}
                      >
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
                          {e.id_expediente.slice(0, 8).toUpperCase()}
                        </TableCell>
                        <TableCell>{e.asesor_nombre}</TableCell>
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id_contrato}</TableCell>
                        <TableCell>
                          <Chip size="small" label={e.estado} variant="outlined"
                            color={({ PENDIENTE: "default", "EN PROCESO": "info", FIRMADO: "warning", CONCLUIDO: "success", CANCELADO: "error" } as Record<ViviendaExpedienteEstado, "default"|"info"|"warning"|"success"|"error">)[e.estado] ?? "default"}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )
          ) : (
          <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            {editing && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>Disponibilidad</Typography>
                <ButtonGroup size="small" variant="outlined" disabled={togglingDisp}>
                  <Button
                    color="success"
                    variant={dispActual ? "contained" : "outlined"}
                    onClick={async () => {
                      if (dispActual) return;
                      setTogglingDisp(true);
                      try {
                        await updateVivienda(editing.id_vivienda, { disponible: true }, actorId);
                        setDispActual(true);
                        refresh();
                      } finally { setTogglingDisp(false); }
                    }}
                  >
                    Disponible
                  </Button>
                  <Button
                    color="error"
                    variant={!dispActual ? "contained" : "outlined"}
                    onClick={async () => {
                      if (!dispActual) return;
                      setTogglingDisp(true);
                      try {
                        await updateVivienda(editing.id_vivienda, { disponible: false }, actorId);
                        setDispActual(false);
                        refresh();
                      } finally { setTogglingDisp(false); }
                    }}
                  >
                    No disponible
                  </Button>
                </ButtonGroup>
                {togglingDisp && <CircularProgress size={18} />}
              </Stack>
            )}
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
                label="Cajones estacionamiento"
                value={form.cajonesEst}
                onChange={(e) => setForm({ ...form, cajonesEst: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Frente (m²)"
                value={form.frenteM2}
                onChange={(e) => setForm({ ...form, frenteM2: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Fondo (m²)"
                value={form.fondoM2}
                onChange={(e) => setForm({ ...form, fondoM2: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Terraza (m²)"
                value={form.terrazaM2}
                onChange={(e) => setForm({ ...form, terrazaM2: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Balcones (m²)"
                value={form.balconesM2}
                onChange={(e) => setForm({ ...form, balconesM2: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Bodega (m²)"
                value={form.bodegaM2}
                onChange={(e) => setForm({ ...form, bodegaM2: e.target.value })}
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
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>Unidad muestra</Typography>
              <ButtonGroup size="small" variant="outlined">
                <Button
                  color="success"
                  variant={form.muestra ? "contained" : "outlined"}
                  onClick={() => setForm({ ...form, muestra: true })}
                >
                  Sí
                </Button>
                <Button
                  color="error"
                  variant={!form.muestra ? "contained" : "outlined"}
                  onClick={() => setForm({ ...form, muestra: false })}
                >
                  No
                </Button>
              </ButtonGroup>
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
          )}
        </DialogContent>
        <DialogActions>
          {soloLectura ? (
            <Button onClick={() => setDialogOpen(false)}>Cerrar</Button>
          ) : (
            <>
              <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button variant="contained" onClick={handleGuardar} disabled={saving}>
                {saving ? <CircularProgress size={16} /> : "Guardar"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Drawer
        anchor="right"
        open={!!expedienteDrawer}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setExpedienteDrawer(null);
        }}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        {expedienteDrawer && (
          <Box sx={{ width: 380, p: 3 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6">Expediente</Typography>
                <Chip size="small" label={expedienteDrawer.estado} variant="outlined"
                  color={({ PENDIENTE: "default", "EN PROCESO": "info", FIRMADO: "warning", CONCLUIDO: "success", CANCELADO: "error" } as Record<ViviendaExpedienteEstado, "default"|"info"|"warning"|"success"|"error">)[expedienteDrawer.estado] ?? "default"}
                />
              </Stack>
              <IconButton size="small" aria-label="Cerrar" onClick={() => setExpedienteDrawer(null)}>
                <CloseIcon size={18} strokeWidth={1.5} />
              </IconButton>
            </Stack>
            <Divider sx={{ mb: 2 }} />

            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size="small">
                <TableBody>
                  {([
                    ["ID", expedienteDrawer.id_expediente.slice(0, 8).toUpperCase()],
                    ["Asesor", expedienteDrawer.asesor_nombre],
                    ["Contrato", expedienteDrawer.id_contrato],
                    ["Medio de pago", expedienteDrawer.medio_pago],
                    ["Pagos en efectivo", expedienteDrawer.pagos_efectivo != null ? (expedienteDrawer.pagos_efectivo ? "Sí" : "No") : null],
                    ["Fecha cierre", expedienteDrawer.fecha_cierre],
                    ["Comentarios", expedienteDrawer.comentarios],
                    ["Creado por", expedienteDrawer.created_by],
                    ["Creado el", expedienteDrawer.created_at ? new Date(expedienteDrawer.created_at).toLocaleString("es-MX") : null],
                    ["Actualizado por", expedienteDrawer.updated_by],
                    ["Actualizado el", expedienteDrawer.updated_at ? new Date(expedienteDrawer.updated_at).toLocaleString("es-MX") : null],
                  ] as [string, string | null | undefined][]).map(([label, value]) => (
                    <TableRow key={label}>
                      <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold", width: "40%", fontSize: 12 }}>{label}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{value || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {expedienteDrawer.link_expediente && (
                    <TableRow>
                      <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold", fontSize: 12 }}>Link</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>
                        <IconButton
                          size="small"
                          disabled={loadingDocId === "expediente"}
                          onClick={async () => {
                            const fileId = driveFileIdFromUrl(expedienteDrawer.link_expediente!);
                            if (!fileId) { setFallbackDocUrl(expedienteDrawer.link_expediente!); return; }
                            setLoadingDocId("expediente");
                            try {
                              const blob = await downloadDriveFile(fileId, "ventas-vivienda.editar");
                              if (previewDocBlobUrl) URL.revokeObjectURL(previewDocBlobUrl);
                              setFallbackDocUrl(null);
                              setPreviewDocBlobUrl(blob);
                            } catch { setFallbackDocUrl(expedienteDrawer.link_expediente!); }
                            finally { setLoadingDocId(null); }
                          }}
                        >
                          {loadingDocId === "expediente" ? <CircularProgress size={14} /> : <Eye size={14} strokeWidth={1.5} />}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="subtitle2" sx={{ mb: 1 }}>Documentos</Typography>
            {loadingItems ? (
              <CircularProgress size={20} />
            ) : itemsDrawer.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Sin documentos.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {itemsDrawer.map((item) => (
                  <Paper key={item.id_item} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={0.5}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="body2" fontWeight={500}>{item.denominacion || "—"}</Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Chip size="small" label={item.status}
                            color={({ PENDIENTE: "default", "NO APLICA": "default", INCOMPLETO: "warning", ENTREGADO: "info", APROBADO: "success", RECHAZADO: "error", POSPUESTO: "warning" } as Record<ViviendaItemStatus, "default"|"warning"|"info"|"success"|"error">)[item.status] ?? "default"}
                          />
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ minWidth: 0, px: 1, fontSize: 11 }}
                            disabled={duplicando}
                            onClick={async () => {
                              setDuplicando(true);
                              try {
                                await createItem({
                                  expediente: item.expediente,
                                  denominacion: item.denominacion,
                                  status: "PENDIENTE",
                                  responsable: item.responsable,
                                  actorId,
                                });
                                setLoadingItems(true);
                                listItems(expedienteDrawer.id_expediente).then(setItemsDrawer).finally(() => setLoadingItems(false));
                              } finally { setDuplicando(false); }
                            }}
                          >
                            Duplicar
                          </Button>
                        </Stack>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">Responsable: {item.responsable || "—"}</Typography>
                      <Typography variant="caption" color="text.secondary">Fecha solicitud: {item.fecha_solicitud || "—"}</Typography>
                      {item.link_documento && (
                        <IconButton
                          size="small"
                          aria-label="Ver documento"
                          disabled={loadingDocId === item.id_item}
                          onClick={async () => {
                            const fileId = driveFileIdFromUrl(item.link_documento!);
                            if (!fileId) { setFallbackDocUrl(item.link_documento!); return; }
                            setLoadingDocId(item.id_item);
                            try {
                              const blob = await downloadDriveFile(fileId, "ventas-vivienda.editar");
                              if (previewDocBlobUrl) URL.revokeObjectURL(previewDocBlobUrl);
                              setFallbackDocUrl(null);
                              setPreviewDocBlobUrl(blob);
                            } catch { setFallbackDocUrl(item.link_documento!); }
                            finally { setLoadingDocId(null); }
                          }}
                        >
                          {loadingDocId === item.id_item ? <CircularProgress size={14} /> : <Eye size={14} strokeWidth={1.5} />}
                        </IconButton>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Drawer>

      <DocumentoPreviewDialog
        open={!!previewDocBlobUrl || !!fallbackDocUrl}
        onClose={() => { if (previewDocBlobUrl) URL.revokeObjectURL(previewDocBlobUrl); setPreviewDocBlobUrl(null); setFallbackDocUrl(null); }}
        url={previewDocBlobUrl}
        urlExterna={fallbackDocUrl}
        titulo="Documento"
        sx={{ zIndex: (theme: { zIndex: { modal: number } }) => theme.zIndex.modal + 2 }}
      />

    </>
  );
}
