"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
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
import { FileText, Landmark, Pencil, Plus, Trash2, Wallet, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  TesoreriaBanco,
  TesoreriaCorteEdc,
  TesoreriaCorteEdcFormato,
  TesoreriaCorteEdcTipo,
  TesoreriaCuenta,
  TesoreriaCuentaTipo,
  createBanco,
  createCorteEdc,
  createCuenta,
  deleteBanco,
  deleteCorteEdc,
  deleteCuenta,
  generarIdCorto,
  listBancos,
  listCortesEdc,
  listCuentas,
  updateBanco,
  updateCuenta,
} from "@/lib/tesoreria";

const CUENTA_FORM_VACIO = {
  rfcRazonSocial: "",
  sociedad: "",
  tipo: "CHEQUES" as TesoreriaCuentaTipo,
  banco: "",
  cuenta: "",
  clabe: "",
  alias: "",
  label: "",
  activa: true,
  apertura: new Date().toISOString().slice(0, 10),
  cierre: "",
};

const TIPO_CUENTA_LABELS: Record<TesoreriaCuentaTipo, string> = {
  CHEQUES: "Cheques",
  INVERSION: "Inversión",
  NOMINA: "Nómina",
  PAGARE: "Pagaré",
  OTRA: "Otra",
};

// Cuentas bancarias + catalogo de Bancos (arranque formal de Fase 4,
// 18/Ago/2026, segundo corte tras Contrapartes) - mismo criterio de
// permisos (tesoreria.crear/.editar), sin ScopedManager (ver
// tesoreria/serializers.py).
export default function TesoreriaCuentasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  // Tabs Cuentas/Bancos (21/Sep/2026, pedido explicito: separar en tabs en
  // vez de apilar las dos tablas completas en una sola pagina, mismo
  // patron que PLD - ver pld/page.tsx). El boton de alta cambia segun la
  // tab activa.
  const [tab, setTab] = useState<"Cuentas" | "Bancos">("Cuentas");

  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Division por Empresa/Banco (21/Sep/2026, pedido explicito) + paginacion
  // server-side (mismo fix del 503 aplicado a Flujos/Facturas - ver
  // TesoreriaCuentaViewSet.pagination_class).
  const [searchCuentas, setSearchCuentas] = useState("");
  const [filtroSociedadCuenta, setFiltroSociedadCuenta] = useState("");
  const [filtroBancoCuenta, setFiltroBancoCuenta] = useState("");
  const [paginaCuentas, setPaginaCuentas] = useState(0);
  const [filasPorPaginaCuentas, setFilasPorPaginaCuentas] = useState(20);
  const [totalCuentas, setTotalCuentas] = useState(0);
  const [cuentaDialogOpen, setCuentaDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<TesoreriaCuenta | null>(null);
  const [cuentaForm, setCuentaForm] = useState(CUENTA_FORM_VACIO);
  const [savingCuenta, setSavingCuenta] = useState(false);
  const [cuentaFormError, setCuentaFormError] = useState<string | null>(null);
  // ID mostrado en el dialogo de alta - generado al abrirlo, ver abrirAltaCuenta().
  const [idCuentaNueva, setIdCuentaNueva] = useState("");
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);

  // Catalogo completo de bancos (pageSize alto, sin filtrar) - alimenta los
  // selects (filtro de Cuentas, banco del alta de Cuenta), no la tabla de
  // la tab Bancos (ver bancosTabla abajo).
  const [bancos, setBancos] = useState<TesoreriaBanco[]>([]);
  const [bancoDialogOpen, setBancoDialogOpen] = useState(false);
  const [editingBanco, setEditingBanco] = useState<TesoreriaBanco | null>(null);
  const [bancoForm, setBancoForm] = useState({ idBanxico: "", banco: "", alias: "" });
  const [savingBanco, setSavingBanco] = useState(false);
  const [bancoFormError, setBancoFormError] = useState<string | null>(null);

  // Tabla paginada de la tab Bancos (21/Sep/2026, 90 bancos reales
  // migrados - mismo fix del 503 aplicado al resto de catalogos).
  const [bancosTabla, setBancosTabla] = useState<TesoreriaBanco[]>([]);
  const [loadingBancos, setLoadingBancos] = useState(true);
  const [searchBancos, setSearchBancos] = useState("");
  // Filtro "Banco" (21/Sep/2026, mismo selector que ya existia en la tab
  // Cuentas, agregado tambien aqui) - filtra la propia tabla de bancos a
  // uno especifico via ?id_banxico=.
  const [filtroBancoTabla, setFiltroBancoTabla] = useState("");
  const [paginaBancos, setPaginaBancos] = useState(0);
  const [filasPorPaginaBancos, setFilasPorPaginaBancos] = useState(20);
  const [totalBancos, setTotalBancos] = useState(0);

  // Cortes/EDC (bloque 5, reportes) - dialogo por cuenta, ver
  // TesoreriaCorteEdcViewSet (filtro ?cuenta=<id>).
  const [cortesCuenta, setCortesCuenta] = useState<TesoreriaCuenta | null>(null);
  const [cortes, setCortes] = useState<TesoreriaCorteEdc[]>([]);
  const [loadingCortes, setLoadingCortes] = useState(false);
  const [corteFormOpen, setCorteFormOpen] = useState(false);
  const [corteForm, setCorteForm] = useState({
    fechaFinal: new Date().toISOString().slice(0, 10),
    tipo: "estado_cuenta" as TesoreriaCorteEdcTipo,
    formato: "pdf" as TesoreriaCorteEdcFormato,
    link: "",
  });
  const [savingCorte, setSavingCorte] = useState(false);
  const [corteFormError, setCorteFormError] = useState<string | null>(null);
  // ID mostrado en el formulario inline de alta - generado al abrirlo.
  const [idCorteNuevo, setIdCorteNuevo] = useState("");

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  // Buscador local (23/Sep/2026) - "bancos" ya trae el catalogo completo
  // (pageSize 200, ~90 reales, ver comentario del estado arriba), asi que
  // filtrar por texto aqui mismo es mas simple que reconectar cada uso a
  // busqueda en vivo contra el backend (bajo riesgo, catalogo Banxico estable).
  function etiquetaBanco(b: TesoreriaBanco): string {
    return b.alias ? `${b.banco || b.id_banxico} (${b.alias})` : b.banco || b.id_banxico;
  }

  function refreshCuentas() {
    setLoadingCuentas(true);
    listCuentas(
      searchCuentas || undefined,
      paginaCuentas + 1,
      filasPorPaginaCuentas,
      filtroSociedadCuenta || undefined,
      filtroBancoCuenta || undefined
    )
      .then((res) => {
        setCuentas(res.results);
        setTotalCuentas(res.count);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingCuentas(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refreshCuentas, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCuentas, filtroSociedadCuenta, filtroBancoCuenta, paginaCuentas, filasPorPaginaCuentas]);

  // Volver a la primera pagina cuando cambia cualquier filtro (21/Sep/2026,
  // mismo motivo que en Flujos/Facturas).
  useEffect(() => {
    setPaginaCuentas(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCuentas, filtroSociedadCuenta, filtroBancoCuenta]);

  function refreshBancoCatalogo() {
    listBancos(undefined, undefined, 200)
      .then((res) => setBancos(res.results))
      .catch(() => setBancos([]));
  }

  function refreshBancos() {
    setLoadingBancos(true);
    listBancos(searchBancos || undefined, paginaBancos + 1, filasPorPaginaBancos, filtroBancoTabla || undefined)
      .then((res) => {
        setBancosTabla(res.results);
        setTotalBancos(res.count);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingBancos(false));
  }

  useEffect(() => {
    refreshBancoCatalogo();
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(refreshBancos, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchBancos, filtroBancoTabla, paginaBancos, filasPorPaginaBancos]);

  // Volver a la primera pagina cuando cambia la busqueda/filtro (21/Sep/2026,
  // mismo motivo que en Flujos/Facturas).
  useEffect(() => {
    setPaginaBancos(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchBancos, filtroBancoTabla]);

  function abrirAltaCuenta() {
    setEditingCuenta(null);
    setCuentaForm(CUENTA_FORM_VACIO);
    setIdCuentaNueva(generarIdCorto());
    setCuentaFormError(null);
    setCuentaDialogOpen(true);
  }

  function abrirEdicionCuenta(c: TesoreriaCuenta) {
    setEditingCuenta(c);
    setCuentaForm({
      rfcRazonSocial: c.rfc_razon_social || "",
      sociedad: c.sociedad || "",
      tipo: c.tipo || "CHEQUES",
      banco: c.banco || "",
      cuenta: c.cuenta || "",
      clabe: c.clabe || "",
      alias: c.alias || "",
      label: c.label || "",
      activa: c.activa ?? true,
      apertura: c.apertura,
      cierre: c.cierre || "",
    });
    setCuentaFormError(null);
    setCuentaDialogOpen(true);
  }

  async function handleGuardarCuenta() {
    if (!editingCuenta && !cuentaForm.banco) {
      setCuentaFormError("Selecciona un banco.");
      return;
    }
    setSavingCuenta(true);
    setCuentaFormError(null);
    try {
      if (editingCuenta) {
        await updateCuenta(editingCuenta.id_cuenta_bancaria, {
          alias: cuentaForm.alias,
          label: cuentaForm.label,
          activa: cuentaForm.activa,
          cierre: cuentaForm.cierre || null,
          sociedad: cuentaForm.sociedad || null,
          tipo: cuentaForm.tipo,
        });
      } else {
        await createCuenta({
          idCuentaBancaria: idCuentaNueva,
          rfcRazonSocial: cuentaForm.rfcRazonSocial,
          sociedad: cuentaForm.sociedad,
          tipo: cuentaForm.tipo,
          banco: cuentaForm.banco,
          cuenta: cuentaForm.cuenta,
          clabe: cuentaForm.clabe,
          alias: cuentaForm.alias,
          label: cuentaForm.label,
          activa: cuentaForm.activa,
          apertura: cuentaForm.apertura,
        });
      }
      setCuentaDialogOpen(false);
      refreshCuentas();
    } catch (err) {
      setCuentaFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingCuenta(false);
    }
  }

  async function handleBorrarCuenta(c: TesoreriaCuenta) {
    if (!window.confirm(`¿Borrar la cuenta ${c.alias || c.id_cuenta_bancaria}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteCuenta(c.id_cuenta_bancaria);
      refreshCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function abrirAltaBanco() {
    setEditingBanco(null);
    setBancoForm({ idBanxico: "", banco: "", alias: "" });
    setBancoFormError(null);
    setBancoDialogOpen(true);
  }

  function abrirEdicionBanco(b: TesoreriaBanco) {
    setEditingBanco(b);
    setBancoForm({ idBanxico: b.id_banxico, banco: b.banco || "", alias: b.alias || "" });
    setBancoFormError(null);
    setBancoDialogOpen(true);
  }

  async function handleGuardarBanco() {
    if (!editingBanco && !bancoForm.idBanxico.trim()) {
      setBancoFormError("El ID Banxico es requerido.");
      return;
    }
    setSavingBanco(true);
    setBancoFormError(null);
    try {
      if (editingBanco) {
        await updateBanco(editingBanco.id_banxico, { banco: bancoForm.banco || null, alias: bancoForm.alias || null });
      } else {
        await createBanco(bancoForm);
      }
      setBancoDialogOpen(false);
      refreshBancos();
      refreshBancoCatalogo();
    } catch (err) {
      setBancoFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingBanco(false);
    }
  }

  async function handleBorrarBanco(b: TesoreriaBanco) {
    if (!window.confirm(`¿Borrar el banco ${b.banco || b.id_banxico}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteBanco(b.id_banxico);
      refreshBancos();
      refreshBancoCatalogo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function abrirCortes(c: TesoreriaCuenta) {
    setCortesCuenta(c);
    setCorteForm({
      fechaFinal: new Date().toISOString().slice(0, 10),
      tipo: "estado_cuenta",
      formato: "pdf",
      link: "",
    });
    setCorteFormError(null);
    setCorteFormOpen(false);
    refreshCortes(c.id_cuenta_bancaria);
  }

  function refreshCortes(idCuenta: string) {
    setLoadingCortes(true);
    listCortesEdc(idCuenta)
      .then(setCortes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingCortes(false));
  }

  async function handleGuardarCorte() {
    if (!cortesCuenta) return;
    if (!corteForm.link.trim()) {
      setCorteFormError("El link es requerido.");
      return;
    }
    setSavingCorte(true);
    setCorteFormError(null);
    try {
      await createCorteEdc({
        id: idCorteNuevo,
        cuenta: cortesCuenta.id_cuenta_bancaria,
        fechaFinal: corteForm.fechaFinal,
        tipo: corteForm.tipo,
        formato: corteForm.formato,
        link: corteForm.link,
        createdBy: session?.user_id || "sistema",
      });
      setCorteFormOpen(false);
      refreshCortes(cortesCuenta.id_cuenta_bancaria);
    } catch (err) {
      setCorteFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingCorte(false);
    }
  }

  async function handleBorrarCorte(corte: TesoreriaCorteEdc) {
    if (!cortesCuenta) return;
    if (!window.confirm("¿Borrar este corte/EDC? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      await deleteCorteEdc(corte.id);
      refreshCortes(cortesCuenta.id_cuenta_bancaria);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Wallet size={22} strokeWidth={1.5} />
        <Typography variant="h5">Cuentas Bancarias</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Cuentas y catálogo de bancos (Banxico) — base para registrar saldos y flujos de Tesorería.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2, pb: 1 }}>
          {tab === "Cuentas" ? <Wallet size={18} strokeWidth={1.5} /> : <Landmark size={18} strokeWidth={1.5} />}
          <Typography variant="subtitle1" fontWeight={600}>
            {tab}
          </Typography>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={tab === "Cuentas" ? abrirAltaCuenta : abrirAltaBanco}
              sx={{ ml: "auto" }}
            >
              {tab === "Cuentas" ? "Nueva Cuenta" : "Nuevo Banco"}
            </Button>
          )}
        </Stack>

        {/* Tabs Cuentas/Bancos (21/Sep/2026, pedido explicito - antes eran
        dos Paper apiladas, con volumen real (90 bancos) se volvia una
        pagina muy larga de scrollear). Mismo patron que PLD: Tabs con
        borderBottom en el mismo Paper del contenido. */}
        <Tabs
          value={tab}
          onChange={(_, nuevoTab) => setTab(nuevoTab)}
          sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab value="Cuentas" label="Cuentas" />
          <Tab value="Bancos" label="Bancos" />
        </Tabs>

        {tab === "Cuentas" && (
          <>
            {/* Division por Empresa y Banco (21/Sep/2026, pedido explicito -
            ver TesoreriaCuentaViewSet.get_queryset), filtros combinables
            (AND) mismo patron que Facturas/Flujos. */}
            <Box sx={{ px: 2, pt: 1, pb: 1 }}>
              <FiltrosBar
                search={searchCuentas}
                onSearchChange={setSearchCuentas}
                searchPlaceholder="Buscar por alias, titular o CLABE..."
              >
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="filtro-sociedad-cuenta-label">Empresa</InputLabel>
                  <Select
                    labelId="filtro-sociedad-cuenta-label"
                    label="Empresa"
                    value={filtroSociedadCuenta}
                    onChange={(e) => setFiltroSociedadCuenta(e.target.value)}
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
                <Autocomplete
                  size="small"
                  openOnFocus
                  sx={{ minWidth: 200 }}
                  options={bancos}
                  value={bancos.find((b) => b.id_banxico === filtroBancoCuenta) || null}
                  onChange={(_, seleccion) => setFiltroBancoCuenta(seleccion?.id_banxico || "")}
                  getOptionLabel={etiquetaBanco}
                  isOptionEqualToValue={(a, b) => a.id_banxico === b.id_banxico}
                  renderInput={(params) => <TextField {...params} label="Banco" />}
                />
              </FiltrosBar>
            </Box>
            {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza por
            tarjetas apiladas (ver abajo) - una tabla de 6+ columnas no cabe en
            un telefono sin scroll horizontal incomodo. */}
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Alias</TableCell>
                    <TableCell>Banco</TableCell>
                    <TableCell>Cuenta</TableCell>
                    <TableCell>CLABE</TableCell>
                    <TableCell>Titular</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingCuentas ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                        <CircularProgress size={20} />
                      </TableCell>
                    </TableRow>
                  ) : cuentas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Sin cuentas registradas.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    cuentas.map((c) => (
                      <TableRow key={c.id_cuenta_bancaria} hover>
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.id_cuenta_bancaria}</TableCell>
                        <TableCell>{c.alias || c.label || "—"}</TableCell>
                        <TableCell>{c.banco_nombre || "—"}</TableCell>
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.cuenta || "—"}</TableCell>
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.clabe || "—"}</TableCell>
                        <TableCell>{c.rfc_razon_social || "—"}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={c.activa ? "Activa" : "Cerrada"}
                            color={c.activa ? "success" : "default"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" aria-label="Cortes / EDC" onClick={() => abrirCortes(c)}>
                            <FileText size={14} strokeWidth={1.5} />
                          </IconButton>
                          <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicionCuenta(c)} disabled={!puedeEditar}>
                            <Pencil size={14} strokeWidth={1.5} />
                          </IconButton>
                          <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrarCuenta(c)} disabled={!puedeEditar}>
                            <Trash2 size={14} strokeWidth={1.5} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            </Box>

            {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
            <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
              {loadingCuentas ? (
                <Stack alignItems="center" sx={{ py: 3 }}>
                  <CircularProgress size={20} />
                </Stack>
              ) : cuentas.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                  Sin cuentas registradas.
                </Typography>
              ) : (
                cuentas.map((c) => (
                  <Paper key={c.id_cuenta_bancaria} variant="outlined" sx={{ p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">{c.alias || c.label || "—"}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                          {c.id_cuenta_bancaria}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                        <IconButton size="small" aria-label="Cortes / EDC" onClick={() => abrirCortes(c)}>
                          <FileText size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicionCuenta(c)} disabled={!puedeEditar}>
                          <Pencil size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrarCuenta(c)} disabled={!puedeEditar}>
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Stack>
                    </Stack>
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      <Typography variant="body2">
                        <strong>Banco:</strong> {c.banco_nombre || "—"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Cuenta:</strong> {c.cuenta || "—"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>CLABE:</strong> {c.clabe || "—"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Titular:</strong> {c.rfc_razon_social || "—"}
                      </Typography>
                      <Stack direction="row" spacing={0.5}>
                        <Chip
                          size="small"
                          label={c.activa ? "Activa" : "Cerrada"}
                          color={c.activa ? "success" : "default"}
                          variant="outlined"
                        />
                      </Stack>
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>

            <TablePagination
              component="div"
              count={totalCuentas}
              page={paginaCuentas}
              onPageChange={(_, nuevaPagina) => setPaginaCuentas(nuevaPagina)}
              rowsPerPage={filasPorPaginaCuentas}
              onRowsPerPageChange={(e) => {
                setFilasPorPaginaCuentas(parseInt(e.target.value, 10));
                setPaginaCuentas(0);
              }}
              rowsPerPageOptions={[20, 50, 100]}
              labelRowsPerPage="Filas por página"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </>
        )}

        {tab === "Bancos" && (
          <>
            <Box sx={{ px: 2, pt: 1, pb: 1 }}>
              <FiltrosBar
                search={searchBancos}
                onSearchChange={setSearchBancos}
                searchPlaceholder="Buscar por nombre o alias..."
              >
                <Autocomplete
                  size="small"
                  openOnFocus
                  sx={{ minWidth: 200 }}
                  options={bancos}
                  value={bancos.find((b) => b.id_banxico === filtroBancoTabla) || null}
                  onChange={(_, seleccion) => setFiltroBancoTabla(seleccion?.id_banxico || "")}
                  getOptionLabel={etiquetaBanco}
                  isOptionEqualToValue={(a, b) => a.id_banxico === b.id_banxico}
                  renderInput={(params) => <TextField {...params} label="Banco" />}
                />
              </FiltrosBar>
            </Box>
            {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza por
            tarjetas apiladas (ver abajo). */}
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID Banxico</TableCell>
                    <TableCell>Banco</TableCell>
                    <TableCell>Alias</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingBancos ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                        <CircularProgress size={20} />
                      </TableCell>
                    </TableRow>
                  ) : bancosTabla.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Sin bancos registrados.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    bancosTabla.map((b) => (
                      <TableRow key={b.id_banxico} hover>
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{b.id_banxico}</TableCell>
                        <TableCell>{b.banco || "—"}</TableCell>
                        <TableCell>{b.alias || "—"}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicionBanco(b)} disabled={!puedeEditar}>
                            <Pencil size={14} strokeWidth={1.5} />
                          </IconButton>
                          <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrarBanco(b)} disabled={!puedeEditar}>
                            <Trash2 size={14} strokeWidth={1.5} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            </Box>

            {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
            <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
              {loadingBancos ? (
                <Stack alignItems="center" sx={{ py: 3 }}>
                  <CircularProgress size={20} />
                </Stack>
              ) : bancosTabla.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                  Sin bancos registrados.
                </Typography>
              ) : (
                bancosTabla.map((b) => (
                  <Paper key={b.id_banxico} variant="outlined" sx={{ p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">{b.banco || "—"}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                          {b.id_banxico}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                        <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicionBanco(b)} disabled={!puedeEditar}>
                          <Pencil size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrarBanco(b)} disabled={!puedeEditar}>
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Stack>
                    </Stack>
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      <Typography variant="body2">
                        <strong>Alias:</strong> {b.alias || "—"}
                      </Typography>
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>

            <TablePagination
              component="div"
              count={totalBancos}
              page={paginaBancos}
              onPageChange={(_, nuevaPagina) => setPaginaBancos(nuevaPagina)}
              rowsPerPage={filasPorPaginaBancos}
              onRowsPerPageChange={(e) => {
                setFilasPorPaginaBancos(parseInt(e.target.value, 10));
                setPaginaBancos(0);
              }}
              rowsPerPageOptions={[20, 50, 100]}
              labelRowsPerPage="Filas por página"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Alta/edicion de cuenta */}
      <Dialog open={cuentaDialogOpen} onClose={() => setCuentaDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editingCuenta ? `Editar ${editingCuenta.alias || editingCuenta.id_cuenta_bancaria}` : "Nueva Cuenta"}
          <IconButton onClick={() => setCuentaDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {cuentaFormError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {cuentaFormError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="ID cuenta bancaria"
              value={editingCuenta ? editingCuenta.id_cuenta_bancaria : idCuentaNueva}
              disabled
              fullWidth
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="sociedad-cuenta-label">Empresa / sociedad</InputLabel>
                <Select
                  labelId="sociedad-cuenta-label"
                  label="Empresa / sociedad"
                  value={cuentaForm.sociedad}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, sociedad: e.target.value })}
                >
                  <MenuItem value="">
                    <em>Sin asignar</em>
                  </MenuItem>
                  {sociedades.map((s) => (
                    <MenuItem key={s.rfc} value={s.rfc}>
                      {s.alias_sociedad || s.razon_social || s.rfc}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-cuenta-label">Tipo de cuenta</InputLabel>
                <Select
                  labelId="tipo-cuenta-label"
                  label="Tipo de cuenta"
                  value={cuentaForm.tipo}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, tipo: e.target.value as TesoreriaCuentaTipo })}
                >
                  {Object.entries(TIPO_CUENTA_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            {!editingCuenta && (
              <>
                <Autocomplete
                  size="small"
                  openOnFocus
                  fullWidth
                  options={bancos}
                  value={bancos.find((b) => b.id_banxico === cuentaForm.banco) || null}
                  onChange={(_, seleccion) => setCuentaForm({ ...cuentaForm, banco: seleccion?.id_banxico || "" })}
                  getOptionLabel={etiquetaBanco}
                  isOptionEqualToValue={(a, b) => a.id_banxico === b.id_banxico}
                  renderInput={(params) => <TextField {...params} label="Banco" />}
                />
                <TextField
                  size="small"
                  label="RFC / Razón social (titular)"
                  value={cuentaForm.rfcRazonSocial}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, rfcRazonSocial: e.target.value })}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Número de cuenta"
                  value={cuentaForm.cuenta}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, cuenta: e.target.value })}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="CLABE"
                  value={cuentaForm.clabe}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, clabe: e.target.value })}
                  fullWidth
                />
                <TextField
                  size="small"
                  type="date"
                  label="Fecha de apertura"
                  value={cuentaForm.apertura}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, apertura: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </>
            )}
            <TextField
              size="small"
              label="Alias"
              value={cuentaForm.alias}
              onChange={(e) => setCuentaForm({ ...cuentaForm, alias: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Etiqueta (label)"
              value={cuentaForm.label}
              onChange={(e) => setCuentaForm({ ...cuentaForm, label: e.target.value })}
              fullWidth
            />
            {/* Solo al editar (18/Ago/2026, hallazgo de revision: el estado
            "activa" se guardaba pero no habia ningun control para
            cambiarlo - el analista nunca podia marcar una cuenta cerrada).
            Al crear siempre nace activa, no hace falta el control. */}
            {editingCuenta && (
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={cuentaForm.activa}
                      onChange={(e) => setCuentaForm({ ...cuentaForm, activa: e.target.checked })}
                    />
                  }
                  label="Cuenta activa"
                />
                <TextField
                  size="small"
                  type="date"
                  label="Fecha de cierre"
                  value={cuentaForm.cierre}
                  onChange={(e) => setCuentaForm({ ...cuentaForm, cierre: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Registrado por" value={editingCuenta.created_by || "—"} disabled fullWidth />
                  <TextField size="small" label="Modificado por" value={editingCuenta.updated_by || "—"} disabled fullWidth />
                </Stack>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCuentaDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarCuenta} disabled={savingCuenta}>
            {savingCuenta ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Alta/edicion de banco */}
      <Dialog open={bancoDialogOpen} onClose={() => setBancoDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editingBanco ? `Editar ${editingBanco.banco || editingBanco.id_banxico}` : "Nuevo Banco"}
          <IconButton onClick={() => setBancoDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {bancoFormError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {bancoFormError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="ID Banxico"
              value={bancoForm.idBanxico}
              onChange={(e) => setBancoForm({ ...bancoForm, idBanxico: e.target.value })}
              disabled={!!editingBanco}
              fullWidth
            />
            <TextField
              size="small"
              label="Nombre del banco"
              value={bancoForm.banco}
              onChange={(e) => setBancoForm({ ...bancoForm, banco: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Alias"
              value={bancoForm.alias}
              onChange={(e) => setBancoForm({ ...bancoForm, alias: e.target.value })}
              fullWidth
            />
            {editingBanco && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField size="small" label="Registrado por" value={editingBanco.created_by || "—"} disabled fullWidth />
                <TextField size="small" label="Modificado por" value={editingBanco.updated_by || "—"} disabled fullWidth />
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBancoDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarBanco} disabled={savingBanco}>
            {savingBanco ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cortes / EDC de una cuenta (bloque 5, reportes) */}
      <Dialog open={!!cortesCuenta} onClose={() => setCortesCuenta(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Cortes / EDC — {cortesCuenta?.alias || cortesCuenta?.id_cuenta_bancaria}
          <IconButton onClick={() => setCortesCuenta(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {puedeCrear && !corteFormOpen && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={() => {
                setIdCorteNuevo(generarIdCorto());
                setCorteFormOpen(true);
              }}
              sx={{ mb: 2 }}
            >
              Nuevo Corte/EDC
            </Button>
          )}
          {corteFormOpen && (
            <Stack spacing={2} sx={{ mb: 2, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              {corteFormError && <Alert severity="error">{corteFormError}</Alert>}
              <TextField size="small" label="ID" value={idCorteNuevo} disabled fullWidth />
              <TextField
                size="small"
                type="date"
                label="Fecha final"
                value={corteForm.fechaFinal}
                onChange={(e) => setCorteForm({ ...corteForm, fechaFinal: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <FormControl size="small" fullWidth>
                <InputLabel id="corte-tipo-label">Tipo</InputLabel>
                <Select
                  labelId="corte-tipo-label"
                  label="Tipo"
                  value={corteForm.tipo}
                  onChange={(e) => setCorteForm({ ...corteForm, tipo: e.target.value as TesoreriaCorteEdcTipo })}
                >
                  <MenuItem value="estado_cuenta">Estado de cuenta</MenuItem>
                  <MenuItem value="corte">Corte</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="corte-formato-label">Formato</InputLabel>
                <Select
                  labelId="corte-formato-label"
                  label="Formato"
                  value={corteForm.formato}
                  onChange={(e) => setCorteForm({ ...corteForm, formato: e.target.value as TesoreriaCorteEdcFormato })}
                >
                  <MenuItem value="pdf">PDF</MenuItem>
                  <MenuItem value="excel">Excel</MenuItem>
                  <MenuItem value="csv">CSV</MenuItem>
                  <MenuItem value="otro">Otro</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Link"
                value={corteForm.link}
                onChange={(e) => setCorteForm({ ...corteForm, link: e.target.value })}
                fullWidth
              />
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" onClick={() => setCorteFormOpen(false)}>
                  Cancelar
                </Button>
                <Button size="small" variant="contained" onClick={handleGuardarCorte} disabled={savingCorte}>
                  {savingCorte ? <CircularProgress size={16} /> : "Guardar"}
                </Button>
              </Stack>
            </Stack>
          )}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha final</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Formato</TableCell>
                  <TableCell>Link</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingCortes ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : cortes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        Sin cortes registrados.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  cortes.map((corte) => (
                    <TableRow key={corte.id} hover>
                      <TableCell>{corte.fecha_final}</TableCell>
                      <TableCell>{corte.tipo === "estado_cuenta" ? "Estado de cuenta" : "Corte"}</TableCell>
                      <TableCell sx={{ textTransform: "uppercase" }}>{corte.formato}</TableCell>
                      <TableCell>
                        <a href={corte.link} target="_blank" rel="noreferrer">
                          Ver archivo
                        </a>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrarCorte(corte)} disabled={!puedeEditar}>
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCortesCuenta(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
