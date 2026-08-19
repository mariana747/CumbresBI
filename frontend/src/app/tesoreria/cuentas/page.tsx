"use client";

import { useEffect, useState } from "react";
import {
  Alert,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Landmark, Pencil, Plus, Trash2, Wallet, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  TesoreriaBanco,
  TesoreriaCuenta,
  createBanco,
  createCuenta,
  deleteBanco,
  deleteCuenta,
  listBancos,
  listCuentas,
  updateCuenta,
} from "@/lib/tesoreria";

const CUENTA_FORM_VACIO = {
  rfcRazonSocial: "",
  banco: "",
  cuenta: "",
  clabe: "",
  alias: "",
  label: "",
  activa: true,
  apertura: new Date().toISOString().slice(0, 10),
};

// Cuentas bancarias + catalogo de Bancos (arranque formal de Fase 4,
// 18/Ago/2026, segundo corte tras Contrapartes) - mismo criterio de
// permisos (tesoreria.crear/.editar), sin ScopedManager (ver
// tesoreria/serializers.py).
export default function TesoreriaCuentasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);

  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cuentaDialogOpen, setCuentaDialogOpen] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<TesoreriaCuenta | null>(null);
  const [cuentaForm, setCuentaForm] = useState(CUENTA_FORM_VACIO);
  const [savingCuenta, setSavingCuenta] = useState(false);
  const [cuentaFormError, setCuentaFormError] = useState<string | null>(null);

  const [bancos, setBancos] = useState<TesoreriaBanco[]>([]);
  const [loadingBancos, setLoadingBancos] = useState(true);
  const [bancoDialogOpen, setBancoDialogOpen] = useState(false);
  const [bancoForm, setBancoForm] = useState({ idBanxico: "", banco: "", alias: "" });
  const [savingBanco, setSavingBanco] = useState(false);
  const [bancoFormError, setBancoFormError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  function refreshCuentas() {
    setLoadingCuentas(true);
    listCuentas()
      .then(setCuentas)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingCuentas(false));
  }

  function refreshBancos() {
    setLoadingBancos(true);
    listBancos()
      .then(setBancos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingBancos(false));
  }

  useEffect(() => {
    refreshCuentas();
    refreshBancos();
  }, []);

  function abrirAltaCuenta() {
    setEditingCuenta(null);
    setCuentaForm(CUENTA_FORM_VACIO);
    setCuentaFormError(null);
    setCuentaDialogOpen(true);
  }

  function abrirEdicionCuenta(c: TesoreriaCuenta) {
    setEditingCuenta(c);
    setCuentaForm({
      rfcRazonSocial: c.rfc_razon_social || "",
      banco: c.banco || "",
      cuenta: c.cuenta || "",
      clabe: c.clabe || "",
      alias: c.alias || "",
      label: c.label || "",
      activa: c.activa ?? true,
      apertura: c.apertura,
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
        });
      } else {
        await createCuenta({
          rfcRazonSocial: cuentaForm.rfcRazonSocial,
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
    setBancoForm({ idBanxico: "", banco: "", alias: "" });
    setBancoFormError(null);
    setBancoDialogOpen(true);
  }

  async function handleGuardarBanco() {
    if (!bancoForm.idBanxico.trim()) {
      setBancoFormError("El ID Banxico es requerido.");
      return;
    }
    setSavingBanco(true);
    setBancoFormError(null);
    try {
      await createBanco(bancoForm);
      setBancoDialogOpen(false);
      refreshBancos();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Wallet size={22} strokeWidth={1.5} />
        <Typography variant="h5">Cuentas bancarias</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Cuentas y catálogo de bancos (Banxico) — base para registrar saldos y flujos de Tesorería.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2, pb: 1 }}>
          <Wallet size={18} strokeWidth={1.5} />
          <Typography variant="subtitle1" fontWeight={600}>
            Cuentas
          </Typography>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAltaCuenta}
              sx={{ ml: "auto" }}
            >
              Nueva cuenta
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Alias</TableCell>
                <TableCell>Banco</TableCell>
                <TableCell>CLABE</TableCell>
                <TableCell>Titular</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingCuentas ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : cuentas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin cuentas registradas.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                cuentas.map((c) => (
                  <TableRow key={c.id_cuenta_bancaria} hover>
                    <TableCell>{c.alias || c.label || "—"}</TableCell>
                    <TableCell>{c.banco_nombre || "—"}</TableCell>
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
      </Paper>

      <Paper variant="outlined">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2, pb: 1 }}>
          <Landmark size={18} strokeWidth={1.5} />
          <Typography variant="subtitle1" fontWeight={600}>
            Bancos
          </Typography>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAltaBanco}
              sx={{ ml: "auto" }}
            >
              Nuevo banco
            </Button>
          )}
        </Stack>
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
              ) : bancos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin bancos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                bancos.map((b) => (
                  <TableRow key={b.id_banxico} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{b.id_banxico}</TableCell>
                    <TableCell>{b.banco || "—"}</TableCell>
                    <TableCell>{b.alias || "—"}</TableCell>
                    <TableCell align="right">
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
      </Paper>

      {/* Alta/edicion de cuenta */}
      <Dialog open={cuentaDialogOpen} onClose={() => setCuentaDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editingCuenta ? `Editar ${editingCuenta.alias || editingCuenta.id_cuenta_bancaria}` : "Nueva cuenta"}
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
            {!editingCuenta && (
              <>
                <FormControl size="small" fullWidth>
                  <InputLabel id="banco-label">Banco</InputLabel>
                  <Select
                    labelId="banco-label"
                    label="Banco"
                    value={cuentaForm.banco}
                    onChange={(e) => setCuentaForm({ ...cuentaForm, banco: e.target.value })}
                  >
                    {bancos.map((b) => (
                      <MenuItem key={b.id_banxico} value={b.id_banxico}>
                        {b.banco || b.id_banxico}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
              <FormControlLabel
                control={
                  <Checkbox
                    checked={cuentaForm.activa}
                    onChange={(e) => setCuentaForm({ ...cuentaForm, activa: e.target.checked })}
                  />
                }
                label="Cuenta activa"
              />
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

      {/* Alta de banco */}
      <Dialog open={bancoDialogOpen} onClose={() => setBancoDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Nuevo banco
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBancoDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarBanco} disabled={savingBanco}>
            {savingBanco ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
