"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ChevronRight, FileSpreadsheet, X } from "lucide-react";
import {
  ViviendaExpedienteItem,
  ViviendaExpedienteEstado,
  ViviendaItemStatus,
  ViviendaItemResponsable,
  listItemsByDenominacion,
  updateItem,
} from "@/lib/vivienda";
import { SessionUser, getSession } from "@/lib/auth";
import FiltrosBar from "@/components/FiltrosBar";
import { descargarCsv } from "@/lib/descargarCsv";

const ITEM_STATUS_COLORS: Record<ViviendaItemStatus, "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "error",
  "NO APLICA": "default",
  INCOMPLETO: "warning",
  ENTREGADO: "info",
  APROBADO: "success",
  RECHAZADO: "error",
  POSPUESTO: "warning",
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

const RESPONSABLE_LABELS: Record<ViviendaItemResponsable, string> = {
  VENTAS: "Ventas",
  ESCRITURACION: "Escrituración",
  TESORERIA: "Tesorería",
  CONTABILIDAD: "Contabilidad",
  LEGAL: "Legal",
};

const EXPEDIENTE_ESTADO_COLORS: Record<ViviendaExpedienteEstado, "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  "EN PROCESO": "info",
  FIRMADO: "warning",
  CONCLUIDO: "success",
  CANCELADO: "error",
};

function fmtFecha(f: string | null): string {
  if (!f) return "—";
  const d = new Date(f);
  return isNaN(d.getTime()) ? f : d.toLocaleDateString("es-MX");
}

type TabStatus = ViviendaItemStatus | "";
type TabConfig = { label: string; value: TabStatus }[];

export default function VistosBuenosTab({
  denominacion,
  tabs,
  defaultTab,
  nombreArchivo = "vistos-buenos",
}: {
  denominacion: string;
  tabs?: TabConfig;
  defaultTab?: TabStatus;
  nombreArchivo?: string;
}) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));

  const [session, setSession] = useState<SessionUser | null>(null);
  const [items, setItems] = useState<ViviendaExpedienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabStatus>(defaultTab ?? "APROBADO");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Dialog de detalle/edición
  const [seleccionado, setSeleccionado] = useState<ViviendaExpedienteItem | null>(null);
  const [formStatus, setFormStatus] = useState<ViviendaItemStatus>("PENDIENTE");
  const [formResponsable, setFormResponsable] = useState<ViviendaItemResponsable | "">("");
  const [formFechaEntrega, setFormFechaEntrega] = useState("");
  const [formFechaCierre, setFormFechaCierre] = useState("");
  const [formLinkDocumento, setFormLinkDocumento] = useState("");
  const [formComentarios, setFormComentarios] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const puedeEditar = session?.perm_keys.includes("ventas-vivienda.editar") ?? false;

  function cargar() {
    setLoading(true);
    listItemsByDenominacion(denominacion)
      .then(setItems)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { getSession().then(setSession); }, []);
  useEffect(() => { cargar(); }, [denominacion]);
  useEffect(() => { setPage(0); }, [tab, search]);

  function abrirDetalle(item: ViviendaExpedienteItem) {
    setSeleccionado(item);
    setFormStatus(item.status);
    setFormResponsable(item.responsable || "");
    setFormFechaEntrega(item.fecha_entrega || "");
    setFormFechaCierre(item.fecha_cierre || "");
    setFormLinkDocumento(item.link_documento || "");
    setFormComentarios(item.comentarios || "");
    setErrorGuardar(null);
  }

  async function guardar() {
    if (!seleccionado || !session) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const updated = await updateItem(
        seleccionado.id_item,
        {
          status: formStatus,
          responsable: (formResponsable as ViviendaItemResponsable) || null,
          fechaEntrega: formFechaEntrega || null,
          fechaCierre: formFechaCierre || null,
          linkDocumento: formLinkDocumento || null,
          comentarios: formComentarios || null,
        },
        session.user_id
      );
      setItems((prev) => prev.map((i) => i.id_item === updated.id_item ? updated : i));
      setSeleccionado(updated);
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) return <CircularProgress size={24} sx={{ mt: 2 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  const visibles = items.filter((i) => {
    if (tabs && tab && i.status !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.expediente_vivienda_denominacion?.toLowerCase().includes(q) ||
        i.expediente?.toLowerCase().includes(q) ||
        i.responsable?.toLowerCase().includes(q) ||
        i.comentarios?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <>
      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por vivienda, expediente o responsable..."
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileSpreadsheet size={14} strokeWidth={2} />}
            disabled={visibles.length === 0}
            onClick={() =>
              descargarCsv(
                visibles.map((i) => ({
                  Vivienda: i.expediente_vivienda_denominacion ?? "",
                  Expediente: i.expediente,
                  "Estado expediente": i.expediente_estado ?? "",
                  "Visto bueno": i.status,
                  Responsable: i.responsable ?? "",
                  "Fecha cierre": i.fecha_cierre ?? "",
                  Comentarios: i.comentarios ?? "",
                })),
                `${nombreArchivo}.csv`
              )
            }
          >
            Descargar CSV
          </Button>
        }
      />
      <Paper variant="outlined">
        {tabs && (
          <>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1, minHeight: 36 }}>
              {tabs.map((t) => (
                <Tab key={t.value} label={t.label} value={t.value} sx={{ minHeight: 36, py: 0.5 }} />
              ))}
            </Tabs>
            <Divider />
          </>
        )}
        {visibles.length === 0 ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <Typography variant="body2" color="text.secondary">Sin registros.</Typography>
          </Stack>
        ) : esMovil ? (
          <Stack spacing={1} sx={{ p: 1.5 }}>
            {visibles.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((item) => (
              <Card key={item.id_item} variant="outlined">
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Typography variant="body2" fontWeight={600}>{item.expediente_vivienda_denominacion ?? "—"}</Typography>
                    <IconButton size="small" onClick={() => abrirDetalle(item)}>
                      <ChevronRight size={16} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {item.expediente_estado && <Chip label={item.expediente_estado} size="small" color={EXPEDIENTE_ESTADO_COLORS[item.expediente_estado] ?? "default"} />}
                    <Chip label={ITEM_STATUS_LABELS[item.status]} size="small" color={ITEM_STATUS_COLORS[item.status]} />
                  </Stack>
                  {item.responsable && <Typography variant="caption" color="text.secondary" display="block">{item.responsable}</Typography>}
                  {item.fecha_cierre && <Typography variant="caption" color="text.secondary" display="block">{fmtFecha(item.fecha_cierre)}</Typography>}
                </CardContent>
              </Card>
            ))}
          </Stack>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Vivienda</TableCell>
                  <TableCell>Expediente</TableCell>
                  <TableCell>Estado expediente</TableCell>
                  <TableCell>Visto bueno</TableCell>
                  <TableCell>Responsable</TableCell>
                  <TableCell>Fecha cierre</TableCell>
                  <TableCell>Comentarios</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((item) => (
                  <TableRow key={item.id_item} hover>
                    <TableCell>{item.expediente_vivienda_denominacion ?? "—"}</TableCell>
                    <TableCell><Typography variant="caption" fontFamily="monospace">{item.expediente.slice(0, 8).toUpperCase()}</Typography></TableCell>
                    <TableCell>{item.expediente_estado ? <Chip label={item.expediente_estado} size="small" color={EXPEDIENTE_ESTADO_COLORS[item.expediente_estado] ?? "default"} /> : "—"}</TableCell>
                    <TableCell><Chip label={ITEM_STATUS_LABELS[item.status]} size="small" color={ITEM_STATUS_COLORS[item.status]} /></TableCell>
                    <TableCell>{item.responsable ?? "—"}</TableCell>
                    <TableCell>{fmtFecha(item.fecha_cierre)}</TableCell>
                    <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>{item.comentarios || "—"}</Typography></TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => abrirDetalle(item)}>
                        <ChevronRight size={16} strokeWidth={1.5} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination
          component="div"
          count={visibles.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Filas:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>

      {/* Dialog de detalle/edición */}
      <Dialog
        open={!!seleccionado}
        onClose={() => setSeleccionado(null)}
        fullWidth
        maxWidth="md"
        disableEscapeKeyDown
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1" fontWeight={600}>
              {seleccionado?.denominacion ?? "Visto bueno"}
            </Typography>
            <IconButton size="small" onClick={() => setSeleccionado(null)}>
              <X size={16} strokeWidth={1.5} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {seleccionado && (
            <Grid container spacing={3}>
              {/* Columna izquierda — datos del item */}
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1.5}>
                    <Chip
                      label={ITEM_STATUS_LABELS[seleccionado.status]}
                      color={ITEM_STATUS_COLORS[seleccionado.status]}
                      size="small"
                      sx={{ alignSelf: "flex-start" }}
                    />
                    <Divider />
                    {[
                      { label: "Expediente", value: seleccionado.expediente },
                      { label: "Vivienda", value: seleccionado.expediente_vivienda_denominacion },
                      { label: "Responsable", value: seleccionado.responsable ? RESPONSABLE_LABELS[seleccionado.responsable] : null },
                      { label: "Fecha solicitud", value: fmtFecha(seleccionado.fecha_solicitud) },
                      { label: "Fecha límite", value: fmtFecha(seleccionado.fecha_limite) },
                      { label: "Fecha entrega", value: fmtFecha(seleccionado.fecha_entrega) },
                      { label: "Fecha cierre", value: fmtFecha(seleccionado.fecha_cierre) },
                      { label: "Creado por", value: seleccionado.created_by },
                      { label: "Actualizado por", value: seleccionado.updated_by },
                    ].map(({ label, value }) => (
                      <Box key={label}>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                        <Typography variant="body2">{value ?? "—"}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Paper>
              </Grid>

              {/* Columna derecha — formulario */}
              <Grid item xs={12} md={8}>
                <Stack spacing={2}>
                  <Typography variant="subtitle2">Editar</Typography>
                  {errorGuardar && <Alert severity="error">{errorGuardar}</Alert>}
                  <FormControl size="small" fullWidth disabled={!puedeEditar}>
                    <InputLabel>Status</InputLabel>
                    <Select label="Status" value={formStatus} onChange={(e) => setFormStatus(e.target.value as ViviendaItemStatus)}>
                      {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth disabled={!puedeEditar}>
                    <InputLabel>Responsable</InputLabel>
                    <Select label="Responsable" value={formResponsable} onChange={(e) => setFormResponsable(e.target.value as ViviendaItemResponsable | "")}>
                      <MenuItem value="">—</MenuItem>
                      {Object.entries(RESPONSABLE_LABELS).map(([value, label]) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <TextField
                        size="small" label="Fecha entrega" type="date" fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={formFechaEntrega}
                        onChange={(e) => setFormFechaEntrega(e.target.value)}
                        disabled={!puedeEditar}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        size="small" label="Fecha cierre" type="date" fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={formFechaCierre}
                        onChange={(e) => setFormFechaCierre(e.target.value)}
                        disabled={!puedeEditar}
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    size="small" label="Link documento" fullWidth
                    value={formLinkDocumento}
                    onChange={(e) => setFormLinkDocumento(e.target.value)}
                    disabled={!puedeEditar}
                  />
                  <TextField
                    size="small" label="Comentarios" multiline minRows={3} fullWidth
                    value={formComentarios}
                    onChange={(e) => setFormComentarios(e.target.value)}
                    disabled={!puedeEditar}
                  />
                  {puedeEditar && (
                    <Stack direction="row" justifyContent="flex-end">
                      <Button variant="contained" onClick={guardar} disabled={guardando}>
                        {guardando ? <CircularProgress size={16} /> : "Guardar"}
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Grid>
            </Grid>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
