"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { AlertTriangle, CheckCircle, Clock, Upload } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import {
  PldAvisoEstado,
  PldAvisoUIF,
  listAvisosUIF,
  presentarAvisoUIF,
  subirEvidenciaAvisoUIF,
} from "@/lib/pld";

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function chipAviso(aviso: PldAvisoUIF) {
  if (aviso.estado === "PRESENTADO") {
    return <Chip size="small" color="success" icon={<CheckCircle size={13} />} label="Presentado" />;
  }
  if (aviso.vencido) {
    return <Chip size="small" color="error" icon={<AlertTriangle size={13} />} label="Vencido" />;
  }
  return <Chip size="small" color="warning" icon={<Clock size={13} />} label="Pendiente" />;
}

function plazoLabel(aviso: PldAvisoUIF) {
  const plazo = new Date(aviso.plazo_presentacion);
  const ahora = new Date();
  const diffMs = plazo.getTime() - ahora.getTime();
  const diffH = Math.round(diffMs / 3600000);
  if (aviso.estado === "PRESENTADO") {
    return aviso.fecha_presentacion
      ? new Date(aviso.fecha_presentacion).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
      : "—";
  }
  if (diffMs < 0) return <Typography variant="body2" color="error.main">Venció hace {Math.abs(diffH)}h</Typography>;
  if (diffH < 6) return <Typography variant="body2" color="error.main">{diffH}h restantes</Typography>;
  if (diffH < 20) return <Typography variant="body2" color="warning.main">{diffH}h restantes</Typography>;
  return <Typography variant="body2">{plazo.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</Typography>;
}

export default function AvisosUifPage() {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const [avisos, setAvisos] = useState<PldAvisoUIF[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<PldAvisoEstado | "VENCIDO" | "">("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Dialog "Marcar como presentado"
  const [dialogAviso, setDialogAviso] = useState<PldAvisoUIF | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorDialog, setErrorDialog] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subida de evidencia suelta (aviso ya presentado sin evidencia)
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const sueltaRef = useRef<HTMLInputElement>(null);

  async function cargar(p = 0, ps = pageSize) {
    setLoading(true);
    setError("");
    try {
      const params: Parameters<typeof listAvisosUIF>[0] = {};
      if (filtroEstado && filtroEstado !== "VENCIDO") params.estado = filtroEstado;
      const data = await listAvisosUIF(params);
      const q = search.trim().toLowerCase();
      let filtrados = q
        ? data.filter(
            (a) =>
              a.nombre_contraparte.toLowerCase().includes(q) ||
              a.proyecto.toLowerCase().includes(q) ||
              a.sociedad.toLowerCase().includes(q)
          )
        : data;
      if (filtroEstado === "VENCIDO") filtrados = filtrados.filter((a) => a.vencido);
      setTotalCount(filtrados.length);
      setAvisos(filtrados.slice(p * ps, (p + 1) * ps));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar avisos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(0); cargar(0, pageSize); }, [filtroEstado, search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(page, pageSize); }, [page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirDialog(aviso: PldAvisoUIF) {
    setDialogAviso(aviso);
    setArchivo(null);
    setNotas(aviso.notas ?? "");
    setErrorDialog("");
  }

  async function handlePresentar() {
    if (!dialogAviso) return;
    setGuardando(true);
    setErrorDialog("");
    try {
      let actualizado = await presentarAvisoUIF(dialogAviso.id_aviso, { notas: notas || undefined });
      if (archivo) {
        actualizado = await subirEvidenciaAvisoUIF(dialogAviso.id_aviso, archivo);
      }
      setDialogAviso(null);
      // reemplaza la fila en la lista sin recargar todo
      setAvisos((prev) => prev.map((a) => (a.id_aviso === actualizado.id_aviso ? actualizado : a)));
    } catch (e) {
      setErrorDialog(e instanceof Error ? e.message : "Error al marcar aviso");
    } finally {
      setGuardando(false);
    }
  }

  async function handleSubirEvidenciaSuelta(aviso: PldAvisoUIF, file: File) {
    setSubiendoId(aviso.id_aviso);
    try {
      const actualizado = await subirEvidenciaAvisoUIF(aviso.id_aviso, file);
      setAvisos((prev) => prev.map((a) => (a.id_aviso === actualizado.id_aviso ? actualizado : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir evidencia");
    } finally {
      setSubiendoId(null);
    }
  }

  const pendientesVencidos = avisos.filter((a) => a.vencido).length;

  return (
    <AppShell>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Avisos a la UIF
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Registro de avisos formales requeridos por LFPIORPI art. 24 cuando una contraparte supera
        $948,000 MXN acumulados en 6 meses. Plazo regulatorio: 24 horas desde la detección.
      </Typography>

      {pendientesVencidos > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {pendientesVencidos} aviso{pendientesVencidos > 1 ? "s" : ""} vencido
          {pendientesVencidos > 1 ? "s" : ""} sin presentar — debieron enviarse a SICOAM dentro del plazo de 24h.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <FiltrosBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(0); }}
        searchPlaceholder="Buscar por contraparte, proyecto o sociedad..."
      >
        <FormControl size="small">
          <InputLabel id="estado-aviso-label">Estado</InputLabel>
          <Select
            labelId="estado-aviso-label"
            label="Estado"
            value={filtroEstado}
            onChange={(e) => { setFiltroEstado(e.target.value as PldAvisoEstado | "VENCIDO" | ""); setPage(0); }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="PENDIENTE">Pendiente</MenuItem>
            <MenuItem value="VENCIDO">Vencido</MenuItem>
            <MenuItem value="PRESENTADO">Presentado</MenuItem>
          </Select>
        </FormControl>
      </FiltrosBar>

      {/* input oculto para subir evidencia en aviso ya presentado */}
      <input
        ref={sueltaRef}
        type="file"
        hidden
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = sueltaRef.current?.dataset.avisoId;
          if (file && id) {
            const aviso = avisos.find((a) => a.id_aviso === id);
            if (aviso) handleSubirEvidenciaSuelta(aviso, file);
          }
          e.target.value = "";
        }}
      />

      <Paper variant="outlined">
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress size={24} /></Stack>
        ) : avisos.length === 0 ? (
          <Stack alignItems="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">Sin avisos registrados</Typography></Stack>
        ) : esMovil ? (
          <Stack spacing={1.5} sx={{ p: 2 }}>
            {avisos.map((aviso) => (
              <Card key={aviso.id_aviso} variant="outlined" sx={aviso.vencido ? { borderColor: "error.main" } : undefined}>
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        component="a"
                        href={`/pld/${aviso.kyc_id}`}
                        sx={{ color: "primary.main", textDecoration: "none" }}
                      >
                        {aviso.nombre_contraparte}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{aviso.proyecto || "—"} · {aviso.sociedad || "—"}</Typography>
                      <Typography variant="caption" color="text.secondary">{MXN.format(Number(aviso.monto_acumulado))}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>{chipAviso(aviso)}</Stack>
                      <Box sx={{ mt: 0.5 }}>{plazoLabel(aviso)}</Box>
                    </Stack>
                    <Stack spacing={0.5} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                      {aviso.link_evidencia && (
                        <Button size="small" component="a" href={aviso.link_evidencia} target="_blank" rel="noopener">Ver evidencia</Button>
                      )}
                      {aviso.estado === "PRESENTADO" && !aviso.link_evidencia && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={subiendoId === aviso.id_aviso ? <CircularProgress size={14} /> : <Upload size={14} />}
                          disabled={subiendoId === aviso.id_aviso}
                          onClick={() => {
                            if (sueltaRef.current) {
                              sueltaRef.current.dataset.avisoId = aviso.id_aviso;
                              sueltaRef.current.click();
                            }
                          }}
                        >
                          Subir
                        </Button>
                      )}
                      {aviso.estado === "PENDIENTE" && (
                        <Button size="small" variant="outlined" onClick={() => abrirDialog(aviso)}>Marcar</Button>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        ) : (
          <Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Contraparte</TableCell>
                    <TableCell>Proyecto</TableCell>
                    <TableCell>Sociedad</TableCell>
                    <TableCell align="right">Monto acumulado</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Plazo / Presentado</TableCell>
                    <TableCell align="right">Evidencia / Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {avisos.map((aviso) => (
                    <TableRow key={aviso.id_aviso} sx={aviso.vencido ? { bgcolor: "error.light", opacity: 0.9 } : undefined}>
                      <TableCell>
                        <Typography variant="body2" component="a" href={`/pld/${aviso.kyc_id}`} sx={{ color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
                          {aviso.nombre_contraparte}
                        </Typography>
                      </TableCell>
                      <TableCell>{aviso.proyecto || "—"}</TableCell>
                      <TableCell>{aviso.sociedad || "—"}</TableCell>
                      <TableCell align="right">{MXN.format(Number(aviso.monto_acumulado))}</TableCell>
                      <TableCell>{chipAviso(aviso)}</TableCell>
                      <TableCell>{plazoLabel(aviso)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                          {aviso.link_evidencia && (
                            <Button size="small" component="a" href={aviso.link_evidencia} target="_blank" rel="noopener">Ver evidencia</Button>
                          )}
                          {aviso.estado === "PRESENTADO" && !aviso.link_evidencia && (
                            <Tooltip title="Subir comprobante de presentación">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={subiendoId === aviso.id_aviso ? <CircularProgress size={14} /> : <Upload size={14} />}
                                disabled={subiendoId === aviso.id_aviso}
                                onClick={() => {
                                  if (sueltaRef.current) {
                                    sueltaRef.current.dataset.avisoId = aviso.id_aviso;
                                    sueltaRef.current.click();
                                  }
                                }}
                              >
                                Subir evidencia
                              </Button>
                            </Tooltip>
                          )}
                          {aviso.estado === "PENDIENTE" && (
                            <Tooltip title="Marcar como presentado ante SICOAM">
                              <Button size="small" variant="outlined" onClick={() => abrirDialog(aviso)}>Marcar presentado</Button>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TablePagination
                      colSpan={7}
                      count={totalCount}
                      page={page}
                      rowsPerPage={pageSize}
                      rowsPerPageOptions={[20, 50, 100]}
                      labelRowsPerPage="Filas:"
                      onPageChange={(_, p) => setPage(p)}
                      onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                    />
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
          </Box>
        )}
        {esMovil && (
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[20, 50, 100]}
            labelRowsPerPage="Filas:"
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          />
        )}
      </Paper>

      {/* Dialog: marcar como presentado */}
      <Dialog
        open={!!dialogAviso}
        onClose={(_, reason) => { if (reason !== "backdropClick" && reason !== "escapeKeyDown") setDialogAviso(null); }}
        maxWidth="sm"
        fullWidth
        fullScreen={esMovil}
      >
        <DialogTitle>Marcar aviso como presentado</DialogTitle>
        <DialogContent>
          {dialogAviso && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>{dialogAviso.nombre_contraparte}</strong> · {dialogAviso.proyecto} ·{" "}
                {MXN.format(Number(dialogAviso.monto_acumulado))}
              </Typography>
              {dialogAviso.vencido && (
                <Alert severity="error" icon={<AlertTriangle size={16} />}>
                  El plazo de 24h venció. Registra de todas formas la presentación tardía.
                </Alert>
              )}

              {/* Archivo de evidencia */}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <Box>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Upload size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {archivo ? archivo.name : "Seleccionar comprobante SICOAM"}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  PDF, JPG o PNG. Se sube a Drive al confirmar.
                </Typography>
              </Box>

              <TextField
                label="Notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={2}
                placeholder="Número de folio SICOAM, observaciones..."
              />
              {errorDialog && <Alert severity="error">{errorDialog}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogAviso(null)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handlePresentar}
            disabled={guardando}
            startIcon={guardando ? <CircularProgress size={14} /> : undefined}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
