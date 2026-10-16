"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,

  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  Menu,
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
  Divider,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowLeft, ExternalLink, Eye, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import ContraparteSelector from "@/components/ContraparteSelector";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";

import { SessionUser, getSession } from "@/lib/auth";
import { TesoreriaContraparte, getContraparte } from "@/lib/tesoreria";
import { downloadDriveFile, driveFileIdFromUrl } from "@/lib/drive";
import {
  ViviendaClienteExpediente,
  ViviendaClienteTipo,
  ViviendaExpediente,
  ViviendaExpedienteEstado,
  ViviendaExpedienteItem,
  ViviendaItemResponsable,
  ViviendaItemStatus,
  createClienteExpediente,
  createItem,
  deleteClienteExpediente,
  deleteItem,
  listClientesExpediente,
  listExpedientes,
  listItems,
  updateExpediente,
  updateItem,
} from "@/lib/vivienda";

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

const ITEM_STATUS_LABELS: Record<ViviendaItemStatus, string> = {
  PENDIENTE: "Pendiente",
  "NO APLICA": "No aplica",
  INCOMPLETO: "Incompleto",
  ENTREGADO: "Entregado",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  POSPUESTO: "Pospuesto",
};

const ITEM_STATUS_COLORS: Record<ViviendaItemStatus, "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "error",
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

const TIPO_CLIENTE_LABELS: Record<ViviendaClienteTipo, string> = {
  ACREDITADO: "Acreditado",
  COACREDITADO: "Coacreditado",
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

type Tab = "general" | "checklist" | "clientes";

export default function ExpedienteDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<SessionUser | null>(null);
  const [expediente, setExpediente] = useState<ViviendaExpediente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("general");

  // Edición del expediente
  const [editando, setEditando] = useState(false);
  const [formEstado, setFormEstado] = useState<ViviendaExpedienteEstado>("PENDIENTE");
  const [formComentarios, setFormComentarios] = useState("");
  const [formFechaCierre, setFormFechaCierre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  // Checklist
  const [items, setItems] = useState<ViviendaExpedienteItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [dialogItemOpen, setDialogItemOpen] = useState(false);
  const [editandoItem, setEditandoItem] = useState<ViviendaExpedienteItem | null>(null);
  const [formItem, setFormItem] = useState(FORM_ITEM_VACIO);
  const [savingItem, setSavingItem] = useState(false);
  const [formItemError, setFormItemError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuItem, setMenuItemState] = useState<ViviendaExpedienteItem | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [previewDocBlobUrl, setPreviewDocBlobUrl] = useState<string | null>(null);
  const [fallbackDocUrl, setFallbackDocUrl] = useState<string | null>(null);

  // Clientes
  const [clientes, setClientes] = useState<(ViviendaClienteExpediente & { contraparteNombre?: string })[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);
  const [clientesError, setClientesError] = useState<string | null>(null);
  const [nuevaContraparte, setNuevaContraparte] = useState<TesoreriaContraparte | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState<ViviendaClienteTipo>("ACREDITADO");
  const [agregando, setAgregando] = useState(false);

  const puedeCrear = session?.perm_keys.includes("ventas-vivienda.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("ventas-vivienda.editar") ?? false;
  const actorId = session?.user_id ?? "desconocido";

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  function cargarExpediente() {
    setLoading(true);
    setError(null);
    listExpedientes()
      .then((lista) => {
        const found = lista.find((e) => e.id_expediente === params.id);
        if (!found) {
          setError("Expediente no encontrado");
        } else {
          setExpediente(found);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargarExpediente();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function cargarItems() {
    if (!expediente) return;
    setItemsLoading(true);
    setItemsError(null);
    listItems(expediente.id_expediente)
      .then(setItems)
      .catch((err) => setItemsError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setItemsLoading(false));
  }

  function cargarClientes() {
    if (!expediente) return;
    setClientesLoading(true);
    setClientesError(null);
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
      .catch((err) => setClientesError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setClientesLoading(false));
  }

  useEffect(() => {
    if (!expediente) return;
    if (tab === "checklist") cargarItems();
    if (tab === "clientes") cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, expediente]);

  function iniciarEdicion() {
    if (!expediente) return;
    setFormEstado(expediente.estado);
    setFormComentarios(expediente.comentarios || "");
    setFormFechaCierre(expediente.fecha_cierre || "");
    setErrorEdicion(null);
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!expediente) return;
    setGuardando(true);
    setErrorEdicion(null);
    try {
      const updated = await updateExpediente(
        expediente.id_expediente,
        {
          estado: formEstado,
          comentarios: formComentarios || null,
          fechaCierre: formFechaCierre || null,
        },
        actorId
      );
      setExpediente(updated);
      setEditando(false);
    } catch (err) {
      setErrorEdicion(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  function abrirAltaItem() {
    setEditandoItem(null);
    setFormItem(FORM_ITEM_VACIO);
    setFormItemError(null);
    setDialogItemOpen(true);
  }

  function abrirEdicionItem(item: ViviendaExpedienteItem) {
    setEditandoItem(item);
    setFormItem({
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
    setFormItemError(null);
    setDialogItemOpen(true);
  }

  async function guardarItem() {
    if (!expediente) return;
    setSavingItem(true);
    setFormItemError(null);
    try {
      if (editandoItem) {
        await updateItem(
          editandoItem.id_item,
          {
            status: formItem.status,
            responsable: (formItem.responsable as ViviendaItemResponsable) || null,
            linkDocumento: formItem.linkDocumento || null,
            fechaEntrega: formItem.fechaEntrega || null,
            fechaCierre: formItem.fechaCierre || null,
            comentarios: formItem.comentarios || null,
          },
          actorId
        );
      } else {
        await createItem({
          expediente: expediente.id_expediente,
          denominacion: formItem.denominacion || null,
          detallesAdicionales: formItem.detallesAdicionales || null,
          status: formItem.status,
          responsable: (formItem.responsable as ViviendaItemResponsable) || null,
          fechaSolicitud: formItem.fechaSolicitud || null,
          fechaLimite: formItem.fechaLimite || null,
          linkDocumento: formItem.linkDocumento || null,
          comentarios: formItem.comentarios || null,
          actorId,
        });
      }
      setDialogItemOpen(false);
      cargarItems();
    } catch (err) {
      setFormItemError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSavingItem(false);
    }
  }

  async function borrarItem(item: ViviendaExpedienteItem) {
    if (!window.confirm(`¿Borrar "${item.denominacion || item.id_item}"?`)) return;
    try {
      await deleteItem(item.id_item);
      cargarItems();
    } catch (err) {
      setItemsError(err instanceof Error ? err.message : "Error al borrar");
    }
  }

  async function verDocumento(item: ViviendaExpedienteItem) {
    if (!item.link_documento) return;
    const fileId = driveFileIdFromUrl(item.link_documento);
    if (!fileId) {
      setFallbackDocUrl(item.link_documento);
      return;
    }
    setLoadingDocId(item.id_item);
    try {
      const blobUrl = await downloadDriveFile(fileId, "ventas-vivienda.editar");
      if (previewDocBlobUrl) URL.revokeObjectURL(previewDocBlobUrl);
      setFallbackDocUrl(null);
      setPreviewDocBlobUrl(blobUrl);
    } catch {
      setFallbackDocUrl(item.link_documento);
    } finally {
      setLoadingDocId(null);
    }
  }

  async function agregarCliente() {
    if (!expediente || !nuevaContraparte) return;
    setAgregando(true);
    setClientesError(null);
    try {
      await createClienteExpediente({
        expediente: expediente.id_expediente,
        idContraparte: nuevaContraparte.id_contraparte,
        tipo: nuevoTipo,
        actorId,
      });
      setNuevaContraparte(null);
      cargarClientes();
    } catch (err) {
      setClientesError(err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setAgregando(false);
    }
  }

  async function quitarCliente(cliente: ViviendaClienteExpediente) {
    if (!window.confirm("¿Quitar este cliente del expediente?")) return;
    try {
      await deleteClienteExpediente(cliente.id_rel_viv_exp_cliente);
      cargarClientes();
    } catch (err) {
      setClientesError(err instanceof Error ? err.message : "Error al quitar");
    }
  }

  return (
    <AppShell>
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
        onClick={() => router.push("/ventas-vivienda/expedientes")}
        sx={{ mb: 2 }}
      >
        Volver a expedientes
      </Button>

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {expediente && (
        <Grid container spacing={3}>
          {/* Columna izquierda */}
          <Grid item xs={12} md={3}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {expediente.vivienda_denominacion || expediente.vivienda}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                {expediente.id_expediente}
              </Typography>
              <Chip
                size="small"
                label={ESTADO_LABELS[expediente.estado]}
                color={ESTADO_COLORS[expediente.estado]}
                variant="outlined"
                sx={{ mb: 2 }}
              />

              {!editando ? (
                puedeEditar && (
                  <Button size="small" variant="outlined" fullWidth onClick={iniciarEdicion}>
                    Editar estado
                  </Button>
                )
              ) : (
                <Stack spacing={1.5}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Estado</InputLabel>
                    <Select
                      label="Estado"
                      value={formEstado}
                      onChange={(e) => setFormEstado(e.target.value as ViviendaExpedienteEstado)}
                    >
                      {(Object.keys(ESTADO_LABELS) as ViviendaExpedienteEstado[]).map((e) => (
                        <MenuItem key={e} value={e}>{ESTADO_LABELS[e]}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    label="Fecha de cierre"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={formFechaCierre}
                    onChange={(e) => setFormFechaCierre(e.target.value)}
                  />
                  <TextField
                    size="small"
                    label="Comentarios"
                    multiline
                    rows={2}
                    fullWidth
                    value={formComentarios}
                    onChange={(e) => setFormComentarios(e.target.value)}
                  />
                  {errorEdicion && <Alert severity="error" sx={{ fontSize: 12 }}>{errorEdicion}</Alert>}
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="contained" onClick={guardarEdicion} disabled={guardando} fullWidth>
                      {guardando ? <CircularProgress size={14} /> : "Guardar"}
                    </Button>
                    <Button size="small" onClick={() => setEditando(false)} fullWidth>
                      Cancelar
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
              <Stack spacing={1}>
                {[
                  { label: "Asesor", value: expediente.asesor_nombre || expediente.asesor },
                  { label: "Contrato", value: expediente.id_contrato || "—" },
                  { label: "Medio de pago", value: expediente.medio_pago || "—" },
                  { label: "Pagos en efectivo", value: expediente.pagos_efectivo === true ? "Sí" : expediente.pagos_efectivo === false ? "No" : "—" },
                  { label: "Fecha de cierre", value: expediente.fecha_cierre || "—" },
                  { label: "Creado", value: expediente.created_at ? new Date(expediente.created_at).toLocaleDateString("es-MX") : "—" },
                ].map(({ label, value }) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2">{value}</Typography>
                  </Box>
                ))}
                {expediente.comentarios && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Comentarios</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{expediente.comentarios}</Typography>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid>

          {/* Columna derecha: tabs */}
          <Grid item xs={12} md={9}>
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}
              >
                <Tab label="General" value="general" />
                <Tab label="Checklist" value="checklist" />
                <Tab label="Clientes" value="clientes" />
              </Tabs>

              <Box sx={{ p: 3 }}>
                {/* Tab General */}
                {tab === "general" && (
                  <Stack spacing={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Información del expediente
                    </Typography>
                    <Grid container spacing={2}>
                      {[
                        { label: "ID Expediente", value: expediente.id_expediente },
                        { label: "Vivienda", value: expediente.vivienda_denominacion || expediente.vivienda },
                        { label: "Asesor", value: expediente.asesor_nombre || expediente.asesor },
                        { label: "Contrato (Tesorería)", value: expediente.id_contrato || "—" },
                        { label: "Estado", value: ESTADO_LABELS[expediente.estado] },
                        { label: "Medio de pago", value: expediente.medio_pago || "—" },
                        { label: "Pagos en efectivo", value: expediente.pagos_efectivo === true ? "Sí" : expediente.pagos_efectivo === false ? "No" : "—" },
                        { label: "Fecha de cierre", value: expediente.fecha_cierre || "—" },
                        { label: "Link expediente", value: expediente.link_expediente || "—" },
                      ].map(({ label, value }) => (
                        <Grid item xs={12} sm={6} key={label}>
                          <Typography variant="caption" color="text.secondary">{label}</Typography>
                          <Typography variant="body2">
                            {label === "Link expediente" && expediente.link_expediente ? (
                              <a href={expediente.link_expediente} target="_blank" rel="noreferrer">
                                Ver en Drive
                              </a>
                            ) : value}
                          </Typography>
                        </Grid>
                      ))}
                    </Grid>
                    {expediente.comentarios && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Comentarios</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                          {expediente.comentarios}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                )}

                {/* Tab Checklist */}
                {tab === "checklist" && (
                  <>
                    {puedeCrear && (
                      <Stack direction="row" sx={{ mb: 2 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Plus size={14} strokeWidth={2} />}
                          onClick={abrirAltaItem}
                        >
                          Agregar documento
                        </Button>
                      </Stack>
                    )}
                    {itemsError && <Alert severity="error" sx={{ mb: 2 }}>{itemsError}</Alert>}
                    {itemsLoading ? (
                      <Stack alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={20} />
                      </Stack>
                    ) : items.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
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
                                <TableCell>{item.denominacion || "—"}</TableCell>
                                <TableCell>
                                  {item.responsable ? RESPONSABLE_LABELS[item.responsable] : "—"}
                                </TableCell>
                                <TableCell>
                                  <Chip
                                    size="small"
                                    label={ITEM_STATUS_LABELS[item.status]}
                                    color={ITEM_STATUS_COLORS[item.status]}
                                  />
                                </TableCell>
                                <TableCell>{item.fecha_limite || "—"}</TableCell>
                                <TableCell>{item.fecha_entrega || "—"}</TableCell>
                                <TableCell align="right">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      setMenuAnchor(e.currentTarget);
                                      setMenuItemState(item);
                                    }}
                                  >
                                    {loadingDocId === item.id_item ? (
                                      <CircularProgress size={14} />
                                    ) : (
                                      <MoreVertical size={14} strokeWidth={1.5} />
                                    )}
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </>
                )}

                {/* Tab Clientes */}
                {tab === "clientes" && (
                  <>
                    {clientesError && <Alert severity="error" sx={{ mb: 2 }}>{clientesError}</Alert>}
                    {clientesLoading ? (
                      <Stack alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={20} />
                      </Stack>
                    ) : clientes.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Sin clientes registrados en este expediente.
                      </Typography>
                    ) : (
                      <Table size="small" sx={{ mb: 3 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell>Contraparte</TableCell>
                            <TableCell>Tipo</TableCell>
                            {puedeEditar && <TableCell align="right">Acciones</TableCell>}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {clientes.map((c) => (
                            <TableRow key={c.id_rel_viv_exp_cliente}>
                              <TableCell>{c.contraparteNombre || c.id_contraparte}</TableCell>
                              <TableCell>{TIPO_CLIENTE_LABELS[c.tipo]}</TableCell>
                              {puedeEditar && (
                                <TableCell align="right">
                                  <IconButton size="small" onClick={() => quitarCliente(c)} aria-label="Quitar">
                                    <Trash2 size={14} strokeWidth={1.5} />
                                  </IconButton>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {puedeCrear && (
                      <Stack spacing={1.5} sx={{ pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
                        <Typography variant="subtitle2">Agregar cliente</Typography>
                        <ContraparteSelector
                          value={nuevaContraparte}
                          onChange={setNuevaContraparte}
                          label="Contraparte"
                        />
                        <FormControl size="small" sx={{ maxWidth: 200 }}>
                          <InputLabel>Tipo</InputLabel>
                          <Select
                            label="Tipo"
                            value={nuevoTipo}
                            onChange={(e) => setNuevoTipo(e.target.value as ViviendaClienteTipo)}
                          >
                            <MenuItem value="ACREDITADO">Acreditado</MenuItem>
                            <MenuItem value="COACREDITADO">Coacreditado</MenuItem>
                          </Select>
                        </FormControl>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={agregarCliente}
                          disabled={!nuevaContraparte || agregando}
                          sx={{ alignSelf: "flex-start" }}
                        >
                          {agregando ? <CircularProgress size={14} /> : "Agregar"}
                        </Button>
                      </Stack>
                    )}
                  </>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Menú de acciones de item */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => { setMenuAnchor(null); setMenuItemState(null); }}
      >
        <MenuItem
          disabled={!menuItem?.link_documento}
          onClick={async () => {
            setMenuAnchor(null);
            if (!menuItem?.link_documento) return;
            const fileId = driveFileIdFromUrl(menuItem.link_documento);
            if (!fileId) { setFallbackDocUrl(menuItem.link_documento); return; }
            setLoadingDocId(menuItem.id_item);
            try {
              const blob = await downloadDriveFile(fileId, "ventas-vivienda.editar");
              if (previewDocBlobUrl) URL.revokeObjectURL(previewDocBlobUrl);
              setFallbackDocUrl(null);
              setPreviewDocBlobUrl(blob);
            } catch { setFallbackDocUrl(menuItem.link_documento); }
            finally { setLoadingDocId(null); setMenuItemState(null); }
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Eye size={14} strokeWidth={1.5} />
            <span>Vista previa</span>
          </Stack>
        </MenuItem>
        <MenuItem
          disabled={!menuItem?.link_documento}
          component="a"
          href={menuItem?.link_documento ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => { setMenuAnchor(null); setMenuItemState(null); }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <ExternalLink size={14} strokeWidth={1.5} />
            <span>Abrir enlace</span>
          </Stack>
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={!puedeEditar}
          onClick={() => { setMenuAnchor(null); if (menuItem) abrirEdicionItem(menuItem); setMenuItemState(null); }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Pencil size={14} strokeWidth={1.5} />
            <span>Editar</span>
          </Stack>
        </MenuItem>
        <MenuItem
          disabled={!puedeEditar}
          onClick={() => { setMenuAnchor(null); if (menuItem) borrarItem(menuItem); setMenuItemState(null); }}
          sx={{ color: "error.main" }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Trash2 size={14} strokeWidth={1.5} />
            <span>Borrar</span>
          </Stack>
        </MenuItem>
      </Menu>

      {/* Dialog alta/edición de item */}
      <Dialog open={dialogItemOpen} onClose={() => setDialogItemOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editandoItem ? "Editar documento" : "Agregar documento"}
        </DialogTitle>
        <DialogContent dividers>
          {formItemError && <Alert severity="error" sx={{ mb: 2 }}>{formItemError}</Alert>}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Documento"
              value={formItem.denominacion}
              onChange={(e) => setFormItem({ ...formItem, denominacion: e.target.value })}
              fullWidth
              disabled={!!editandoItem}
            />
            <TextField
              size="small"
              label="Detalles adicionales"
              value={formItem.detallesAdicionales}
              onChange={(e) => setFormItem({ ...formItem, detallesAdicionales: e.target.value })}
              fullWidth
              disabled={!!editandoItem}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  label="Status"
                  value={formItem.status}
                  onChange={(e) => setFormItem({ ...formItem, status: e.target.value as ViviendaItemStatus })}
                >
                  {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Responsable</InputLabel>
                <Select
                  label="Responsable"
                  value={formItem.responsable}
                  onChange={(e) => setFormItem({ ...formItem, responsable: e.target.value as ViviendaItemResponsable | "" })}
                >
                  <MenuItem value="">—</MenuItem>
                  {Object.entries(RESPONSABLE_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {!editandoItem && (
                <TextField
                  size="small"
                  label="Fecha solicitud"
                  type="date"
                  value={formItem.fechaSolicitud}
                  onChange={(e) => setFormItem({ ...formItem, fechaSolicitud: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
              {!editandoItem && (
                <TextField
                  size="small"
                  label="Fecha límite"
                  type="date"
                  value={formItem.fechaLimite}
                  onChange={(e) => setFormItem({ ...formItem, fechaLimite: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
              {editandoItem && (
                <TextField
                  size="small"
                  label="Fecha entrega"
                  type="date"
                  value={formItem.fechaEntrega}
                  onChange={(e) => setFormItem({ ...formItem, fechaEntrega: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
              {editandoItem && (
                <TextField
                  size="small"
                  label="Fecha cierre"
                  type="date"
                  value={formItem.fechaCierre}
                  onChange={(e) => setFormItem({ ...formItem, fechaCierre: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              )}
            </Stack>
            <TextField
              size="small"
              label="Link documento"
              value={formItem.linkDocumento}
              onChange={(e) => setFormItem({ ...formItem, linkDocumento: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Comentarios"
              value={formItem.comentarios}
              onChange={(e) => setFormItem({ ...formItem, comentarios: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogItemOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={guardarItem} disabled={savingItem}>
            {savingItem ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <DocumentoPreviewDialog
        open={!!previewDocBlobUrl || !!fallbackDocUrl}
        onClose={() => {
          if (previewDocBlobUrl) URL.revokeObjectURL(previewDocBlobUrl);
          setPreviewDocBlobUrl(null);
          setFallbackDocUrl(null);
        }}
        url={previewDocBlobUrl}
        urlExterna={fallbackDocUrl}
        titulo="Documento"
      />
    </AppShell>
  );
}
