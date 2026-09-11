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
import { ChevronDown, ChevronRight, FileBarChart, Mail, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  ReporteDiario,
  ReporteDiarioCorte,
  ReporteDiarioCuenta,
  TesoreriaCuenta,
  enviarReporteDiario,
  getReporteDiario,
  listCuentas,
} from "@/lib/tesoreria";

// Reporte diario de saldos (26/Ago/2026, ver documentos/finanzas.md:
// "Generate daily reports on bank transactions") - por empresa (seleccion
// multiple), trae las cuentas activas de esas empresas y compara las
// transacciones (Flujos) del dia contra el cambio de saldo de cada una.
// Calculo real en tesoreria-service/tesoreria/reportes.py - esta pantalla
// solo pide/muestra/envia, no calcula nada del lado del cliente.
export default function TesoreriaReporteDiarioPage() {
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [sociedadesElegidas, setSociedadesElegidas] = useState<GeneralSociedad[]>([]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  // Filtro por cuenta (09/Sep/2026, "en reporte diario, debe hacerse pero
  // por cuenta") - las opciones salen del reporte ya generado, no de un
  // catalogo aparte, para no mostrar cuentas de empresas no elegidas.
  const [filtroCuenta, setFiltroCuenta] = useState("");
  // Ocultar el corte del dia anterior (11/Sep/2026, "que el dia anterior se
  // pueda ocultar") - solo lectura, empieza visible pero se puede colapsar
  // para dejar solo el dia de hoy a la vista.
  const [mostrarAnterior, setMostrarAnterior] = useState(true);
  const [reporte, setReporte] = useState<ReporteDiario | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Envio por correo
  const [envioAbierto, setEnvioAbierto] = useState(false);
  const [destinatarios, setDestinatarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [envioError, setEnvioError] = useState<string | null>(null);
  const [envioOk, setEnvioOk] = useState(false);

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
  // Cuentas del catalogo (09/Sep/2026, "debe aparecer antes de generar") -
  // antes las opciones del filtro salian del reporte ya generado, asi que
  // el filtro no existia hasta darle "Generar" - ahora se cargan aparte,
  // igual que en Balanza (saldos/page.tsx).
  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);

  useEffect(() => {
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listCuentas().then(setCuentas).catch(() => setCuentas([]));
  }, []);

  // Bloquear envio si hay diferencia (Jenny, junta 09/Sep: "no enviar el
  // reporte diario si hay diferencia") - el backend ya lo rechaza, esto
  // solo evita el viaje redondo cuando ya se sabe que va a fallar.
  const cuentasConDiferencia = useMemo(
    () =>
      (reporte?.sociedades ?? []).flatMap((s) => s.cuentas.filter((c) => c.cuadra === false).map((c) => c.alias)),
    [reporte]
  );

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

  function numero(valor: string | null): string {
    if (valor === null) return "—";
    return Number(valor).toLocaleString("es-MX", { minimumFractionDigits: 2 });
  }

  // Cambio (%) (11/Sep/2026, formato del reporte legado de Wall-E Homes) -
  // sin base contra que comparar (cuenta nueva, saldo anterior en 0) el
  // backend manda null.
  function porcentaje(valor: string | null): string {
    if (valor === null) return "—";
    return `${Number(valor).toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  // Cuentas del catalogo, acotadas a las empresas elegidas (si hay alguna
  // elegida) - independiente de si ya se genero el reporte, para que el
  // filtro exista desde antes de darle "Generar".
  const cuentasDelReporte = useMemo(() => {
    if (sociedadesElegidas.length === 0) return cuentas;
    const rfcs = new Set(sociedadesElegidas.map((s) => s.rfc));
    return cuentas.filter((c) => c.sociedad && rfcs.has(c.sociedad));
  }, [cuentas, sociedadesElegidas]);

  function filtrarSociedades(corte: ReporteDiarioCorte | undefined) {
    if (!corte) return [];
    if (!filtroCuenta) return corte.sociedades;
    return corte.sociedades
      .map((empresa) => ({ ...empresa, cuentas: empresa.cuentas.filter((c) => c.id_cuenta_bancaria === filtroCuenta) }))
      .filter((empresa) => empresa.cuentas.length > 0);
  }
  const sociedadesFiltradas = useMemo(() => filtrarSociedades(reporte ?? undefined), [reporte, filtroCuenta]);
  const sociedadesFiltradasAnterior = useMemo(
    () => filtrarSociedades(reporte?.corte_anterior),
    [reporte, filtroCuenta]
  );

  // renderEmpresas (11/Sep/2026, extraido para poder pintar el corte del
  // dia anterior y el de hoy con la misma tabla/tarjetas) - `editable`
  // solo distingue las llaves/ids de cada corte (evita colisiones si una
  // cuenta aparece en ambos), ya no hay acciones que apagar.
  function renderEmpresas(
    lista: { sociedad: string; cuentas: ReporteDiarioCuenta[] }[],
    editable: boolean
  ) {
    if (lista.length === 0) {
      return (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center", mb: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {filtroCuenta ? "Sin resultados para la cuenta elegida." : "Sin cuentas activas para las empresas elegidas."}
          </Typography>
        </Paper>
      );
    }
    return lista.map((empresa) => {
      const nombreEmpresa =
        sociedades.find((s) => s.rfc === empresa.sociedad)?.alias_sociedad || empresa.sociedad || "Sin empresa";
      return (
        <Paper key={`${editable ? "hoy" : "ayer"}-${empresa.sociedad}`} variant="outlined" sx={{ mb: 3 }}>
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
                    <TableCell align="right">Saldo</TableCell>
                    <TableCell align="right">Cambio</TableCell>
                    <TableCell align="right">Cambio %</TableCell>
                    <TableCell align="right">Transacciones</TableCell>
                    <TableCell align="right">Diferencia</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {empresa.cuentas.map((c) => {
                    const idExpandible = `${editable ? "hoy" : "ayer"}-${c.id_cuenta_bancaria}`;
                    const expandida = cuentasExpandidas.has(idExpandible);
                    return (
                      <Fragment key={idExpandible}>
                        <TableRow hover>
                          <TableCell padding="checkbox">
                            {c.transacciones.length > 0 && (
                              <IconButton size="small" onClick={() => toggleCuentaExpandida(idExpandible)}>
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
                          <TableCell align="right">{porcentaje(c.cambio_pct)}</TableCell>
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
                        </TableRow>
                        {c.transacciones.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={7} sx={{ py: 0, borderBottom: expandida ? undefined : "none" }}>
                              <Collapse in={expandida} timeout="auto" unmountOnExit>
                                <Table size="small" sx={{ my: 1 }}>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>ID Flujo</TableCell>
                                      <TableCell>Concepto</TableCell>
                                      <TableCell>Comentario</TableCell>
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
                                        <TableCell>{t.descripcion_pago || "—"}</TableCell>
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
            {empresa.cuentas.map((c) => {
              const idExpandible = `${editable ? "hoy" : "ayer"}-${c.id_cuenta_bancaria}`;
              const expandida = cuentasExpandidas.has(idExpandible);
              return (
                <Paper key={idExpandible} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Typography variant="subtitle2">
                      {c.alias}
                      {c.tipo === "INVERSION" && (
                        <Chip size="small" label="Inversión" variant="outlined" sx={{ ml: 1 }} />
                      )}
                    </Typography>
                  </Stack>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Saldo anterior:</strong> {numero(c.saldo_anterior)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Saldo:</strong> {numero(c.saldo_hoy)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Cambio:</strong> {numero(c.cambio)} ({porcentaje(c.cambio_pct)})
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
                  </Stack>
                  {/* Flujos del dia (11/Sep/2026, "en 320px no se pueden
                  ver los flujos") - la vista de tarjetas mostraba los
                  totales pero no daba forma de expandir el detalle por
                  transaccion como si pasa en la tabla de escritorio. */}
                  {c.transacciones.length > 0 && (
                    <>
                      <Button
                        size="small"
                        onClick={() => toggleCuentaExpandida(idExpandible)}
                        startIcon={expandida ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
                        sx={{ mt: 1, alignSelf: "flex-start" }}
                      >
                        Flujos ({c.transacciones.length})
                      </Button>
                      <Collapse in={expandida} timeout="auto" unmountOnExit>
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          {c.transacciones.map((t) => (
                            <Box key={t.id_flujo} sx={{ pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
                              <Typography variant="caption" sx={{ fontFamily: "var(--font-mono, monospace)", display: "block" }}>
                                {t.id_flujo}
                              </Typography>
                              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="body2">{t.concepto || "—"}</Typography>
                                {t.nomina_tipo && (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label={t.nomina_tipo === "QUINCENAL" ? "Nómina Quincenal" : "Nómina Semanal"}
                                    sx={{ borderRadius: 0.5 }}
                                  />
                                )}
                              </Stack>
                              {t.descripcion_pago && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  {t.descripcion_pago}
                                </Typography>
                              )}
                              <Typography variant="body2" fontWeight={600}>
                                {numero(t.total_mxp)}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      </Collapse>
                    </>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Paper>
      );
    });
  }

  function renderConsolidado(consolidado: ReporteDiarioCorte["consolidado"], mostrarNomina?: boolean) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between">
          <Typography variant="body1">
            <strong>Saldo consolidado:</strong> {numero(consolidado.saldo_hoy_total)}
          </Typography>
          <Typography variant="body1">
            <strong>Cambio neto:</strong> {numero(consolidado.cambio_neto)} ({porcentaje(consolidado.cambio_neto_pct)})
          </Typography>
        </Stack>
        {/* Nomina del dia (11/Sep/2026, "en el reporte diario debe
        reflejar tambien la nomina") - ambos tipos, solo si hubo pagos de
        nomina ese dia (ya se sumaban dentro de cada cuenta, esto solo lo
        hace visible sin tener que expandir cuenta por cuenta). */}
        {mostrarNomina &&
          (Number(consolidado.nomina_total_quincenal) !== 0 || Number(consolidado.nomina_total_semanal) !== 0) && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Nómina Quincenal:</strong> {numero(consolidado.nomina_total_quincenal)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Nómina Semanal:</strong> {numero(consolidado.nomina_total_semanal)}
              </Typography>
            </Stack>
          )}
      </Paper>
    );
  }

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
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", sm: "flex-end" }}
          flexWrap="wrap"
          useFlexGap
        >
          <Autocomplete
            multiple
            size="small"
            options={sociedades}
            value={sociedadesElegidas}
            onChange={(_, valor) => setSociedadesElegidas(valor)}
            getOptionLabel={(s) => s.alias_sociedad || s.razon_social || s.rfc}
            isOptionEqualToValue={(a, b) => a.rfc === b.rfc}
            renderInput={(params) => <TextField {...params} label="Empresas" placeholder="Elige una o más" />}
            sx={{ flex: { xs: "1 1 auto", sm: "1 1 240px" } }}
          />
          <TextField
            size="small"
            type="date"
            label="Fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: { xs: "1 1 auto", sm: "1 1 160px" } }}
          />
          {cuentasDelReporte.length > 0 && (
            <FormControl size="small" sx={{ flex: { xs: "1 1 auto", sm: "1 1 200px" } }}>
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
              disabled={cuentasConDiferencia.length > 0}
              sx={{ flexShrink: 0 }}
            >
              Enviar por correo
            </Button>
          )}
        </Stack>
      </Paper>

      {reporte && (
        <>
          {/* Dos cortes (11/Sep/2026, formato legado de Wall-E Homes: "1.1
          Resumen del dia anterior" + "1.2 Resumen del dia") - el anterior es
          solo lectura (ese dia ya cerro) y se puede ocultar (11/Sep/2026,
          "que el dia anterior se pueda ocultar") para dejar solo el de hoy
          a la vista. */}
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
            <IconButton
              size="small"
              aria-label={mostrarAnterior ? "Ocultar día anterior" : "Mostrar día anterior"}
              onClick={() => setMostrarAnterior((v) => !v)}
            >
              {mostrarAnterior ? <ChevronDown size={18} strokeWidth={1.5} /> : <ChevronRight size={18} strokeWidth={1.5} />}
            </IconButton>
            <Typography variant="subtitle2" color="text.secondary">
              Día anterior — {reporte.corte_anterior.fecha}
            </Typography>
          </Stack>
          <Collapse in={mostrarAnterior} timeout="auto" unmountOnExit>
            {renderEmpresas(sociedadesFiltradasAnterior, false)}
            {renderConsolidado(reporte.corte_anterior.consolidado)}
          </Collapse>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 3, mb: 1 }}>
            Día de hoy — {reporte.fecha}
          </Typography>
          {renderEmpresas(sociedadesFiltradas, true)}
          {renderConsolidado(reporte.consolidado, true)}
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
          {cuentasConDiferencia.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No se puede enviar: hay diferencia sin resolver en {cuentasConDiferencia.join(", ")}.
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
          <Button variant="contained" onClick={handleEnviar} disabled={enviando || cuentasConDiferencia.length > 0}>
            {enviando ? <CircularProgress size={16} /> : "Enviar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
