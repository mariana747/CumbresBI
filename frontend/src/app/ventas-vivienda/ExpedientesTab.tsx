"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import { CheckSquare, Eye, FileSpreadsheet, Pencil, Plus, Trash2, Users, X as CloseIcon } from "lucide-react";
import FiltrosBar from "@/components/FiltrosBar";
import { descargarCsv } from "@/lib/descargarCsv";
import ContraparteSelector from "@/components/ContraparteSelector";
import { TesoreriaContraparte, getContraparte } from "@/lib/tesoreria";
import {
  ViviendaAsesor,
  ViviendaClienteExpediente,
  ViviendaClienteTipo,
  ViviendaExpediente,
  ViviendaExpedienteEstado,
  ViviendaExpedienteItem,
  ViviendaItemResponsable,
  ViviendaItemStatus,
  ViviendaUnidad,
  createClienteExpediente,
  createExpediente,
  createItem,
  deleteClienteExpediente,
  deleteItem,
  listAsesores,
  listClientesExpediente,
  listExpedientes,
  listItems,
  listViviendas,
  updateExpediente,
  updateItem,
} from "@/lib/vivienda";

const TIPO_CLIENTE_LABELS: Record<ViviendaClienteTipo, string> = {
  ACREDITADO: "Acreditado",
  COACREDITADO: "Coacreditado",
};

// Dialogo de clientes de un expediente (19/Ago/2026, conectado al catalogo
// real de contrapartes - ver ContraparteSelector.tsx y docs/architecture/
// README.md sec. 11.2 #7). Aparte del dialogo de arriba porque un
// expediente puede tener 0+ clientes (acreditado/coacreditado), no es un
// campo mas del formulario del expediente.
function ClientesExpedienteDialog({
  expediente,
  onClose,
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  expediente: ViviendaExpediente;
  onClose: () => void;
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [clientes, setClientes] = useState<(ViviendaClienteExpediente & { contraparteNombre?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevaContraparte, setNuevaContraparte] = useState<TesoreriaContraparte | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState<ViviendaClienteTipo>("ACREDITADO");
  const [agregando, setAgregando] = useState(false);

  function refresh() {
    setLoading(true);
    listClientesExpediente(expediente.id_expediente)
      .then(async (lista) => {
        const conNombre = await Promise.all(
          lista.map(async (c) => {
            try {
              const contraparte = await getContraparte(c.id_contraparte);
              return { ...c, contraparteNombre: contraparte.razon_social };
            } catch {
              return c;
            }
          })
        );
        setClientes(conNombre);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [expediente.id_expediente]);

  async function handleAgregar() {
    if (!nuevaContraparte) return;
    setAgregando(true);
    setError(null);
    try {
      await createClienteExpediente({
        expediente: expediente.id_expediente,
        idContraparte: nuevaContraparte.id_contraparte,
        tipo: nuevoTipo,
        actorId,
      });
      setNuevaContraparte(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAgregando(false);
    }
  }

  async function handleQuitar(cliente: ViviendaClienteExpediente) {
    if (!window.confirm("¿Quitar este cliente del expediente?")) return;
    try {
      await deleteClienteExpediente(cliente.id_rel_viv_exp_cliente);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Clientes del expediente {expediente.id_expediente}
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
        {loading ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
          </Stack>
        ) : clientes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sin clientes registrados en este expediente.
          </Typography>
        ) : (
          <Table size="small" sx={{ mb: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell>Contraparte</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.id_rel_viv_exp_cliente}>
                  <TableCell>{c.contraparteNombre || c.id_contraparte}</TableCell>
                  <TableCell>{TIPO_CLIENTE_LABELS[c.tipo]}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      aria-label="Quitar"
                      onClick={() => handleQuitar(c)}
                      disabled={!puedeEditar}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {puedeCrear && (
          <Stack spacing={2} sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle2" sx={{ pt: 2 }}>
              Agregar cliente
            </Typography>
            <ContraparteSelector value={nuevaContraparte} onChange={setNuevaContraparte} label="Cliente" />
            <FormControl size="small" fullWidth>
              <InputLabel id="tipo-cliente-label">Tipo</InputLabel>
              <Select
                labelId="tipo-cliente-label"
                label="Tipo"
                value={nuevoTipo}
                onChange={(e) => setNuevoTipo(e.target.value as ViviendaClienteTipo)}
              >
                {Object.entries(TIPO_CLIENTE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={handleAgregar}
              disabled={!nuevaContraparte || agregando}
              sx={{ alignSelf: "flex-start" }}
            >
              {agregando ? <CircularProgress size={14} /> : "Agregar"}
            </Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ITEM_STATUS_LABELS: Record<ViviendaItemStatus, string> = {
  PENDIENTE: "Pendiente",
  "NO APLICA": "No aplica",
  INCOMPLETO: "Incompleto",
  ENTREGADO: "Entregado",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  POSPUESTO: "Pospuesto",
};

const ITEM_STATUS_COLORS: Record<
  ViviendaItemStatus,
  "default" | "warning" | "info" | "success" | "error"
> = {
  PENDIENTE: "default",
  "NO APLICA": "default",
  INCOMPLETO: "warning",
  ENTREGADO: "info",
  APROBADO: "success",
  RECHAZADO: "error",
  POSPUESTO: "warning",
};

const RESPONSABLE_LABELS: Record<ViviendaItemResponsable, string> = {
  VENTAS: "Ventas",
  ESCRITURACION: "Escrituración",
  TESORERIA: "Tesorería",
  CONTABILIDAD: "Contabilidad",
  LEGAL: "Legal",
};

const FORM_ITEM_VACIO = {
  denominacion: "",
  detallesAdicionales: "",
  status: "PENDIENTE" as ViviendaItemStatus,
  responsable: "" as ViviendaItemResponsable | "",
  fechaSolicitud: "",
  fechaLimite: "",
  fechaEntrega: "",
  fechaCierre: "",
  linkDocumento: "",
  comentarios: "",
};

function ItemsExpedienteDialog({
  expediente,
  onClose,
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  expediente: ViviendaExpediente;
  onClose: () => void;
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [items, setItems] = useState<ViviendaExpedienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaExpedienteItem | null>(null);
  const [form, setForm] = useState(FORM_ITEM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listItems(expediente.id_expediente)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [expediente.id_expediente]);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_ITEM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(item: ViviendaExpedienteItem) {
    setEditing(item);
    setForm({
      denominacion: item.denominacion || "",
      detallesAdicionales: item.detalles_adicionales || "",
      status: item.status,
      responsable: item.responsable || "",
      fechaSolicitud: item.fecha_solicitud || "",
      fechaLimite: item.fecha_limite || "",
      fechaEntrega: item.fecha_entrega || "",
      fechaCierre: item.fecha_cierre || "",
      linkDocumento: item.link_documento || "",
      comentarios: item.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateItem(
          editing.id_item,
          {
            status: form.status,
            responsable: (form.responsable as ViviendaItemResponsable) || null,
            linkDocumento: form.linkDocumento || null,
            fechaEntrega: form.fechaEntrega || null,
            fechaCierre: form.fechaCierre || null,
            comentarios: form.comentarios || null,
          },
          actorId
        );
      } else {
        await createItem({
          expediente: expediente.id_expediente,
          denominacion: form.denominacion || null,
          detallesAdicionales: form.detallesAdicionales || null,
          status: form.status,
          responsable: (form.responsable as ViviendaItemResponsable) || null,
          fechaSolicitud: form.fechaSolicitud || null,
          fechaLimite: form.fechaLimite || null,
          linkDocumento: form.linkDocumento || null,
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

  async function handleBorrar(item: ViviendaExpedienteItem) {
    if (!window.confirm(`¿Borrar el documento "${item.denominacion || item.id_item}"?`)) return;
    try {
      await deleteItem(item.id_item);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Checklist — Expediente {expediente.id_expediente}
          <IconButton onClick={onClose} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {error && (
            <Alert severity="error" sx={{ m: 2 }}>
              {error}
            </Alert>
          )}
          {puedeCrear && (
            <Stack direction="row" sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={abrirAlta}
              >
                Agregar documento
              </Button>
            </Stack>
          )}
          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
              Sin documentos en este expediente.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Documento</TableCell>
                    <TableCell>Responsable</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Fecha límite</TableCell>
                    <TableCell>Fecha entrega</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id_item} hover>
                      <TableCell>
                        {item.link_documento ? (
                          <a href={item.link_documento} target="_blank" rel="noopener noreferrer">
                            {item.denominacion || "—"}
                          </a>
                        ) : (
                          item.denominacion || "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {item.responsable ? RESPONSABLE_LABELS[item.responsable] : "—"}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={ITEM_STATUS_LABELS[item.status]}
                          color={ITEM_STATUS_COLORS[item.status]}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{item.fecha_limite || "—"}</TableCell>
                      <TableCell>{item.fecha_entrega || "—"}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          aria-label="Editar"
                          onClick={() => abrirEdicion(item)}
                          disabled={!puedeEditar}
                        >
                          <Pencil size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Borrar"
                          onClick={() => handleBorrar(item)}
                          disabled={!puedeEditar}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? "Editar documento" : "Agregar documento"}
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
              label="Documento"
              value={form.denominacion}
              onChange={(e) => setForm({ ...form, denominacion: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Detalles adicionales"
              value={form.detallesAdicionales}
              onChange={(e) => setForm({ ...form, detallesAdicionales: e.target.value })}
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="status-label">Status</InputLabel>
                <Select
                  labelId="status-label"
                  label="Status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ViviendaItemStatus })}
                >
                  {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="responsable-label">Responsable</InputLabel>
                <Select
                  labelId="responsable-label"
                  label="Responsable"
                  value={form.responsable}
                  onChange={(e) =>
                    setForm({ ...form, responsable: e.target.value as ViviendaItemResponsable | "" })
                  }
                >
                  <MenuItem value="">—</MenuItem>
                  {Object.entries(RESPONSABLE_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {!editing && (
                <TextField
                  size="small"
                  label="Fecha solicitud"
                  type="date"
                  value={form.fechaSolicitud}
                  onChange={(e) => setForm({ ...form, fechaSolicitud: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
              {!editing && (
                <TextField
                  size="small"
                  label="Fecha límite"
                  type="date"
                  value={form.fechaLimite}
                  onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
              {editing && (
                <TextField
                  size="small"
                  label="Fecha entrega"
                  type="date"
                  value={form.fechaEntrega}
                  onChange={(e) => setForm({ ...form, fechaEntrega: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
              {editing && (
                <TextField
                  size="small"
                  label="Fecha cierre"
                  type="date"
                  value={form.fechaCierre}
                  onChange={(e) => setForm({ ...form, fechaCierre: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
            </Stack>
            <TextField
              size="small"
              label="Link documento"
              value={form.linkDocumento}
              onChange={(e) => setForm({ ...form, linkDocumento: e.target.value })}
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

const ESTADO_LABELS: Record<ViviendaExpedienteEstado, string> = {
  PENDIENTE: "Pendiente",
  "EN PROCESO": "En proceso",
  FIRMADO: "Firmado",
  CONCLUIDO: "Concluido",
  CANCELADO: "Cancelado",
};

const ESTADO_COLORS: Record<ViviendaExpedienteEstado, "default" | "info" | "success" | "error" | "warning"> = {
  PENDIENTE: "default",
  "EN PROCESO": "info",
  FIRMADO: "warning",
  CONCLUIDO: "success",
  CANCELADO: "error",
};

const FORM_VACIO = {
  vivienda: "",
  asesor: "",
  idContrato: "",
  estado: "PENDIENTE" as ViviendaExpedienteEstado,
  comentarios: "",
};

export default function ExpedientesTab({
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const searchParams = useSearchParams();
  const [expedientes, setExpedientes] = useState<ViviendaExpediente[]>([]);
  const [viviendas, setViviendas] = useState<ViviendaUnidad[]>([]);
  const [asesores, setAsesores] = useState<ViviendaAsesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaExpediente | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientesDe, setClientesDe] = useState<ViviendaExpediente | null>(null);
  const [itemsDe, setItemsDe] = useState<ViviendaExpediente | null>(null);
  const [viendo, setViendo] = useState<ViviendaExpediente | null>(null);
  const [tabEstado, setTabEstado] = useState<"PENDIENTE" | "EN PROCESO" | "FIRMADO" | "">("EN PROCESO");
  const [search, setSearch] = useState("");
  const [filtroVivienda, setFiltroVivienda] = useState(searchParams?.get("vivienda") ?? "");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const initDone = useRef(false);

  useEffect(() => {
    listViviendas().then(setViviendas).catch(() => undefined);
    listAsesores().then(setAsesores).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    const v = searchParams?.get("vivienda");
    if (v) {
      setFiltroVivienda(v);
      setTabEstado("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    setLoading(true);
    listExpedientes()
      .then(setExpedientes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  useEffect(() => { setPage(0); }, [tabEstado, search, filtroVivienda]);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(e: ViviendaExpediente) {
    setEditing(e);
    setForm({
      vivienda: e.vivienda,
      asesor: e.asesor,
      idContrato: e.id_contrato,
      estado: e.estado,
      comentarios: e.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && (!form.vivienda || !form.asesor || !form.idContrato.trim())) {
      setFormError("Vivienda, asesor y contrato son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateExpediente(
          editing.id_expediente,
          { estado: form.estado, comentarios: form.comentarios || null },
          actorId
        );
      } else {
        await createExpediente({
          vivienda: form.vivienda,
          asesor: form.asesor,
          idContrato: form.idContrato,
          estado: form.estado,
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

  const expedientesFiltrados = expedientes.filter((e) => {
    if (filtroVivienda && e.vivienda !== filtroVivienda) return false;
    if (tabEstado && e.estado !== tabEstado) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.vivienda_denominacion?.toLowerCase().includes(q) ||
        e.asesor_nombre?.toLowerCase().includes(q) ||
        e.id_contrato?.toLowerCase().includes(q)
      );
    }
    return true;
  });

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
        searchPlaceholder="Buscar por vivienda, asesor o contrato..."
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileSpreadsheet size={14} strokeWidth={2} />}
              disabled={expedientes.length === 0}
              onClick={() =>
                descargarCsv(
                  expedientes.map((e) => ({
                    Vivienda: e.vivienda_denominacion ?? "",
                    Asesor: e.asesor_nombre,
                    Contrato: e.id_contrato,
                    Estado: e.estado,
                    "Fecha cierre": e.fecha_cierre ?? "",
                    Comentarios: e.comentarios ?? "",
                  })),
                  "expedientes-vivienda.csv"
                )
              }
            >
              Descargar CSV
            </Button>
            {puedeCrear && (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={abrirAlta}
              >
                Nuevo Expediente
              </Button>
            )}
          </Stack>
        }
      >
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="filtro-viv-label">Vivienda</InputLabel>
          <Select
            labelId="filtro-viv-label"
            label="Vivienda"
            value={filtroVivienda}
            onChange={(e) => setFiltroVivienda(e.target.value)}
          >
            <MenuItem value="">Todas</MenuItem>
            {viviendas.map((v) => (
              <MenuItem key={v.id_vivienda} value={v.id_vivienda}>
                {v.denominacion || v.num_oficial || v.id_vivienda}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FiltrosBar>

      <Paper variant="outlined">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ px: 2, pt: 1.5, pb: 0 }}>
          <Tabs
            value={tabEstado}
            onChange={(_, v) => setTabEstado(v)}
            sx={{ borderBottom: "none", minHeight: 36 }}
            TabIndicatorProps={{ style: { bottom: 0 } }}
          >
            <Tab label="En proceso" value="EN PROCESO" sx={{ minHeight: 36, py: 0.5 }} />
            <Tab label="Pendientes" value="PENDIENTE" sx={{ minHeight: 36, py: 0.5 }} />
            <Tab label="Firmados" value="FIRMADO" sx={{ minHeight: 36, py: 0.5 }} />
            <Tab label="Todos" value="" sx={{ minHeight: 36, py: 0.5 }} />
          </Tabs>
        </Stack>
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Vivienda</TableCell>
                <TableCell>Asesor</TableCell>
                <TableCell>Contrato</TableCell>
                <TableCell>Estado</TableCell>
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
              ) : expedientesFiltrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin expedientes registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                expedientesFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((e) => (
                  <TableRow key={e.id_expediente} hover>
                    <TableCell>{e.vivienda_denominacion || "—"}</TableCell>
                    <TableCell>{e.asesor_nombre}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id_contrato}</TableCell>
                    <TableCell>
                      <Chip size="small" label={ESTADO_LABELS[e.estado]} color={ESTADO_COLORS[e.estado]} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Ver detalle" onClick={() => setViendo(e)}>
                        <Eye size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Checklist" onClick={() => setItemsDe(e)}>
                        <CheckSquare size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Clientes" onClick={() => setClientesDe(e)}>
                        <Users size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(e)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
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
          count={expedientesFiltrados.length}
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
          {editing ? `Editar Expediente ${editing.id_expediente}` : "Nuevo Expediente"}
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
              <>
                <FormControl size="small" fullWidth>
                  <InputLabel id="vivienda-label">Vivienda</InputLabel>
                  <Select
                    labelId="vivienda-label"
                    label="Vivienda"
                    value={form.vivienda}
                    onChange={(e) => setForm({ ...form, vivienda: e.target.value })}
                  >
                    {viviendas.map((v) => (
                      <MenuItem key={v.id_vivienda} value={v.id_vivienda}>
                        {v.denominacion || v.num_oficial || v.id_vivienda} ({v.proyecto_denominacion})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel id="asesor-label">Asesor</InputLabel>
                  <Select
                    labelId="asesor-label"
                    label="Asesor"
                    value={form.asesor}
                    onChange={(e) => setForm({ ...form, asesor: e.target.value })}
                  >
                    {asesores.map((a) => (
                      <MenuItem key={a.id_asesor} value={a.id_asesor}>
                        {a.nombre}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="ID de contrato (Tesorería)"
                  value={form.idContrato}
                  onChange={(e) => setForm({ ...form, idContrato: e.target.value })}
                  helperText="Formato sociedad-contraparte-consecutivo, generado en Tesorería"
                  fullWidth
                />
              </>
            )}
            <FormControl size="small" fullWidth>
              <InputLabel id="estado-label">Estado</InputLabel>
              <Select
                labelId="estado-label"
                label="Estado"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as ViviendaExpedienteEstado })}
              >
                {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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

      {clientesDe && (
        <ClientesExpedienteDialog
          expediente={clientesDe}
          onClose={() => setClientesDe(null)}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
          actorId={actorId}
        />
      )}

      {itemsDe && (
        <ItemsExpedienteDialog
          expediente={itemsDe}
          onClose={() => setItemsDe(null)}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
          actorId={actorId}
        />
      )}

      {viendo && (
        <Dialog open onClose={() => setViendo(null)} fullWidth maxWidth="sm">
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="h6" sx={{ fontFamily: "var(--font-mono, monospace)", fontSize: 16 }}>
                {viendo.id_expediente.slice(0, 8).toUpperCase()}
              </Typography>
              <Chip size="small" label={ESTADO_LABELS[viendo.estado]} color={ESTADO_COLORS[viendo.estado]} variant="outlined" />
            </Stack>
            <IconButton onClick={() => setViendo(null)} size="small" aria-label="Cerrar">
              <CloseIcon size={18} strokeWidth={1.5} />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 0 }}>
            <Stack spacing={0}>
              {([
                ["Vivienda", viendo.vivienda_denominacion],
                ["Asesor", viendo.asesor_nombre],
                ["Contrato", viendo.id_contrato],
                ["Estado", viendo.estado],
                ["Medio de pago", viendo.medio_pago],
                ["Pagos en efectivo", viendo.pagos_efectivo != null ? (viendo.pagos_efectivo ? "Sí" : "No") : null],
                ["Fecha cierre", viendo.fecha_cierre],
                ["Comentarios", viendo.comentarios],
                ["Creado por", viendo.created_by],
                ["Creado el", viendo.created_at ? new Date(viendo.created_at).toLocaleString("es-MX") : null],
                ["Actualizado por", viendo.updated_by],
                ["Actualizado el", viendo.updated_at ? new Date(viendo.updated_at).toLocaleString("es-MX") : null],
              ] as [string, string | null | undefined][]).map(([label, value], i) => (
                <Stack
                  key={label}
                  direction="row"
                  sx={{ px: 3, py: 1, bgcolor: i % 2 === 0 ? "action.hover" : "transparent" }}
                  spacing={2}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160, flexShrink: 0 }}>
                    {label}
                  </Typography>
                  <Typography variant="body2">{value || "—"}</Typography>
                </Stack>
              ))}
              {viendo.link_expediente && (
                <Stack
                  direction="row"
                  sx={{ px: 3, py: 1, bgcolor: "transparent" }}
                  spacing={2}
                  alignItems="center"
                >
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160, flexShrink: 0 }}>
                    Link expediente
                  </Typography>
                  <Typography
                    variant="body2"
                    component="a"
                    href={viendo.link_expediente}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: "primary.main", wordBreak: "break-all" }}
                  >
                    Abrir en Drive
                  </Typography>
                </Stack>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setViendo(null)}>Cerrar</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
