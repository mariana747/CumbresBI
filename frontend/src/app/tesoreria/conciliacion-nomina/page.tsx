"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TableRow,
  Tabs,
  TextField,
  Typography,
  Button,
} from "@mui/material";
import { ExternalLink, Eye, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import PanelReferenciaCruzada, { ReferenciaCruzada } from "@/components/PanelReferenciaCruzada";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  ConciliacionNominaFila,
  ConciliacionNominaResponse,
  getConciliacionNomina,
  listNominas,
  TesoreriaNomina,
} from "@/lib/tesoreria";

// Default: mes corriente completo - mismo criterio que Conciliacion de
// Facturas (10/Sep/2026, "no es por periodo debe ser por rango de fecha").
function primerDiaDelMes(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
}

function ultimoDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function numero(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

const VACIO: ConciliacionNominaResponse = { con_recibo: [], sin_recibo: [] };

type TabPrincipal = "con_recibo" | "sin_recibo";

// Conciliacion Nomina<->Recibo CFDI (14/Sep/2026, siguiente pendiente tras
// el cierre real de Nomina) - mismo patron que Conciliacion de Facturas
// (2 tabs en vez de 3: aqui no existe "no requiere", todo Flujo de nomina
// eventualmente necesita su recibo). Vincular el recibo sigue viviendo en
// Nominas/Flujos (ya construido) - esta pantalla solo reporta el cruce.
export default function ConciliacionNominaPage() {
  const [tab, setTab] = useState<TabPrincipal>("sin_recibo");
  const [datos, setDatos] = useState<ConciliacionNominaResponse>(VACIO);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [nominas, setNominas] = useState<TesoreriaNomina[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(ultimoDiaDelMes());
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroNomina, setFiltroNomina] = useState("");

  const [detalle, setDetalle] = useState<ConciliacionNominaFila | null>(null);

  // Referencias cruzadas (mismo patron que Conciliacion de Facturas) -
  // "Ver periodo" abre el panel lateral de la Nomina con sus Flujos.
  const [panelReferencia, setPanelReferencia] = useState<ReferenciaCruzada>(null);

  function refresh() {
    setLoading(true);
    setError(null);
    getConciliacionNomina({
      desde: desde || undefined,
      hasta: hasta || undefined,
      sociedad: filtroEmpresa || undefined,
      nomina: filtroNomina || undefined,
    })
      .then(setDatos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar la conciliación"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listNominas().then(setNominas).catch(() => setNominas([]));
  }, []);

  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtro = (f: ConciliacionNominaFila) =>
    !search ||
    f.id_flujo.toLowerCase().includes(search.toLowerCase()) ||
    (f.concepto || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.id_empleado || "").toLowerCase().includes(search.toLowerCase());

  const filasConRecibo = datos.con_recibo.filter(filtro);
  const filasSinRecibo = datos.sin_recibo.filter(filtro);

  const filasPorTab: Record<TabPrincipal, ConciliacionNominaFila[]> = {
    con_recibo: filasConRecibo,
    sin_recibo: filasSinRecibo,
  };
  const filasVisibles = filasPorTab[tab];
  const colSpan = tab === "con_recibo" ? 8 : 6;

  return (
    <AppShell>
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          Conciliación de Nómina
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Cruce de Flujos de nómina contra su Recibo (CFDI) timbrado. Filtro base: mes corriente.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <FiltrosBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por ID de flujo, concepto o empleado..."
          onAplicarFiltros={refresh}
          onLimpiarFiltros={() => {
            setDesde(primerDiaDelMes());
            setHasta(ultimoDiaDelMes());
            setFiltroEmpresa("");
            setFiltroNomina("");
          }}
        >
          <TextField
            size="small"
            type="date"
            label="Desde"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="date"
            label="Hasta"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small">
            <InputLabel id="filtro-empresa-label">Empresa</InputLabel>
            <Select
              labelId="filtro-empresa-label"
              label="Empresa"
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
            >
              <MenuItem value="">
                <em>Todas las empresas</em>
              </MenuItem>
              {sociedades.map((s) => (
                <MenuItem key={s.rfc} value={s.rfc}>
                  {s.alias_sociedad || s.razon_social || s.rfc}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="filtro-nomina-label">Nómina</InputLabel>
            <Select
              labelId="filtro-nomina-label"
              label="Nómina"
              value={filtroNomina}
              onChange={(e) => setFiltroNomina(e.target.value)}
            >
              <MenuItem value="">
                <em>Todas las nóminas</em>
              </MenuItem>
              {nominas.map((n) => (
                <MenuItem key={n.id_nomina} value={n.id_nomina}>
                  {n.serie}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FiltrosBar>

        {/* Tabs pegados a la tabla, un solo Paper (ver memoria
        feedback-patron-tabs-pegados-a-tabla). */}
        <Paper variant="outlined">
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}>
            <Tab value="sin_recibo" label={`Sin recibo (${filasSinRecibo.length})`} />
            <Tab value="con_recibo" label={`Con recibo (${filasConRecibo.length})`} />
          </Tabs>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID Flujo</TableCell>
                  <TableCell>Nómina</TableCell>
                  <TableCell>Empleado</TableCell>
                  <TableCell>Concepto</TableCell>
                  <TableCell>Fecha efectiva</TableCell>
                  <TableCell align="right">Total del pago</TableCell>
                  {tab === "con_recibo" && (
                    <>
                      <TableCell align="right">Reconocido</TableCell>
                      <TableCell align="right">Por reconocer</TableCell>
                    </>
                  )}
                  <TableCell align="right">Detalle</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : filasVisibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        Sin Flujos de nómina en este periodo.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filasVisibles.map((f) => {
                    const cuadra = f.por_reconocer != null && Number(f.por_reconocer) === 0;
                    return (
                      <TableRow key={f.id_flujo} hover>
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{f.id_flujo}</TableCell>
                        <TableCell>{f.periodo_nomina_serie || "—"}</TableCell>
                        <TableCell>{f.id_empleado || "—"}</TableCell>
                        <TableCell>{f.concepto || "—"}</TableCell>
                        <TableCell>{f.fecha_efectiva || "—"}</TableCell>
                        <TableCell align="right">{numero(f.total_mxp)}</TableCell>
                        {tab === "con_recibo" && (
                          <>
                            <TableCell align="right">{numero(f.reconocido)}</TableCell>
                            <TableCell align="right">
                              <Typography
                                component="span"
                                variant="body2"
                                color={f.por_reconocer == null ? "text.secondary" : cuadra ? "success.main" : "error.main"}
                              >
                                {numero(f.por_reconocer)}
                              </Typography>
                            </TableCell>
                          </>
                        )}
                        <TableCell align="right">
                          <IconButton size="small" aria-label="Ver" title="Ver" onClick={() => setDetalle(f)}>
                            <Eye size={16} strokeWidth={1.5} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Dialog
          open={!!detalle}
          onClose={(_, reason) => {
            // Solo se cierra con el boton X (ver memoria
            // feedback-dialogs-solo-cierran-con-x).
            if (reason === "backdropClick" || reason === "escapeKeyDown") return;
            setDetalle(null);
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Pago {detalle?.id_flujo}
            <IconButton onClick={() => setDetalle(null)} size="small" aria-label="Cerrar">
              <CloseIcon size={18} strokeWidth={1.5} />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 3 }}>
            {detalle && (
              <Stack spacing={1.5}>
                <Typography variant="body2">
                  <strong>Empleado:</strong> {detalle.id_empleado || "—"}
                </Typography>
                <Typography variant="body2">
                  <strong>Concepto:</strong> {detalle.concepto || "—"}
                </Typography>
                <Typography variant="body2">
                  <strong>Fecha efectiva:</strong> {detalle.fecha_efectiva || "—"}
                </Typography>
                <Typography variant="body2">
                  <strong>Total del pago:</strong> {numero(detalle.total_mxp)}
                </Typography>
                {detalle.nomina ? (
                  <>
                    <Typography variant="body2">
                      <strong>Recibo de nómina:</strong> #{detalle.nomina}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Reconocido:</strong> {numero(detalle.reconocido)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Por reconocer:</strong> {numero(detalle.por_reconocer)}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Este pago todavía no tiene ningún recibo de nómina ligado. Vincúlalo desde "Ver Flujos" en la
                    pantalla de Nóminas.
                  </Typography>
                )}

                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    <strong>Nómina:</strong> {detalle.periodo_nomina_serie || "—"}
                  </Typography>
                  {detalle.periodo_nomina && (
                    <Button
                      size="small"
                      startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                      onClick={() => setPanelReferencia({ tipo: "nomina", id: detalle.periodo_nomina as string })}
                    >
                      Ver nómina
                    </Button>
                  )}
                </Stack>
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetalle(null)}>Cerrar</Button>
          </DialogActions>
        </Dialog>

        <PanelReferenciaCruzada referencia={panelReferencia} onClose={() => setPanelReferencia(null)} />
      </Box>
    </AppShell>
  );
}
