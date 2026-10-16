"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import { ArrowLeft, ChevronRight, Eye } from "lucide-react";
import AppShell from "@/components/AppShell";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import { SessionUser, getSession } from "@/lib/auth";
import { downloadDriveFile, driveFileIdFromUrl } from "@/lib/drive";
import {
  ViviendaExpediente,
  ViviendaExpedienteEstado,
  ViviendaExpedienteItem,
  ViviendaItemStatus,
  ViviendaUnidad,
  listExpedientes,
  listItems,
  listViviendas,
  updateVivienda,
} from "@/lib/vivienda";

const ESTADO_EXP_COLORS: Record<ViviendaExpedienteEstado, "default" | "info" | "warning" | "success" | "error"> = {
  PENDIENTE: "default",
  "EN PROCESO": "info",
  FIRMADO: "warning",
  CONCLUIDO: "success",
  CANCELADO: "error",
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

type TabPage = "detalle" | "expedientes";

export default function ViviendaDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<SessionUser | null>(null);
  const [vivienda, setVivienda] = useState<ViviendaUnidad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabPage>("detalle");

  // Disponibilidad
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [togglingDisp, setTogglingDisp] = useState(false);

  // Expedientes
  const [expedientes, setExpedientes] = useState<ViviendaExpediente[]>([]);
  const [expedientesLoading, setExpedientesLoading] = useState(false);
  const [expedientesError, setExpedientesError] = useState<string | null>(null);

  // Drawer de expediente seleccionado
  const [expedienteDrawer, setExpedienteDrawer] = useState<ViviendaExpediente | null>(null);
  const [itemsDrawer, setItemsDrawer] = useState<ViviendaExpedienteItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Preview documentos
  const [previewDocBlobUrl, setPreviewDocBlobUrl] = useState<string | null>(null);
  const [fallbackDocUrl, setFallbackDocUrl] = useState<string | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

  const puedeEditar = session?.perm_keys.includes("ventas-vivienda.editar") ?? false;
  const actorId = session?.user_id ?? "desconocido";

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  useEffect(() => {
    setLoading(true);
    listViviendas()
      .then((lista) => {
        const found = lista.find((v) => v.id_vivienda === params.id);
        if (!found) {
          setError("Vivienda no encontrada");
        } else {
          setVivienda(found);
          setDisponible(found.disponible);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    if (tab !== "expedientes" || !vivienda) return;
    setExpedientesLoading(true);
    setExpedientesError(null);
    listExpedientes({ vivienda: vivienda.id_vivienda })
      .then(setExpedientes)
      .catch((err) => setExpedientesError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setExpedientesLoading(false));
  }, [tab, vivienda]);

  async function toggleDisponible(valor: boolean) {
    if (!vivienda || disponible === valor) return;
    setTogglingDisp(true);
    try {
      await updateVivienda(vivienda.id_vivienda, { disponible: valor }, actorId);
      setDisponible(valor);
    } catch {
      // sin cambio
    } finally {
      setTogglingDisp(false);
    }
  }

  async function verDocumento(url: string, docId: string) {
    const fileId = driveFileIdFromUrl(url);
    if (!fileId) { setFallbackDocUrl(url); return; }
    setLoadingDocId(docId);
    try {
      const blob = await downloadDriveFile(fileId, "ventas-vivienda.editar");
      if (previewDocBlobUrl) URL.revokeObjectURL(previewDocBlobUrl);
      setFallbackDocUrl(null);
      setPreviewDocBlobUrl(blob);
    } catch { setFallbackDocUrl(url); }
    finally { setLoadingDocId(null); }
  }

  function abrirExpediente(e: ViviendaExpediente) {
    setExpedienteDrawer(e);
    setItemsDrawer([]);
    setLoadingItems(true);
    listItems(e.id_expediente).then(setItemsDrawer).finally(() => setLoadingItems(false));
  }

  if (loading) return (
    <AppShell>
      <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress size={28} /></Stack>
    </AppShell>
  );

  if (error || !vivienda) return (
    <AppShell>
      <Button size="small" startIcon={<ArrowLeft size={16} strokeWidth={1.5} />} onClick={() => router.push("/ventas-vivienda/viviendas")} sx={{ mb: 2 }}>
        Volver a viviendas
      </Button>
      <Alert severity="error">{error || "No encontrada"}</Alert>
    </AppShell>
  );

  return (
    <AppShell>
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
        onClick={() => router.push("/ventas-vivienda/viviendas")}
        sx={{ mb: 2 }}
      >
        Volver a viviendas
      </Button>

      <Grid container spacing={3}>
        {/* Columna izquierda */}
        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {vivienda.denominacion || vivienda.num_oficial || vivienda.id_vivienda}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              {vivienda.proyecto_denominacion || vivienda.proyecto}
            </Typography>

            <Chip
              size="small"
              label={disponible ? "Disponible" : "No disponible"}
              color={disponible ? "success" : "error"}
              variant="outlined"
              sx={{ mb: 2 }}
            />

            {puedeEditar && (
              <ButtonGroup size="small" variant="outlined" fullWidth disabled={togglingDisp} sx={{ mb: 2 }}>
                <Button color="success" variant={disponible ? "contained" : "outlined"} onClick={() => toggleDisponible(true)}>
                  Disponible
                </Button>
                <Button color="error" variant={!disponible ? "contained" : "outlined"} onClick={() => toggleDisponible(false)}>
                  No disponible
                </Button>
              </ButtonGroup>
            )}

            <Stack spacing={1}>
              {[
                ["Proyecto", vivienda.proyecto_denominacion],
                ["Num. oficial", vivienda.num_oficial],
                ["Etapa", vivienda.etapa],
                ["Tipo", vivienda.tipo],
                ["Modelo", vivienda.modelo],
                ["Torre", vivienda.torre],
                ["Manzana", vivienda.mz],
                ["Lote", vivienda.lote],
                ["Piso", vivienda.piso],
                ["Precio lista", vivienda.precio_lista ? `$${vivienda.precio_lista}` : null],
              ].filter(([, v]) => v).map(([label, value]) => (
                <Box key={label as string}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="body2">{value}</Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Columna derecha */}
        <Grid item xs={12} md={9}>
          <Paper variant="outlined" sx={{ overflow: "hidden" }}>
            <Tabs value={tab} onChange={(_, v) => { setTab(v); setExpedienteDrawer(null); }} sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
              <Tab label="Detalle" value="detalle" />
              <Tab label="Expedientes" value="expedientes" />
            </Tabs>

            <Box sx={{ p: 3 }}>
              {/* Tab Detalle */}
              {tab === "detalle" && (
                <Grid container spacing={2}>
                  {[
                    ["ID", vivienda.id_vivienda],
                    ["Denominación", vivienda.denominacion],
                    ["Núm. oficial", vivienda.num_oficial],
                    ["Etapa", vivienda.etapa],
                    ["Tipo", vivienda.tipo],
                    ["Modelo", vivienda.modelo],
                    ["Torre", vivienda.torre],
                    ["Manzana", vivienda.mz],
                    ["Lote", vivienda.lote],
                    ["Piso", vivienda.piso],
                    ["Habitaciones", vivienda.habitaciones?.toString()],
                    ["Frente (m²)", vivienda.frente_m2],
                    ["Fondo (m²)", vivienda.fondo_m2],
                    ["Sup. terreno (m²)", vivienda.sup_terreno_m2],
                    ["Sup. construcción (m²)", vivienda.sup_const_m2],
                    ["Terraza (m²)", vivienda.terraza_m2],
                    ["Balcones (m²)", vivienda.balcones_m2],
                    ["Bodega (m²)", vivienda.bodega_m2],
                    ["Cajones estacionamiento", vivienda.cajones_est],
                    ["Precio lista", vivienda.precio_lista ? `$${vivienda.precio_lista}` : null],
                    ["Muestra", vivienda.muestra === true ? "Sí" : vivienda.muestra === false ? "No" : null],
                    ["Creado", vivienda.created_at ? new Date(vivienda.created_at).toLocaleDateString("es-MX") : null],
                  ].map(([label, value]) => (
                    <Grid item xs={12} sm={6} key={label as string}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2">{value || "—"}</Typography>
                    </Grid>
                  ))}
                  {vivienda.comentarios && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Comentarios</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{vivienda.comentarios}</Typography>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* Tab Expedientes */}
              {tab === "expedientes" && (
                <>
                  {expedientesError && <Alert severity="error" sx={{ mb: 2 }}>{expedientesError}</Alert>}

                  {expedienteDrawer ? (
                    <Box>
                      <Button size="small" onClick={() => setExpedienteDrawer(null)} sx={{ mb: 2 }}>
                        ← Volver
                      </Button>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                        <Typography variant="subtitle1" fontWeight={600}>Expediente</Typography>
                        <Chip
                          size="small"
                          label={expedienteDrawer.estado}
                          variant="outlined"
                          color={ESTADO_EXP_COLORS[expedienteDrawer.estado] ?? "default"}
                        />
                      </Stack>
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
                              ["Creado el", expedienteDrawer.created_at ? new Date(expedienteDrawer.created_at).toLocaleString("es-MX") : null],
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
                                    onClick={() => verDocumento(expedienteDrawer.link_expediente!, "expediente")}
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
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Documento</TableCell>
                                <TableCell>Estado</TableCell>
                                <TableCell>Responsable</TableCell>
                                <TableCell>Fecha solicitud</TableCell>
                                <TableCell />
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {itemsDrawer.map((item) => (
                                <TableRow key={item.id_item}>
                                  <TableCell sx={{ fontSize: 12 }}>{item.denominacion || "—"}</TableCell>
                                  <TableCell>
                                    <Chip
                                      size="small"
                                      label={item.status}
                                      color={ITEM_STATUS_COLORS[item.status] ?? "default"}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ fontSize: 12 }}>{item.responsable || "—"}</TableCell>
                                  <TableCell sx={{ fontSize: 12 }}>{item.fecha_solicitud || "—"}</TableCell>
                                  <TableCell align="right">
                                    {item.link_documento && (
                                      <IconButton
                                        size="small"
                                        disabled={loadingDocId === item.id_item}
                                        onClick={() => verDocumento(item.link_documento!, item.id_item)}
                                      >
                                        {loadingDocId === item.id_item ? <CircularProgress size={14} /> : <Eye size={14} strokeWidth={1.5} />}
                                      </IconButton>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </Box>
                  ) : expedientesLoading ? (
                    <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={20} /></Stack>
                  ) : expedientes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">Sin expedientes para esta vivienda.</Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Expediente</TableCell>
                            <TableCell>Asesor</TableCell>
                            <TableCell>Contrato</TableCell>
                            <TableCell>Estado</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {expedientes.map((e) => (
                            <TableRow key={e.id_expediente} hover sx={{ cursor: "pointer" }} onClick={() => abrirExpediente(e)}>
                              <TableCell sx={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
                                {e.id_expediente.slice(0, 8).toUpperCase()}
                              </TableCell>
                              <TableCell>{e.asesor_nombre}</TableCell>
                              <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id_contrato}</TableCell>
                              <TableCell>
                                <Chip size="small" label={e.estado} variant="outlined" color={ESTADO_EXP_COLORS[e.estado] ?? "default"} />
                              </TableCell>
                              <TableCell align="right">
                                <ChevronRight size={16} strokeWidth={1.5} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

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
