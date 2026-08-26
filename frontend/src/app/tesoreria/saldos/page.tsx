"use client";

import { useEffect, useMemo, useState } from "react";
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
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Copy, Pencil, PiggyBank, Plus, Trash2, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  TesoreriaCuenta,
  TesoreriaSaldo,
  createSaldo,
  deleteSaldo,
  listCuentas,
  listSaldos,
  updateSaldo,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  id: "",
  fecha: new Date().toISOString().slice(0, 10),
  cuenta: "",
  saldo: "",
  cambioDinero: "",
  cambioPorcentual: "",
};

// Genera un id corto tipo "cd7d429b" (25/Ago/2026) - igual formato que ya
// se ve en los saldos capturados desde el AppSheet original (uuid
// aleatorio, no un id_flujo/id_contrato legible con valor de negocio). El
// modelo TesoreriaSaldo no lo autogenera (CharField sin default, ver
// TesoreriaSaldoSerializer) - toca mandarlo explicito al crear.
function generarIdSaldo(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

// Saldos como "balanza" (25/Ago/2026, feedback directo: paneles de
// cuadros agrupados por fecha, no una tabla plana - ver captura real del
// AppSheet original). Cada cuadro es el saldo de una cuenta en una fecha;
// "Duplicar" prellena el alta con la misma cuenta/saldo para capturar el
// siguiente corte rapido. La captura sigue siendo manual mientras no
// exista el importador de archivo que documenta TesoreriaSaldoSerializer.
export default function TesoreriaSaldosPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [saldos, setSaldos] = useState<TesoreriaSaldo[]>([]);
  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detalle, setDetalle] = useState<TesoreriaSaldo | null>(null);
  const [editing, setEditing] = useState<TesoreriaSaldo | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filtroCuenta, setFiltroCuenta] = useState("");
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("");
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("");

  useEffect(() => {
    getSession().then(setSession);
    listCuentas().then(setCuentas).catch(() => setCuentas([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  function refresh() {
    setLoading(true);
    listSaldos(filtroCuenta || undefined)
      .then(setSaldos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroCuenta]);

  function aliasCuenta(idCuentaBancaria: string): string {
    const c = cuentas.find((x) => x.id_cuenta_bancaria === idCuentaBancaria);
    return c ? c.alias || c.clabe || idCuentaBancaria : idCuentaBancaria;
  }

  // Agrupados por fecha (mas reciente primero, ya viene ordenado -fecha
  // desde el backend) - mismo agrupamiento que el panel real de AppSheet.
  // El rango de fecha se filtra aqui, del lado del cliente (listSaldos no
  // tiene parametro de fecha en el backend, solo ?cuenta=).
  const gruposPorFecha = useMemo(() => {
    const mapa = new Map<string, TesoreriaSaldo[]>();
    for (const s of saldos) {
      if (filtroFechaDesde && s.fecha < filtroFechaDesde) continue;
      if (filtroFechaHasta && s.fecha > filtroFechaHasta) continue;
      const grupo = mapa.get(s.fecha) || [];
      grupo.push(s);
      mapa.set(s.fecha, grupo);
    }
    return Array.from(mapa.entries());
  }, [saldos, filtroFechaDesde, filtroFechaHasta]);

  function abrirAlta() {
    setDetalle(null);
    setEditing(null);
    setForm({ ...FORM_VACIO, id: generarIdSaldo() });
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(s: TesoreriaSaldo) {
    setDetalle(null);
    setEditing(s);
    setForm({
      id: s.id,
      fecha: s.fecha,
      cuenta: s.cuenta,
      saldo: s.saldo,
      cambioDinero: s.cambio_dinero || "",
      cambioPorcentual: s.cambio_porcentual || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirDuplicado(s: TesoreriaSaldo) {
    setDetalle(null);
    setEditing(null);
    setForm({
      id: generarIdSaldo(),
      fecha: new Date().toISOString().slice(0, 10),
      cuenta: s.cuenta,
      saldo: s.saldo,
      cambioDinero: "",
      cambioPorcentual: "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && (!form.cuenta || !form.fecha)) {
      setFormError("Selecciona cuenta y fecha.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateSaldo(editing.id, {
          saldo: form.saldo || undefined,
          cambioDinero: form.cambioDinero || undefined,
          cambioPorcentual: form.cambioPorcentual || undefined,
        });
      } else {
        await createSaldo({
          id: form.id,
          fecha: form.fecha,
          cuenta: form.cuenta,
          saldo: form.saldo || "0",
          cambioDinero: form.cambioDinero || undefined,
          cambioPorcentual: form.cambioPorcentual || undefined,
        });
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrar(s: TesoreriaSaldo) {
    if (!window.confirm(`¿Borrar el saldo de ${aliasCuenta(s.cuenta)} al ${s.fecha}? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await deleteSaldo(s.id);
      setDetalle(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <PiggyBank size={22} strokeWidth={1.5} />
        <Typography variant="h5">Saldos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Balanza — el saldo de cada cuenta bancaria, agrupado por fecha de corte.
      </Typography>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", md: "flex-start" }}
        justifyContent="space-between"
        sx={{ mb: 3 }}
      >
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="filtro-cuenta-label">Filtrar por cuenta</InputLabel>
            <Select
              labelId="filtro-cuenta-label"
              label="Filtrar por cuenta"
              value={filtroCuenta}
              onChange={(e) => setFiltroCuenta(e.target.value)}
            >
              <MenuItem value="">
                <em>Todas las cuentas</em>
              </MenuItem>
              {cuentas.map((c) => (
                <MenuItem key={c.id_cuenta_bancaria} value={c.id_cuenta_bancaria}>
                  {c.alias || c.clabe || c.id_cuenta_bancaria}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="date"
            label="Fecha desde"
            value={filtroFechaDesde}
            onChange={(e) => setFiltroFechaDesde(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />
          <TextField
            size="small"
            type="date"
            label="Fecha hasta"
            value={filtroFechaHasta}
            onChange={(e) => setFiltroFechaHasta(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />
        </Stack>
        {puedeCrear && (
          <Button
            size="small"
            variant="contained"
            startIcon={<Plus size={14} strokeWidth={2} />}
            onClick={abrirAlta}
            sx={{ flexShrink: 0 }}
          >
            Nuevo saldo
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={24} />
        </Stack>
      ) : gruposPorFecha.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Sin saldos registrados todavía.
          </Typography>
        </Paper>
      ) : (
        gruposPorFecha.map(([fecha, grupo]) => (
          <Stack key={fecha} spacing={1.5} sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" fontWeight={600}>
                {fecha}
              </Typography>
              <Chip size="small" label={grupo.length} />
            </Stack>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
                gap: 2,
              }}
            >
              {grupo.map((s) => (
                <Paper
                  key={s.id}
                  variant="outlined"
                  onClick={() => setDetalle(s)}
                  sx={{ p: 2.5, cursor: "pointer", "&:hover": { borderColor: "primary.main" } }}
                >
                  <Typography variant="subtitle2" fontWeight={600} noWrap>
                    {aliasCuenta(s.cuenta)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                    {s.id}
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 1, fontWeight: 600 }}>
                    {Number(s.saldo).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.fecha}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Editar">
                      <span>
                        <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(s)} disabled={!puedeEditar}>
                          <Pencil size={13} strokeWidth={1.5} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Borrar">
                      <span>
                        <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrar(s)} disabled={!puedeEditar}>
                          <Trash2 size={13} strokeWidth={1.5} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Stack>
        ))
      )}

      {/* Detalle de un saldo (25/Ago/2026, igual criterio que el panel del
      AppSheet original: click en la tarjeta abre esto, no la edicion
      directo) - Duplicar Saldo es la accion principal, Editar/Borrar
      quedan en el encabezado. */}
      <Dialog open={!!detalle} onClose={() => setDetalle(null)} fullWidth maxWidth="sm">
        {detalle && (
          <>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {aliasCuenta(detalle.cuenta)}
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Borrar">
                  <span>
                    <IconButton
                      size="small"
                      aria-label="Borrar"
                      onClick={() => handleBorrar(detalle)}
                      disabled={!puedeEditar}
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Pencil size={14} strokeWidth={2} />}
                  onClick={() => abrirEdicion(detalle)}
                  disabled={!puedeEditar}
                >
                  Editar
                </Button>
                <IconButton onClick={() => setDetalle(null)} size="small" aria-label="Cerrar">
                  <CloseIcon size={18} strokeWidth={1.5} />
                </IconButton>
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Paper
                  variant="outlined"
                  onClick={() => (puedeCrear ? abrirDuplicado(detalle) : undefined)}
                  sx={{
                    p: 2,
                    flex: "0 0 160px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    cursor: puedeCrear ? "pointer" : "default",
                    opacity: puedeCrear ? 1 : 0.5,
                    "&:hover": puedeCrear ? { borderColor: "primary.main" } : undefined,
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Copy size={18} strokeWidth={1.5} />
                  </Box>
                  <Typography variant="body2">Duplicar Saldo</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Cuenta
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {aliasCuenta(detalle.cuenta)}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        ID Saldo
                      </Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                        {detalle.id}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Fecha
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {detalle.fecha}
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Saldo
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {Number(detalle.saldo).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </Typography>
                    </Stack>
                    {detalle.cambio_dinero && (
                      <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                          Cambio
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {Number(detalle.cambio_dinero).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          {detalle.cambio_porcentual ? ` (${detalle.cambio_porcentual}%)` : ""}
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar saldo de ${aliasCuenta(editing.cuenta)}` : "Nuevo saldo"}
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField size="small" label="ID Saldo" value={form.id} disabled fullWidth />
            <TextField
              size="small"
              type="date"
              label="Fecha"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              InputLabelProps={{ shrink: true }}
              disabled={!!editing}
              fullWidth
            />
            <FormControl size="small" fullWidth disabled={!!editing}>
              <InputLabel id="cuenta-label">Cuenta</InputLabel>
              <Select
                labelId="cuenta-label"
                label="Cuenta"
                value={form.cuenta}
                onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
              >
                {cuentas.map((c) => (
                  <MenuItem key={c.id_cuenta_bancaria} value={c.id_cuenta_bancaria}>
                    {c.alias || c.clabe || c.id_cuenta_bancaria}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Saldo"
              value={form.saldo}
              onChange={(e) => setForm({ ...form, saldo: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Cambio (vs. saldo anterior)"
              value={form.cambioDinero}
              onChange={(e) => setForm({ ...form, cambioDinero: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Cambio porcentual"
              value={form.cambioPorcentual}
              onChange={(e) => setForm({ ...form, cambioPorcentual: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardar} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
