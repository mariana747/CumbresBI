"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ChevronDown, ChevronRight, FileBarChart, Mail, RefreshCw, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  ReporteDiario,
  ReporteDiarioCuenta,
  TesoreriaContrato,
  TesoreriaCuenta,
  arrastrarSaldo,
  createFlujo,
  enviarReporteDiario,
  getReporteDiario,
  listContratos,
  listCuentas,
} from "@/lib/tesoreria";

// Reporte diario de saldos (26/Ago/2026, ver documentos/finanzas.md:
// "Generate daily reports on bank transactions") - por empresa (seleccion
// multiple), trae las cuentas activas de esas empresas y compara las
// transacciones (Flujos) del dia contra el cambio de saldo de cada una.
// Calculo real en tesoreria-service/tesoreria/reportes.py - esta pantalla
// solo pide/muestra/envia, no calcula nada del lado del cliente.
export default function TesoreriaReporteDiarioPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [sociedadesElegidas, setSociedadesElegidas] = useState<GeneralSociedad[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  // Filtro por cuenta (09/Sep/2026, "en reporte diario, debe hacerse pero
  // por cuenta") - las opciones salen del reporte ya generado, no de un
  // catalogo aparte, para no mostrar cuentas de empresas no elegidas.
  const [filtroCuenta, setFiltroCuenta] = useState("");
  const [reporte, setReporte] = useState<ReporteDiario | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  // Envio por correo
  const [envioAbierto, setEnvioAbierto] = useState(false);
  const [destinatarios, setDestinatarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [envioError, setEnvioError] = useState<string | null>(null);
  const [envioOk, setEnvioOk] = useState(false);

  // RENDIMIENTOS - cuentas de inversion (finanzas.md: "the user will have
  // the option to add a transaction record with the description
  // 'RENDIMIENTOS'... choose the contract to relate it to").
  const [rendimientosCuenta, setRendimientosCuenta] = useState<ReporteDiarioCuenta | null>(null);
  // Detalle de Flujos por cuenta (09/Sep/2026, "agrega flujos para verlos
  // en el reporte diario") - antes solo se veia la suma, no cada
  // transaccion real.
  const [cuentasExpandidas, setCuentasExpandidas] = useState<Set<string>>(new Set());
  function toggleCuentaExpandida(id: string) {
    setCuentasExpandidas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  const [rendimientosContrato, setRendimientosContrato] = useState("");
  const [rendimientosMonto, setRendimientosMonto] = useState("");
  const [guardandoRendimientos, setGuardandoRendimientos] = useState(false);
  const [rendimientosError, setRendimientosError] = useState<string | null>(null);
  // Cuentas del catalogo (09/Sep/2026, "debe aparecer antes de generar") -
  // antes las opciones del filtro salian del reporte ya generado, asi que
  // el filtro no existia hasta darle "Generar" - ahora se cargan aparte,
  // igual que en Balanza (saldos/page.tsx).
  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listContratos().then(setContratos).catch(() => setContratos([]));
    listCuentas().then(setCuentas).catch(() => setCuentas([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;

  function generar() {
    if (sociedadesElegidas.length === 0) {
      setError("Elige al menos una empresa.");
      return;
    }
    setLoading(true);
    setError(null);
    getReporteDiario(
      sociedadesElegidas.map((s) => s.rfc),
      fecha
    )
      .then(setReporte)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  async function handleArrastrar(cuenta: ReporteDiarioCuenta) {
    setArrastrando(cuenta.id_cuenta_bancaria);
    try {
      await arrastrarSaldo(cuenta.id_cuenta_bancaria, fecha);
      generar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setArrastrando(null);
    }
  }

  async function handleEnviar() {
    const lista = destinatarios
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (lista.length === 0) {
      setEnvioError("Captura al menos un correo.");
      return;
    }
    setEnviando(true);
    setEnvioError(null);
    setEnvioOk(false);
    try {
      const resultado = await enviarReporteDiario(
        sociedadesElegidas.map((s) => s.rfc),
        fecha,
        lista
      );
      if (resultado.enviado) {
        setEnvioOk(true);
      } else {
        setEnvioError("El correo no se pudo entregar. Intenta de nuevo en un momento.");
      }
    } catch (err) {
      setEnvioError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setEnviando(false);
    }
  }

  function abrirRendimientos(cuenta: ReporteDiarioCuenta) {
    setRendimientosCuenta(cuenta);
    setRendimientosContrato("");
    setRendimientosMonto("");
    setRendimientosError(null);
  }

  async function handleGuardarRendimientos() {
    if (!rendimientosCuenta) return;
    if (!rendimientosContrato || !rendimientosMonto) {
      setRendimientosError("Selecciona el contrato y captura el monto.");
      return;
    }
    setGuardandoRendimientos(true);
    setRendimientosError(null);
    try {
      await createFlujo({
        contrato: rendimientosContrato,
        cuenta: rendimientosCuenta.id_cuenta_bancaria,
        concepto: "RENDIMIENTOS",
        totalMxp: rendimientosMonto,
        fechaEfectiva: fecha,
      });
      setRendimientosCuenta(null);
      generar();
    } catch (err) {
      setRendimientosError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardandoRendimientos(false);
    }
  }

  function numero(valor: string | null): string {
    if (valor === null) return "—";
    return Number(valor).toLocaleString("es-MX", { minimumFractionDigits: 2 });
  }

  // Cuentas del catalogo, acotadas a las empresas elegidas (si hay alguna
  // elegida) - independiente de si ya se genero el reporte, para que el
  // filtro exista desde antes de darle "Generar".
  const cuentasDelReporte = useMemo(() => {
    if (sociedadesElegidas.length === 0) return cuentas;
    const rfcs = new Set(sociedadesElegidas.map((s) => s.rfc));
    return cuentas.filter((c) => c.sociedad && rfcs.has(c.sociedad));
  }, [cuentas, sociedadesElegidas]);
  const sociedadesFiltradas = useMemo(() => {
    if (!reporte) return [];
    if (!filtroCuenta) return reporte.sociedades;
    return reporte.sociedades
      .map((empresa) => ({ ...empresa, cuentas: empresa.cuentas.filter((c) => c.id_cuenta_bancaria === filtroCuenta) }))
      .filter((empresa) => empresa.cuentas.length > 0);
  }, [reporte, filtroCuenta]);

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileBarChart size={22} strokeWidth={1.5} />
        <Typography variant="h5">Reporte Diario de Saldos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Por empresa — compara las transacciones del día contra el cambio de saldo de cada cuenta.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "flex-end" }}>
          <Autocomplete
            multiple
            size="small"
            options={sociedades}
            value={sociedadesElegidas}
            onChange={(_, valor) => setSociedadesElegidas(valor)}
            getOptionLabel={(s) => s.alias_sociedad || s.razon_social || s.rfc}
            isOptionEqualToValue={(a, b) => a.rfc === b.rfc}
            renderInput={(params) => <TextField {...params} label="Empresas" placeholder="Elige una o más" />}
            sx={{ flex: 2, minWidth: 240 }}
          />
          <TextField
            size="small"
            type="date"
            label="Fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1, minWidth: 160 }}
          />
          {cuentasDelReporte.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="filtro-cuenta-reporte-label">Filtrar por cuenta</InputLabel>
              <Select
                labelId="filtro-cuenta-reporte-label"
                label="Filtrar por cuenta"
                value={filtroCuenta}
                onChange={(e) => setFiltroCuenta(e.target.value)}
              >
                <MenuItem value="">
                  <em>Todas las cuentas</em>
                </MenuItem>
                {cuentasDelReporte.map((c) => (
                  <MenuItem key={c.id_cuenta_bancaria} value={c.id_cuenta_bancaria}>
                    {c.alias}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button variant="contained" onClick={generar} disabled={loading} sx={{ flexShrink: 0 }}>
            {loading ? <CircularProgress size={16} /> : "Generar"}
          </Button>
          {reporte && (
            <Button
              variant="outlined"
              startIcon={<Mail size={14} strokeWidth={2} />}
              onClick={() => {
                setEnvioAbierto(true);
                setEnvioOk(false);
                setEnvioError(null);
              }}
              sx={{ flexShrink: 0 }}
            >
              Enviar por correo
            </Button>
          )}
        </Stack>
      </Paper>

      {reporte && (
        <>
          {sociedadesFiltradas.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {filtroCuenta ? "Sin resultados para la cuenta elegida." : "Sin cuentas activas para las empresas elegidas."}
              </Typography>
            </Paper>
          ) : (
            sociedadesFiltradas.map((empresa) => {
              const nombreEmpresa =
                sociedades.find((s) => s.rfc === empresa.sociedad)?.alias_sociedad || empresa.sociedad || "Sin empresa";
              return (
                <Paper key={empresa.sociedad} variant="outlined" sx={{ mb: 3 }}>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ p: 2, pb: 1 }}>
                    {nombreEmpresa}
                  </Typography>
                  <Box sx={{ display: { xs: "none", sm: "block" } }}>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox" />
                            <TableCell>Cuenta</TableCell>
                            <TableCell align="right">Saldo anterior</TableCell>
                            <TableCell align="right">Saldo hoy</TableCell>
                            <TableCell align="right">Cambio</TableCell>
                            <TableCell align="right">Transacciones</TableCell>
                            <TableCell align="right">Diferencia</TableCell>
                            <TableCell align="right">Acciones</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {empresa.cuentas.map((c) => {
                            const expandida = cuentasExpandidas.has(c.id_cuenta_bancaria);
                            return (
                            <Fragment key={c.id_cuenta_bancaria}>
                            <TableRow hover>
                              <TableCell padding="checkbox">
                                {c.transacciones.length > 0 && (
                                  <IconButton size="small" onClick={() => toggleCuentaExpandida(c.id_cuenta_bancaria)}>
                                    {expandida ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}
                                  </IconButton>
                                )}
                              </TableCell>
                              <TableCell>
                                {c.alias}
                                {c.tipo === "INVERSION" && (
                                  <Chip size="small" label="Inversión" variant="outlined" sx={{ ml: 1 }} />
                                )}
                              </TableCell>
                              <TableCell align="right">{numero(c.saldo_anterior)}</TableCell>
                              <TableCell align="right">{numero(c.saldo_hoy)}</TableCell>
                              <TableCell align="right">{numero(c.cambio)}</TableCell>
                              <TableCell align="right">{numero(c.suma_transacciones)}</TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  fontWeight: 700,
                                  color: c.diferencia === null ? "text.secondary" : c.cuadra ? "success.main" : "error.main",
                                }}
                              >
                                {numero(c.diferencia)}
                              </TableCell>
                              <TableCell align="right">
                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                  {!c.tiene_saldo_hoy && puedeCrear && (
                                    <IconButton
                                      size="small"
                                      aria-label="Arrastrar saldo del día anterior"
                                      onClick={() => handleArrastrar(c)}
                                      disabled={arrastrando === c.id_cuenta_bancaria}
                                    >
                                      <RefreshCw size={14} strokeWidth={1.5} />
                                    </IconButton>
                                  )}
                                  {c.tipo === "INVERSION" && puedeCrear && (
                                    <Button size="small" onClick={() => abrirRendimientos(c)}>
                                      Rendimientos
                                    </Button>
                                  )}
                                </Stack>
                              </TableCell>
                            </TableRow>
                            {c.transacciones.length > 0 && (
                              <TableRow>
                                <TableCell colSpan={8} sx={{ py: 0, borderBottom: expandida ? undefined : "none" }}>
                                  <Collapse in={expandida} timeout="auto" unmountOnExit>
                                    <Table size="small" sx={{ my: 1 }}>
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>ID Flujo</TableCell>
                                          <TableCell>Concepto</TableCell>
                                          <TableCell align="right">Total MXP</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {c.transacciones.map((t) => (
                                          <TableRow key={t.id_flujo}>
                                            <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{t.id_flujo}</TableCell>
                                            <TableCell>
                                              <Stack direction="row" spacing={0.75} alignItems="center">
                                                <span>{t.concepto || "—"}</span>
                                                {t.nomina_tipo && (
                                                  <Chip
                                                    size="small"
                                                    variant="outlined"
                                                    label={t.nomina_tipo === "QUINCENAL" ? "Nómina Quincenal" : "Nómina Semanal"}
                                                    sx={{ borderRadius: 0.5 }}
                                                  />
                                                )}
                                              </Stack>
                                            </TableCell>
                                            <TableCell align="right">{numero(t.total_mxp)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Collapse>
                                </TableCell>
                              </TableRow>
                            )}
                            </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>

                  {/* Tarjetas - solo celular (xs), mismo criterio que el resto de Tesoreria. */}
                  <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
                    {empresa.cuentas.map((c) => (
                      <Paper key={c.id_cuenta_bancaria} variant="outlined" sx={{ p: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                          <Typography variant="subtitle2">
                            {c.alias}
                            {c.tipo === "INVERSION" && (
                              <Chip size="small" label="Inversión" variant="outlined" sx={{ ml: 1 }} />
                            )}
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                            {!c.tiene_saldo_hoy && puedeCrear && (
                              <IconButton size="small" aria-label="Arrastrar saldo" onClick={() => handleArrastrar(c)}>
                                <RefreshCw size={14} strokeWidth={1.5} />
                              </IconButton>
                            )}
                          </Stack>
                        </Stack>
                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                          <Typography variant="body2">
                            <strong>Saldo anterior:</strong> {numero(c.saldo_anterior)}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Saldo hoy:</strong> {numero(c.saldo_hoy)}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Cambio:</strong> {numero(c.cambio)}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Transacciones:</strong> {numero(c.suma_transacciones)}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ color: c.diferencia === null ? "text.secondary" : c.cuadra ? "success.main" : "error.main", fontWeight: 700 }}
                          >
                            Diferencia: {numero(c.diferencia)}
                          </Typography>
                          {c.tipo === "INVERSION" && puedeCrear && (
                            <Button size="small" onClick={() => abrirRendimientos(c)} sx={{ alignSelf: "flex-start" }}>
                              Registrar rendimientos
                            </Button>
                          )}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              );
            })
          )}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between">
              <Typography variant="body1">
                <strong>Saldo consolidado:</strong> {numero(reporte.consolidado.saldo_hoy_total)}
              </Typography>
              <Typography variant="body1">
                <strong>Cambio neto:</strong> {numero(reporte.consolidado.cambio_neto)}
              </Typography>
            </Stack>
            {/* Nomina del dia (11/Sep/2026, "en el reporte diario debe
            reflejar tambien la nomina") - ambos tipos, solo si hubo pagos de
            nomina ese dia (ya se sumaban dentro de cada cuenta, esto solo lo
            hace visible sin tener que expandir cuenta por cuenta). */}
            {(Number(reporte.consolidado.nomina_total_quincenal) !== 0 ||
              Number(reporte.consolidado.nomina_total_semanal) !== 0) && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Nómina Quincenal:</strong> {numero(reporte.consolidado.nomina_total_quincenal)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Nómina Semanal:</strong> {numero(reporte.consolidado.nomina_total_semanal)}
                </Typography>
              </Stack>
            )}
          </Paper>
        </>
      )}

      {/* Enviar por correo */}
      <Dialog open={envioAbierto} onClose={() => setEnvioAbierto(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Enviar reporte por correo
          <IconButton onClick={() => setEnvioAbierto(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {envioError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {envioError}
            </Alert>
          )}
          {envioOk && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Reporte enviado.
            </Alert>
          )}
          <TextField
            size="small"
            label="Destinatarios (separados por coma)"
            value={destinatarios}
            onChange={(e) => setDestinatarios(e.target.value)}
            fullWidth
            placeholder="correo1@cypcumbres.mx, correo2@cypcumbres.mx"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnvioAbierto(false)}>Cerrar</Button>
          <Button variant="contained" onClick={handleEnviar} disabled={enviando}>
            {enviando ? <CircularProgress size={16} /> : "Enviar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Registrar RENDIMIENTOS - solo cuentas de inversion */}
      <Dialog open={!!rendimientosCuenta} onClose={() => setRendimientosCuenta(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Rendimientos — {rendimientosCuenta?.alias}
          <IconButton onClick={() => setRendimientosCuenta(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {rendimientosError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {rendimientosError}
            </Alert>
          )}
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel id="rendimientos-contrato-label">Contrato</InputLabel>
              <Select
                labelId="rendimientos-contrato-label"
                label="Contrato"
                value={rendimientosContrato}
                onChange={(e) => setRendimientosContrato(e.target.value)}
              >
                {contratos.map((c) => (
                  <MenuItem key={c.id_contrato} value={c.id_contrato}>
                    {c.id_contrato} — {c.contraparte_nombre}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Monto"
              value={rendimientosMonto}
              onChange={(e) => setRendimientosMonto(e.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRendimientosCuenta(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarRendimientos} disabled={guardandoRendimientos}>
            {guardandoRendimientos ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
