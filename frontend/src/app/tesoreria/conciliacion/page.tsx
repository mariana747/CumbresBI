"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  Divider,
  Link as MuiLink,
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
  TextField,
  Typography,
} from "@mui/material";
import { Landmark, RefreshCw, Sparkles, Upload, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import {
  ConciliarAutomaticoResultado,
  ReporteConciliacion,
  TesoreriaContrato,
  TesoreriaCorteEdc,
  TesoreriaCuenta,
  TesoreriaFlujoSugerido,
  TesoreriaMovimientoBancario,
  conciliarAutomatico,
  crearFlujoDesdeMovimiento,
  importarExtractoBancario,
  listContratos,
  listCortesEdc,
  listCuentas,
  listMovimientosBancarios,
  reporteConciliacion,
  sugerenciasMovimientoBancario,
  vincularMovimientoBancario,
} from "@/lib/tesoreria";

// Pantalla de conciliacion bancaria (08/Sep/2026) - primer frontend real
// para lo que hasta ahora solo existia en backend (importar extracto,
// matching automatico fecha+monto, reporte transaccion-por-transaccion).
// Dos pestañas: "Movimientos" (importar + conciliar, manual o automatico)
// y "Reporte" (conciliados/sin_conciliar_banco/sin_conciliar_interno, ver
// tesoreria/reportes.py::calcular_reporte_conciliacion).
function formatMonto(valor: string | null): string {
  if (valor === null) return "—";
  return Number(valor).toLocaleString("es-MX", { minimumFractionDigits: 2 });
}

export default function TesoreriaConciliacionPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState(0);

  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [cuenta, setCuenta] = useState<TesoreriaCuenta | null>(null);

  const [movimientos, setMovimientos] = useState<TesoreriaMovimientoBancario[]>([]);
  const [search, setSearch] = useState("");
  // Todos/Conciliados/Sin conciliar (11/Sep/2026) - como tabs pegados a la
  // tabla con conteo, mismo patron que Conciliacion de Facturas/PLD (ver
  // memoria feedback-patron-tabs-pegados-a-tabla), no como filtro suelto en
  // FiltrosBar. Se trae TODO de una vez (sin filtro server-side de
  // conciliado) para poder mostrar el conteo de las 3 pestañas a la vez.
  const [subTab, setSubTab] = useState<"todos" | "conciliados" | "sin_conciliar">("sin_conciliar");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [importResultado, setImportResultado] = useState<{ importados: number; errores: string[] } | null>(
    null
  );
  // Corte real recien importado (08/Sep/2026, "subir el extracto original
  // a Drive") - se obtiene aparte porque importarExtractoBancario solo
  // regresa el id, no el objeto completo con el link real.
  const [corteImportado, setCorteImportado] = useState<TesoreriaCorteEdc | null>(null);

  // Filtra la tabla a solo lo que se acaba de importar (11/Sep/2026,
  // "quiero que muestre lo importado y para mostrar y redirigir") - se
  // limpia con el chip "Quitar filtro" para volver a ver todos los
  // movimientos de la cuenta.
  const [filtroCorteImportado, setFiltroCorteImportado] = useState<string | null>(null);

  const [conciliandoAuto, setConciliandoAuto] = useState(false);
  const [resultadoAuto, setResultadoAuto] = useState<ConciliarAutomaticoResultado | null>(null);

  const [sugerenciasDialog, setSugerenciasDialog] = useState<{
    movimiento: TesoreriaMovimientoBancario;
    opciones: TesoreriaFlujoSugerido[];
  } | null>(null);
  const [cargandoSugerencias, setCargandoSugerencias] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);

  const [reporte, setReporte] = useState<ReporteConciliacion | null>(null);
  const [reporteLoading, setReporteLoading] = useState(false);
  const [fechaInicioReporte, setFechaInicioReporte] = useState("");
  const [fechaFinReporte, setFechaFinReporte] = useState("");
  // Tabs pegados a la tabla (11/Sep/2026, "movimiento y reporte no esta de
  // misma forma") - mismo patron que la pestaña Movimientos, en vez de 3
  // tablas apiladas por separado.
  const [subTabReporte, setSubTabReporte] = useState<"conciliados" | "sin_conciliar_banco" | "sin_conciliar_interno">(
    "conciliados"
  );

  // Precargar Flujo desde un movimiento sin match (11/Sep/2026, "Subida de
  // archivos CRCM para precargar Flujos") - contrato es lo unico que el
  // extracto no puede traer, se elige aqui mismo antes de crear.
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  const [contratoNuevoFlujo, setContratoNuevoFlujo] = useState<TesoreriaContrato | null>(null);
  const [creandoFlujo, setCreandoFlujo] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
    listCuentas().then(setCuentas).catch(() => setCuentas([]));
    listContratos().then(setContratos).catch(() => setContratos([]));
  }, []);

  useEffect(() => {
    if (!cuenta) {
      setMovimientos([]);
      return;
    }
    const timeout = setTimeout(refreshMovimientos, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta, filtroCorteImportado, search]);

  function refreshMovimientos() {
    if (!cuenta) return;
    setLoading(true);
    setError(null);
    // Sin filtro server-side de conciliado (11/Sep/2026) - se trae todo para
    // poder mostrar el conteo de las 3 pestañas (Todos/Conciliados/Sin
    // conciliar) a la vez, el filtrado por pestaña es client-side (ver
    // movimientosPorEstado).
    listMovimientosBancarios({
      cuenta: cuenta.id_cuenta_bancaria,
      corteEdc: filtroCorteImportado || undefined,
      search: search || undefined,
    })
      .then(setMovimientos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar movimientos"))
      .finally(() => setLoading(false));
  }

  const movimientosPorEstado = useMemo(() => {
    const conciliados = movimientos.filter((m) => !!m.flujo);
    const sinConciliar = movimientos.filter((m) => !m.flujo);
    return { todos: movimientos, conciliados, sin_conciliar: sinConciliar };
  }, [movimientos]);
  const movimientosVisibles = movimientosPorEstado[subTab];

  async function handleImportar() {
    if (!cuenta || !archivo) return;
    setImportando(true);
    setError(null);
    try {
      const resultado = await importarExtractoBancario({
        cuenta: cuenta.id_cuenta_bancaria,
        file: archivo,
        createdBy: session?.email,
      });
      setImportResultado(resultado);
      setArchivo(null);
      // Filtra la tabla a lo recien importado (11/Sep/2026, "quiero que
      // muestre lo importado y para mostrar y redirigir") - el efecto de
      // arriba (dependencia filtroCorteImportado) refresca la tabla solo;
      // no hace falta llamar refreshMovimientos() aqui tambien.
      setFiltroCorteImportado(resultado.corte_edc);
      // Best-effort: si Drive fallo al subir, el corte simplemente no trae
      // link - no bloquea nada, solo no se muestra el enlace.
      listCortesEdc(cuenta.id_cuenta_bancaria)
        .then((cortes) => setCorteImportado(cortes.find((c) => c.id === resultado.corte_edc) || null))
        .catch(() => setCorteImportado(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar el extracto");
    } finally {
      setImportando(false);
    }
  }

  async function handleVerSugerencias(movimiento: TesoreriaMovimientoBancario) {
    setCargandoSugerencias(movimiento.id);
    setContratoNuevoFlujo(null);
    try {
      const opciones = await sugerenciasMovimientoBancario(movimiento.id);
      setSugerenciasDialog({ movimiento, opciones });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al buscar sugerencias");
    } finally {
      setCargandoSugerencias(null);
    }
  }

  async function handleCrearFlujo() {
    if (!sugerenciasDialog || !contratoNuevoFlujo) return;
    setCreandoFlujo(true);
    setError(null);
    try {
      const flujo = await crearFlujoDesdeMovimiento(sugerenciasDialog.movimiento.id, contratoNuevoFlujo.id_contrato);
      setSugerenciasDialog(null);
      // Redirige a Flujos con el registro recien precargado ya abierto
      // (11/Sep/2026, "quiero...redirigir") - falta terminar de completar
      // el registro (fecha real, comprobante, etc.), no solo verlo en la lista.
      router.push(`/tesoreria/flujos?abrir=${flujo.id_flujo}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el Flujo");
    } finally {
      setCreandoFlujo(false);
    }
  }

  async function handleVincular(idMovimiento: string, idFlujo: string) {
    setVinculando(idFlujo);
    try {
      await vincularMovimientoBancario(idMovimiento, idFlujo);
      setSugerenciasDialog(null);
      refreshMovimientos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al vincular el flujo");
    } finally {
      setVinculando(null);
    }
  }

  async function handleDesvincular(idMovimiento: string) {
    try {
      await vincularMovimientoBancario(idMovimiento, null);
      refreshMovimientos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al desvincular");
    }
  }

  async function handleConciliarAutomatico() {
    if (!cuenta) return;
    setConciliandoAuto(true);
    setError(null);
    try {
      const resultado = await conciliarAutomatico({ cuenta: cuenta.id_cuenta_bancaria, actorUserId: session?.email });
      setResultadoAuto(resultado);
      refreshMovimientos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conciliar automáticamente");
    } finally {
      setConciliandoAuto(false);
    }
  }

  function handleVerReporte() {
    if (!cuenta) return;
    setReporteLoading(true);
    setError(null);
    reporteConciliacion({
      cuenta: cuenta.id_cuenta_bancaria,
      fechaInicio: fechaInicioReporte || undefined,
      fechaFin: fechaFinReporte || undefined,
    })
      .then(setReporte)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al generar el reporte"))
      .finally(() => setReporteLoading(false));
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Landmark size={22} strokeWidth={1.5} />
        <Typography variant="h5">Conciliación Bancaria</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Importa el extracto bancario (CSV/Excel), liga cada línea con su registro interno
        (automático cuando el monto y la fecha coinciden, manual con sugerencias en el resto) y
        revisa el reporte transacción por transacción.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
          <Tab label="Movimientos" />
          <Tab label="Reporte" onClick={handleVerReporte} />
        </Tabs>
      </Paper>

      {tab === 0 && (
            <>
              <FiltrosBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Buscar por descripción o referencia..."
                actions={
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      variant="contained"
                      startIcon={<Upload size={16} strokeWidth={1.5} />}
                      onClick={() => {
                        setImportResultado(null);
                        setCorteImportado(null);
                        setImportDialogOpen(true);
                      }}
                      sx={{ flexShrink: 0 }}
                    >
                      Importar extracto
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={
                        conciliandoAuto ? <CircularProgress size={16} /> : <Sparkles size={16} strokeWidth={1.5} />
                      }
                      disabled={conciliandoAuto}
                      onClick={handleConciliarAutomatico}
                      sx={{ flexShrink: 0 }}
                    >
                      Conciliar automático
                    </Button>
                    <Button
                      variant="text"
                      startIcon={<RefreshCw size={16} strokeWidth={1.5} />}
                      onClick={refreshMovimientos}
                      sx={{ flexShrink: 0 }}
                    >
                      Refrescar
                    </Button>
                  </Stack>
                }
              >
                <Autocomplete
                  size="small"
                  options={cuentas}
                  value={cuenta}
                  onChange={(_, v) => setCuenta(v)}
                  getOptionLabel={(c) => c.alias || c.id_cuenta_bancaria}
                  isOptionEqualToValue={(a, b) => a.id_cuenta_bancaria === b.id_cuenta_bancaria}
                  renderInput={(params) => <TextField {...params} label="Cuenta bancaria" />}
                />
                {filtroCorteImportado && (
                  <Chip
                    label="Filtrando: solo lo recién importado"
                    onDelete={() => setFiltroCorteImportado(null)}
                    color="success"
                    variant="filled"
                    size="small"
                  />
                )}
              </FiltrosBar>

              {resultadoAuto && (
                <Alert severity="success" sx={{ m: 2 }} onClose={() => setResultadoAuto(null)}>
                  {resultadoAuto.conciliados} movimiento(s) conciliado(s) automáticamente.{" "}
                  {resultadoAuto.ambiguos > 0 &&
                    `${resultadoAuto.ambiguos} con más de un candidato (revisar a mano). `}
                  {resultadoAuto.sin_match > 0 && `${resultadoAuto.sin_match} sin ningún candidato.`}
                </Alert>
              )}

              {!cuenta ? (
                <Alert severity="info">Elige una cuenta bancaria para ver sus movimientos.</Alert>
              ) : (
              // Sub-tabs pegados a la tabla, un solo Paper (11/Sep/2026),
              // separado del FiltrosBar por el vacio normal entre tarjetas
              // (mismo patron que Saldos).
              <Paper variant="outlined">
                <Tabs
                  value={subTab}
                  onChange={(_, v) => setSubTab(v)}
                  sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}
                >
                  <Tab value="todos" label={`Todos (${movimientosPorEstado.todos.length})`} />
                  <Tab value="conciliados" label={`Conciliados (${movimientosPorEstado.conciliados.length})`} />
                  <Tab value="sin_conciliar" label={`Sin conciliar (${movimientosPorEstado.sin_conciliar.length})`} />
                </Tabs>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Descripción</TableCell>
                        <TableCell>Referencia</TableCell>
                        <TableCell align="right">Cargo</TableCell>
                        <TableCell align="right">Abono</TableCell>
                        <TableCell>Flujo ligado</TableCell>
                        <TableCell align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center">
                            <CircularProgress size={20} />
                          </TableCell>
                        </TableRow>
                      ) : movimientosVisibles.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center">
                            <Typography variant="body2" color="text.secondary">
                              Sin movimientos {subTab === "sin_conciliar" ? "pendientes de conciliar" : "importados"}.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        movimientosVisibles.map((m) => (
                          <TableRow key={m.id} hover>
                            <TableCell>{m.fecha}</TableCell>
                            <TableCell>{m.descripcion || "—"}</TableCell>
                            <TableCell>{m.referencia || "—"}</TableCell>
                            <TableCell align="right">{formatMonto(m.cargo)}</TableCell>
                            <TableCell align="right">{formatMonto(m.abono)}</TableCell>
                            <TableCell>
                              {m.flujo ? (
                                <Chip
                                  label={`${m.flujo} — ${m.flujo_concepto || ""}`}
                                  size="small"
                                  color="success"
                                  onDelete={() => handleDesvincular(m.id)}
                                />
                              ) : (
                                <Chip label="Sin conciliar" size="small" variant="outlined" />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              {!m.flujo && (
                                <Button
                                  size="small"
                                  onClick={() => handleVerSugerencias(m)}
                                  disabled={cargandoSugerencias === m.id}
                                >
                                  {cargandoSugerencias === m.id ? <CircularProgress size={14} /> : "Sugerencias"}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
              )}
            </>
          )}

      {tab === 1 && (
            <>
              <FiltrosBar
                hideSearch
                search=""
                onSearchChange={() => undefined}
                actions={
                  <Button
                    variant="contained"
                    disabled={!cuenta || reporteLoading}
                    onClick={handleVerReporte}
                    sx={{ flexShrink: 0 }}
                  >
                    {reporteLoading ? <CircularProgress size={16} /> : "Ver reporte"}
                  </Button>
                }
              >
                <Autocomplete
                  size="small"
                  options={cuentas}
                  value={cuenta}
                  onChange={(_, v) => setCuenta(v)}
                  getOptionLabel={(c) => c.alias || c.id_cuenta_bancaria}
                  isOptionEqualToValue={(a, b) => a.id_cuenta_bancaria === b.id_cuenta_bancaria}
                  renderInput={(params) => <TextField {...params} label="Cuenta bancaria" />}
                />
                <TextField
                  size="small"
                  type="date"
                  label="Desde"
                  value={fechaInicioReporte}
                  onChange={(e) => setFechaInicioReporte(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  size="small"
                  type="date"
                  label="Hasta"
                  value={fechaFinReporte}
                  onChange={(e) => setFechaFinReporte(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </FiltrosBar>

              {!cuenta ? (
                <Alert severity="info">Elige una cuenta bancaria para generar el reporte.</Alert>
              ) : reporteLoading ? (
                <CircularProgress size={24} />
              ) : !reporte ? (
                <Alert severity="info">Da clic en "Ver reporte" para generarlo.</Alert>
              ) : (
                <Stack spacing={3}>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total banco
                        </Typography>
                        <Typography variant="h6">${formatMonto(reporte.totales.total_movimientos_banco)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total conciliado
                        </Typography>
                        <Typography variant="h6">${formatMonto(reporte.totales.total_conciliado)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Sin conciliar (banco)
                        </Typography>
                        <Typography variant="h6" color="warning.main">
                          ${formatMonto(reporte.totales.total_sin_conciliar_banco)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Sin conciliar (interno)
                        </Typography>
                        <Typography variant="h6" color="warning.main">
                          ${formatMonto(reporte.totales.total_sin_conciliar_interno)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Paper>

                  <Paper variant="outlined">
                    <Tabs
                      value={subTabReporte}
                      onChange={(_, v) => setSubTabReporte(v)}
                      sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}
                    >
                      <Tab value="conciliados" label={`Conciliados (${reporte.conciliados.length})`} />
                      <Tab
                        value="sin_conciliar_banco"
                        label={`Sin conciliar (banco) (${reporte.sin_conciliar_banco.length})`}
                      />
                      <Tab
                        value="sin_conciliar_interno"
                        label={`Sin conciliar (interno) (${reporte.sin_conciliar_interno.length})`}
                      />
                    </Tabs>

                    {subTabReporte === "conciliados" && (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Fecha</TableCell>
                              <TableCell>Descripción</TableCell>
                              <TableCell align="right">Monto banco</TableCell>
                              <TableCell>Flujo</TableCell>
                              <TableCell align="right">Monto flujo</TableCell>
                              <TableCell align="right">Diferencia</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {reporte.conciliados.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} align="center">
                                  <Typography variant="body2" color="text.secondary">
                                    Sin movimientos conciliados.
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              reporte.conciliados.map((c) => (
                                <TableRow key={c.id}>
                                  <TableCell>{c.fecha}</TableCell>
                                  <TableCell>{c.descripcion || "—"}</TableCell>
                                  <TableCell align="right">{formatMonto(c.monto)}</TableCell>
                                  <TableCell>
                                    {c.id_flujo} — {c.concepto_flujo || ""}
                                  </TableCell>
                                  <TableCell align="right">{formatMonto(c.total_flujo)}</TableCell>
                                  <TableCell align="right">
                                    <Typography color={c.cuadra ? "success.main" : "error.main"} variant="body2">
                                      {formatMonto(c.diferencia)}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}

                    {subTabReporte === "sin_conciliar_banco" && (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Fecha</TableCell>
                              <TableCell>Descripción</TableCell>
                              <TableCell>Referencia</TableCell>
                              <TableCell align="right">Monto</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {reporte.sin_conciliar_banco.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} align="center">
                                  <Typography variant="body2" color="text.secondary">
                                    Sin movimientos de banco pendientes.
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              reporte.sin_conciliar_banco.map((f) => (
                                <TableRow key={f.id}>
                                  <TableCell>{f.fecha}</TableCell>
                                  <TableCell>{f.descripcion || "—"}</TableCell>
                                  <TableCell>{f.referencia || "—"}</TableCell>
                                  <TableCell align="right">{formatMonto(f.monto)}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}

                    {subTabReporte === "sin_conciliar_interno" && (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Flujo</TableCell>
                              <TableCell>Concepto</TableCell>
                              <TableCell>Fecha</TableCell>
                              <TableCell align="right">Monto</TableCell>
                              <TableCell>Pagado</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {reporte.sin_conciliar_interno.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} align="center">
                                  <Typography variant="body2" color="text.secondary">
                                    Sin Flujos internos pendientes.
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              reporte.sin_conciliar_interno.map((f) => (
                                <TableRow key={f.id_flujo}>
                                  <TableCell>{f.id_flujo}</TableCell>
                                  <TableCell>{f.concepto || "—"}</TableCell>
                                  <TableCell>{f.fecha_pago || f.fecha_efectiva || "—"}</TableCell>
                                  <TableCell align="right">{formatMonto(f.total_mxp)}</TableCell>
                                  <TableCell>{f.pagado ? "Sí" : "No"}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Paper>
                </Stack>
              )}
            </>
          )}

      {/* Diálogo: importar extracto */}
      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Importar extracto bancario
          <Button
            onClick={() => setImportDialogOpen(false)}
            sx={{ position: "absolute", right: 8, top: 8, minWidth: 0, p: 0.5 }}
          >
            <CloseIcon size={18} />
          </Button>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sube el estado de cuenta en CSV o Excel (.xlsx). Se acepta cualquier alias razonable de
            columna (Fecha/Date, Cargo/Débito/Retiro, Abono/Crédito/Depósito, Saldo/Balance).
          </Typography>
          <Button component="label" variant="outlined" startIcon={<Upload size={16} strokeWidth={1.5} />} fullWidth>
            {archivo ? archivo.name : "Seleccionar archivo"}
            <input
              type="file"
              hidden
              accept=".csv,.xlsx,.xlsm"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
            />
          </Button>
          {importResultado && (
            <Alert severity={importResultado.errores.length > 0 ? "warning" : "success"} sx={{ mt: 2 }}>
              {importResultado.importados} movimiento(s) importado(s).
              {importResultado.errores.length > 0 && (
                <>
                  <br />
                  {importResultado.errores.length} fila(s) con error: {importResultado.errores.join("; ")}
                </>
              )}
              {corteImportado?.link ? (
                <>
                  <br />
                  <MuiLink href={corteImportado.link} target="_blank" rel="noopener">
                    Ver extracto original en Drive
                  </MuiLink>
                </>
              ) : (
                <>
                  <br />
                  <Typography variant="caption" color="text.secondary">
                    No se pudo subir el archivo original a Drive (no bloquea la importación).
                  </Typography>
                </>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cerrar</Button>
          {importResultado ? (
            <Button variant="contained" onClick={() => setImportDialogOpen(false)}>
              Ver lo importado
            </Button>
          ) : (
            <Button variant="contained" disabled={!archivo || importando} onClick={handleImportar}>
              {importando ? <CircularProgress size={16} /> : "Importar"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Diálogo: sugerencias de flujo para un movimiento */}
      <Dialog open={!!sugerenciasDialog} onClose={() => setSugerenciasDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Candidatos para conciliar</DialogTitle>
        <DialogContent>
          {sugerenciasDialog && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Movimiento del {sugerenciasDialog.movimiento.fecha}: {sugerenciasDialog.movimiento.descripcion || "—"} — $
                {formatMonto((sugerenciasDialog.movimiento.abono || sugerenciasDialog.movimiento.cargo) ?? null)}
              </Typography>
              {sugerenciasDialog.opciones.length === 0 ? (
                <Alert severity="info">Sin candidatos por monto/fecha. Liga el flujo a mano si sabes cuál es.</Alert>
              ) : (
                <Stack spacing={1}>
                  {sugerenciasDialog.opciones.map((s) => (
                    <Paper key={s.id_flujo} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {s.id_flujo} — {s.concepto || "—"} — ${formatMonto(s.total_mxp)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {s.motivos.join(" · ")}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={vinculando === s.id_flujo}
                          onClick={() => handleVincular(sugerenciasDialog.movimiento.id, s.id_flujo)}
                        >
                          {vinculando === s.id_flujo ? <CircularProgress size={14} /> : "Vincular"}
                        </Button>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Ninguno coincide — precargar un Flujo nuevo
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                Cuenta, concepto y monto ya vienen del estado de cuenta; solo falta el contrato.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Autocomplete
                  size="small"
                  fullWidth
                  options={contratos}
                  value={contratoNuevoFlujo}
                  onChange={(_, valor) => setContratoNuevoFlujo(valor)}
                  getOptionLabel={(c) => `${c.id_contrato}${c.contraparte_nombre ? ` — ${c.contraparte_nombre}` : ""}`}
                  isOptionEqualToValue={(a, b) => a.id_contrato === b.id_contrato}
                  renderInput={(params) => <TextField {...params} label="Contrato" />}
                />
                <Button
                  variant="contained"
                  disabled={!contratoNuevoFlujo || creandoFlujo}
                  onClick={handleCrearFlujo}
                  sx={{ flexShrink: 0 }}
                >
                  {creandoFlujo ? <CircularProgress size={16} /> : "Crear Flujo"}
                </Button>
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSugerenciasDialog(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
