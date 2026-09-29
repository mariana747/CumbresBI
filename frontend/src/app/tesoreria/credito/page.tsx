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
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ArrowDownCircle, ArrowUpCircle, Eye, MoreVertical, Pencil, Trash2, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  TesoreriaCuenta,
  TesoreriaFlujo,
  TesoreriaSaldo,
  deleteFlujo,
  listCuentas,
  listFlujos,
  listSaldos,
  registrarMovimientoCredito,
  updateFlujo,
} from "@/lib/tesoreria";

function hoyLocal(): string {
  const ahora = new Date();
  const sinOffset = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return sinOffset.toISOString().slice(0, 10);
}

const FORM_VACIO = {
  tipo: "ministracion" as "ministracion" | "pago",
  cuentaCheques: null as TesoreriaCuenta | null,
  monto: "",
  fechaEfectiva: "",
  concepto: "",
};

function fmtMXP(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "number" ? valor : parseFloat(valor as string);
  return isNaN(n) ? String(valor) : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fmtFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

interface BalanceRow {
  deudaAntes: number;
  deudaDespues: number;
  dispAntes: number | null;
  dispDespues: number | null;
}

export default function TesoreriaCreditoPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [cuentasNormales, setCuentasNormales] = useState<TesoreriaCuenta[]>([]);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<TesoreriaCuenta | null>(null);
  const [saldoActual, setSaldoActual] = useState<TesoreriaSaldo | null>(null);
  const [flujos, setFlujos] = useState<TesoreriaFlujo[]>([]);
  const [totalFlujos, setTotalFlujos] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");

  // Dialog de nueva ministración/pago
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dialog de detalle (ojo)
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleIdx, setDetalleIdx] = useState<number | null>(null);

  // Menú de 3 puntos
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuIdx, setMenuIdx] = useState<number | null>(null);

  // Dialog de edición
  const [editOpen, setEditOpen] = useState(false);
  const [editFlujo, setEditFlujo] = useState<TesoreriaFlujo | null>(null);
  const [editConcepto, setEditConcepto] = useState("");
  const [editFecha, setEditFecha] = useState("");
  const [editMonto, setEditMonto] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Dialog de confirmación de borrado
  const [borrarOpen, setBorrarOpen] = useState(false);
  const [borrarFlujo, setBorrarFlujo] = useState<TesoreriaFlujo | null>(null);
  const [borrarSaving, setBorrarSaving] = useState(false);
  const [borrarError, setBorrarError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listCuentas(undefined, undefined, 200)
      .then((res) => {
        const todas = res.results;
        setCuentas(todas.filter((c) => c.tipo === "CREDITO"));
        setCuentasNormales(todas.filter((c) => c.tipo !== "CREDITO"));
      })
      .catch(() => {});
  }, []);

  const cuentasCredito = useMemo(() => cuentas, [cuentas]);

  function etiquetaCuenta(c: TesoreriaCuenta): string {
    const sociedad = sociedades.find((s) => s.rfc === c.sociedad);
    const partes = [
      sociedad?.alias_sociedad,
      c.banco_alias || c.banco_nombre,
      c.cuenta ? c.cuenta.slice(-4) : c.clabe ? c.clabe.slice(-4) : null,
    ]
      .filter(Boolean)
      .join("/");
    return partes ? `${partes} — ${c.alias || c.id_cuenta_bancaria}` : c.alias || c.id_cuenta_bancaria;
  }

  async function refreshFlujos(cuentaId: string) {
    setLoading(true);
    setError(null);
    try {
      const [flujosRes, saldosRes] = await Promise.all([
        listFlujos({
          cuenta: cuentaId,
          fechaDesde: filtroFechaDesde || undefined,
          fechaHasta: filtroFechaHasta || undefined,
          page: pagina + 1,
          pageSize: filasPorPagina,
        }),
        listSaldos(cuentaId, 1, 1),
      ]);
      setFlujos(flujosRes.results);
      setTotalFlujos(flujosRes.count);
      setSaldoActual(saldosRes.results[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar movimientos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (cuentaSeleccionada) {
      refreshFlujos(cuentaSeleccionada.id_cuenta_bancaria);
    } else {
      setFlujos([]);
      setTotalFlujos(0);
      setSaldoActual(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaSeleccionada, filtroFechaDesde, filtroFechaHasta, pagina, filasPorPagina]);

  useEffect(() => {
    setPagina(0);
  }, [cuentaSeleccionada, filtroFechaDesde, filtroFechaHasta]);

  // Balances corrientes hacia atrás desde saldoActual
  const balances = useMemo((): BalanceRow[] => {
    if (!saldoActual || flujos.length === 0) return [];
    let deudaDespues = parseFloat(saldoActual.saldo);
    let dispDespues: number | null =
      saldoActual.disponible_ministrar != null ? parseFloat(saldoActual.disponible_ministrar) : null;
    return flujos.map((f) => {
      const monto = f.total_mxp ? parseFloat(f.total_mxp) : 0;
      const deudaAntes = deudaDespues - monto;
      const dispAntes = dispDespues !== null ? dispDespues - monto : null;
      const entry: BalanceRow = { deudaAntes, deudaDespues, dispAntes, dispDespues };
      deudaDespues = deudaAntes;
      dispDespues = dispAntes;
      return entry;
    });
  }, [flujos, saldoActual]);

  const puedeOperar = session?.perm_keys.includes("tesoreria.crear") ?? false;

  function abrirDialog(tipo: "ministracion" | "pago") {
    setForm({ ...FORM_VACIO, tipo, fechaEfectiva: hoyLocal() });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!cuentaSeleccionada) return;
    if (!form.cuentaCheques) {
      setFormError("Selecciona la cuenta de cheques.");
      return;
    }
    const monto = parseFloat(form.monto);
    if (!form.monto || isNaN(monto) || monto <= 0) {
      setFormError("El monto debe ser mayor a 0.");
      return;
    }
    if (!form.fechaEfectiva) {
      setFormError("Ingresa la fecha.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await registrarMovimientoCredito({
        tipo: form.tipo,
        cuentaCredito: cuentaSeleccionada.id_cuenta_bancaria,
        cuentaCheques: form.cuentaCheques.id_cuenta_bancaria,
        monto: form.monto,
        fechaEfectiva: form.fechaEfectiva,
        concepto: form.concepto || undefined,
      });
      setDialogOpen(false);
      await refreshFlujos(cuentaSeleccionada.id_cuenta_bancaria);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  function abrirDetalle(idx: number) {
    setDetalleIdx(idx);
    setDetalleOpen(true);
  }

  function abrirMenu(e: React.MouseEvent<HTMLElement>, idx: number) {
    setMenuAnchor(e.currentTarget);
    setMenuIdx(idx);
  }

  function cerrarMenu() {
    setMenuAnchor(null);
    setMenuIdx(null);
  }

  function abrirEditar() {
    if (menuIdx === null) return;
    const f = flujos[menuIdx];
    setEditFlujo(f);
    setEditConcepto(f.concepto || "");
    setEditFecha(f.fecha_efectiva || "");
    setEditMonto(f.total_mxp ? Math.abs(parseFloat(f.total_mxp)).toString() : "");
    setEditError(null);
    setEditOpen(true);
    cerrarMenu();
  }

  async function handleEditar() {
    if (!editFlujo || !cuentaSeleccionada) return;
    const montoNum = parseFloat(editMonto);
    if (!editMonto || isNaN(montoNum) || montoNum <= 0) {
      setEditError("El monto debe ser mayor a 0.");
      return;
    }
    // Conservar el signo original del flujo
    const esNegativo = editFlujo.total_mxp ? parseFloat(editFlujo.total_mxp) < 0 : false;
    const montoFinal = esNegativo ? -montoNum : montoNum;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateFlujo(editFlujo.id_flujo, {
        concepto: editConcepto || undefined,
        fechaEfectiva: editFecha || undefined,
        totalMxp: montoFinal.toString(),
      });
      setEditOpen(false);
      await refreshFlujos(cuentaSeleccionada.id_cuenta_bancaria);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setEditSaving(false);
    }
  }

  function abrirBorrar() {
    if (menuIdx === null) return;
    setBorrarFlujo(flujos[menuIdx]);
    setBorrarError(null);
    setBorrarOpen(true);
    cerrarMenu();
  }

  async function handleBorrar() {
    if (!borrarFlujo || !cuentaSeleccionada) return;
    setBorrarSaving(true);
    setBorrarError(null);
    try {
      await deleteFlujo(borrarFlujo.id_flujo);
      setBorrarOpen(false);
      await refreshFlujos(cuentaSeleccionada.id_cuenta_bancaria);
    } catch (err) {
      setBorrarError(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setBorrarSaving(false);
    }
  }

  const detalleF = detalleIdx !== null ? flujos[detalleIdx] : null;
  const detalleBal = detalleIdx !== null ? (balances[detalleIdx] ?? null) : null;
  const esMinistracion = detalleF?.total_mxp ? parseFloat(detalleF.total_mxp) < 0 : false;

  return (
    <AppShell session={session}>
      <Box sx={{ p: 3, maxWidth: 1100, mx: "auto" }}>
         <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h5" fontWeight={600}>
            Líneas de Crédito
          </Typography>
        </Box>

        <FiltrosBar search="" onSearchChange={() => undefined} hideSearch>
          <Paper variant="outlined" sx={{ mb: 2, p: 2 }}>
            <Autocomplete
              size="small"
              options={cuentasCredito}
              value={cuentaSeleccionada}
              onChange={(_, val) => setCuentaSeleccionada(val)}
              getOptionLabel={(c) => etiquetaCuenta(c)}
              isOptionEqualToValue={(a, b) => a.id_cuenta_bancaria === b.id_cuenta_bancaria}
              noOptionsText="Sin cuentas de crédito"
              renderInput={(params) => <TextField {...params} label="Cuenta de crédito" />}
            />

            {cuentaSeleccionada && (
              <Stack direction="row" spacing={4} mt={2} flexWrap="wrap">
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Deuda actual
                  </Typography>
                  <Typography variant="h6" color="error.main" fontWeight={600}>
                    {saldoActual ? fmtMXP(saldoActual.saldo) : "—"}
                  </Typography>
                  {saldoActual && (
                    <Typography variant="caption" color="text.secondary">
                      al {fmtFecha(saldoActual.fecha)}
                    </Typography>
                  )}
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Disponible por ministrar
                  </Typography>
                  <Typography variant="h6" color="success.main" fontWeight={600}>
                    {saldoActual?.disponible_ministrar != null
                      ? fmtMXP(saldoActual.disponible_ministrar)
                      : "—"}
                  </Typography>
                  {saldoActual && (
                    <Typography variant="caption" color="text.secondary">
                      al {fmtFecha(saldoActual.fecha)}
                    </Typography>
                  )}
                </Box>
                {!saldoActual && !loading && (
                  <Box sx={{ alignSelf: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin saldo capturado aún. Captura el saldo inicial en Saldos.
                    </Typography>
                  </Box>
                )}
              </Stack>
            )}
          </Paper>
        </FiltrosBar>

        <Paper variant="outlined" sx={{ mb: 8, p: 2 }}>
          {cuentaSeleccionada && (
            <>
              <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap" alignItems="center">
                <TextField
                  size="small"
                  label="Desde"
                  type="date"
                  value={filtroFechaDesde}
                  onChange={(e) => setFiltroFechaDesde(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 160 }}
                />
                <TextField
                  size="small"
                  label="Hasta"
                  type="date"
                  value={filtroFechaHasta}
                  onChange={(e) => setFiltroFechaHasta(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 160 }}
                />
                <Box sx={{ flex: 1 }} />
                {puedeOperar && (
                  <>
                    <Button
                      variant="outlined"
                      color="success"
                      size="small"
                      startIcon={<ArrowDownCircle size={16} />}
                      onClick={() => abrirDialog("ministracion")}
                    >
                      Ministración
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<ArrowUpCircle size={16} />}
                      onClick={() => abrirDialog("pago")}
                    >
                      Pago
                    </Button>
                  </>
                )}
              </Stack>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <Paper variant="outlined">
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Tipo</TableCell>
                        <TableCell>Concepto</TableCell>
                        <TableCell align="right">Monto</TableCell>
                        <TableCell width={96} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loading && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                            <CircularProgress size={24} />
                          </TableCell>
                        </TableRow>
                      )}
                      {!loading && flujos.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                            Sin movimientos registrados.
                          </TableCell>
                        </TableRow>
                      )}
                      {!loading &&
                        flujos.map((f, idx) => {
                          const monto = f.total_mxp ? parseFloat(f.total_mxp) : null;
                          const esMinistrado = monto !== null && monto < 0;
                          return (
                            <TableRow key={f.id_flujo} hover>
                              <TableCell>{fmtFecha(f.fecha_efectiva)}</TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={esMinistrado ? "Ministración" : "Pago"}
                                  color={esMinistrado ? "success" : "error"}
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>{f.concepto || "—"}</TableCell>
                              <TableCell align="right">
                                <Typography
                                  variant="body2"
                                  color={esMinistrado ? "error.main" : "success.main"}
                                  fontWeight={500}
                                >
                                  {fmtMXP(f.total_mxp)}
                                </Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ pr: 1 }}>
                                <Stack direction="row" justifyContent="flex-end">
                                  <Tooltip title="Ver detalle">
                                    <IconButton size="small" onClick={() => abrirDetalle(idx)}>
                                      <Eye size={15} />
                                    </IconButton>
                                  </Tooltip>
                                  {puedeOperar && (
                                    <IconButton size="small" onClick={(e) => abrirMenu(e, idx)}>
                                      <MoreVertical size={15} />
                                    </IconButton>
                                  )}
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={totalFlujos}
                  page={pagina}
                  onPageChange={(_, p) => setPagina(p)}
                  rowsPerPage={filasPorPagina}
                  onRowsPerPageChange={(e) => {
                    setFilasPorPagina(parseInt(e.target.value));
                    setPagina(0);
                  }}
                  rowsPerPageOptions={[25, 50, 100]}
                  labelRowsPerPage="Por página"
                />
              </Paper>
            </>
          )}
        </Paper>
      </Box>

      {/* ── Menú de 3 puntos ── */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={cerrarMenu}>
        <MenuItem onClick={abrirEditar}>
          <Pencil size={14} style={{ marginRight: 8 }} />
          Editar
        </MenuItem>
        <MenuItem onClick={abrirBorrar} sx={{ color: "error.main" }}>
          <Trash2 size={14} style={{ marginRight: 8 }} />
          Eliminar
        </MenuItem>
      </Menu>

      {/* ── Dialog nueva ministración/pago ── */}
      <Dialog
        open={dialogOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setDialogOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            {form.tipo === "ministracion" ? "Registrar Ministración" : "Registrar Pago"}
            <IconButton size="small" onClick={() => setDialogOpen(false)}>
              <CloseIcon size={16} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <Autocomplete
              size="small"
              options={cuentasNormales}
              value={form.cuentaCheques}
              onChange={(_, val) => setForm({ ...form, cuentaCheques: val })}
              getOptionLabel={(c) => etiquetaCuenta(c)}
              isOptionEqualToValue={(a, b) => a.id_cuenta_bancaria === b.id_cuenta_bancaria}
              noOptionsText="Sin cuentas disponibles"
              renderInput={(params) => <TextField {...params} label="Cuenta de cheques" />}
            />

            <TextField
              size="small"
              label="Monto"
              type="number"
              value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              fullWidth
            />

            <TextField
              size="small"
              label="Fecha"
              type="date"
              value={form.fechaEfectiva}
              onChange={(e) => setForm({ ...form, fechaEfectiva: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              size="small"
              label="Concepto (opcional)"
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              fullWidth
            />

            <Alert severity="info" sx={{ fontSize: 12 }}>
              {form.tipo === "ministracion"
                ? "Ingreso a cheques + uso de crédito. El disponible se reduce automáticamente."
                : "Egreso de cheques + abono al crédito. El disponible aumenta automáticamente."}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardar} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog detalle (ojo) ── */}
      <Dialog
        open={detalleOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setDetalleOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            Detalle del movimiento
            <IconButton size="small" onClick={() => setDetalleOpen(false)}>
              <CloseIcon size={16} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {detalleF && (
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, width: 160, color: "text.secondary" }}>Fecha</TableCell>
                  <TableCell>{fmtFecha(detalleF.fecha_efectiva)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>Tipo</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={esMinistracion ? "Ministración" : "Pago"}
                      color={esMinistracion ? "success" : "error"}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>Concepto</TableCell>
                  <TableCell>{detalleF.concepto || "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>Monto</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={esMinistracion ? "error.main" : "success.main"}
                    >
                      {fmtMXP(detalleF.total_mxp)}
                    </Typography>
                  </TableCell>
                </TableRow>
                {detalleBal ? (
                  <>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>Deuda antes</TableCell>
                      <TableCell>{fmtMXP(detalleBal.deudaAntes)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>Deuda después</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="error.main" fontWeight={500}>
                          {fmtMXP(detalleBal.deudaDespues)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {detalleBal.dispAntes !== null && (
                      <>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>Disponible antes</TableCell>
                          <TableCell>{fmtMXP(detalleBal.dispAntes)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 500, color: "text.secondary" }}>Disponible después</TableCell>
                          <TableCell>
                            <Typography variant="body2" color="success.main" fontWeight={500}>
                              {fmtMXP(detalleBal.dispDespues)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} sx={{ color: "text.secondary", fontStyle: "italic" }}>
                      Captura el saldo inicial en Saldos para ver los balances antes/después.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetalleOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog editar ── */}
      <Dialog
        open={editOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setEditOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            Editar movimiento
            <IconButton size="small" onClick={() => setEditOpen(false)}>
              <CloseIcon size={16} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {editError && <Alert severity="error">{editError}</Alert>}
            <TextField
              size="small"
              label="Monto"
              type="number"
              value={editMonto}
              onChange={(e) => setEditMonto(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              fullWidth
            />
            <TextField
              size="small"
              label="Fecha"
              type="date"
              value={editFecha}
              onChange={(e) => setEditFecha(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              size="small"
              label="Concepto"
              value={editConcepto}
              onChange={(e) => setEditConcepto(e.target.value)}
              fullWidth
            />
            <Alert severity="warning" sx={{ fontSize: 12 }}>
              Editar el monto no recalcula el saldo automáticamente. Ajusta el saldo inicial en Saldos si es necesario.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleEditar} disabled={editSaving}>
            {editSaving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog confirmar borrado ── */}
      <Dialog
        open={borrarOpen}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setBorrarOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            Eliminar movimiento
            <IconButton size="small" onClick={() => setBorrarOpen(false)}>
              <CloseIcon size={16} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} mt={1}>
            {borrarError && <Alert severity="error">{borrarError}</Alert>}
            <Typography variant="body2">
              ¿Eliminar el movimiento del {fmtFecha(borrarFlujo?.fecha_efectiva)}{" "}
              por <strong>{fmtMXP(borrarFlujo?.total_mxp)}</strong>?
            </Typography>
            <Alert severity="warning" sx={{ fontSize: 12 }}>
              Solo se elimina el flujo de la cuenta de crédito. El flujo correspondiente en la cuenta de cheques queda registrado.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBorrarOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleBorrar} disabled={borrarSaving}>
            {borrarSaving ? <CircularProgress size={16} /> : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
