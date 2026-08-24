"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Checkbox,
  IconButton,
  InputAdornment,
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
  Tooltip,
  Typography,
} from "@mui/material";
import { ArrowLeftRight, Check, Pencil, Plus, Search, ThumbsUp, X, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  TesoreriaContrato,
  TesoreriaCuenta,
  TesoreriaFlujo,
  TesoreriaValidacionEstado,
  aprobarFlujo,
  createFlujo,
  listContratos,
  listCuentas,
  listFlujos,
  rechazarFlujo,
  registrarPagoFlujo,
  updateFlujo,
} from "@/lib/tesoreria";

const FORM_VACIO = {
  contrato: "",
  cuenta: "",
  totalMxp: "",
  fechaEfectiva: new Date().toISOString().slice(0, 10),
  concepto: "",
  reembolso: false,
  idEmpleadoReembolso: "",
  comentarios: "",
};

const VALIDACION_COLOR: Record<TesoreriaValidacionEstado, "warning" | "success" | "error"> = {
  PENDIENTE: "warning",
  APROBADA: "success",
  RECHAZADA: "error",
};

// Flujos de caja (24/Ago/2026, Sem 21 del cronograma) - un movimiento real
// de dinero (pago a proveedor, reembolso, nomina) ligado a un contrato.
// Ciclo de vida propio con segregacion de funciones: capturar (cualquiera
// con tesoreria.crear/.editar) -> aprobar/rechazar (solo tesoreria.aprobar,
// ej. FINANZAS_MANAGER) -> registrar_pago (de vuelta a tesoreria.editar,
// el analista es quien de verdad hace la transferencia una vez autorizada).
export default function TesoreriaFlujosPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [flujos, setFlujos] = useState<TesoreriaFlujo[]>([]);
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaFlujo | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    listContratos().then(setContratos).catch(() => setContratos([]));
    listCuentas().then(setCuentas).catch(() => setCuentas([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;
  const puedeAprobar = session?.perm_keys.includes("tesoreria.aprobar") ?? false;

  function refresh() {
    setLoading(true);
    listFlujos({ search: search || undefined })
      .then(setFlujos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(f: TesoreriaFlujo) {
    setEditing(f);
    setForm({
      contrato: f.contrato || "",
      cuenta: f.cuenta,
      totalMxp: f.total_mxp || "",
      fechaEfectiva: f.fecha_efectiva || "",
      concepto: f.concepto || "",
      reembolso: f.reembolso ?? false,
      idEmpleadoReembolso: f.id_empleado_reembolso || "",
      comentarios: f.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && !form.cuenta) {
      setFormError("Selecciona la cuenta bancaria.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateFlujo(editing.id_flujo, {
          concepto: form.concepto || undefined,
          fechaEfectiva: form.fechaEfectiva || undefined,
          totalMxp: form.totalMxp || undefined,
          comentarios: form.comentarios || undefined,
        });
      } else {
        await createFlujo({
          contrato: form.contrato || undefined,
          cuenta: form.cuenta,
          totalMxp: form.totalMxp || undefined,
          fechaEfectiva: form.fechaEfectiva || undefined,
          concepto: form.concepto || undefined,
          reembolso: form.reembolso,
          idEmpleadoReembolso: form.idEmpleadoReembolso || undefined,
          comentarios: form.comentarios || undefined,
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

  async function handleAprobar(f: TesoreriaFlujo) {
    if (!session) return;
    setAccionando(f.id_flujo);
    try {
      await aprobarFlujo(f.id_flujo, session.user_id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
    }
  }

  async function handleRechazar(f: TesoreriaFlujo) {
    setAccionando(f.id_flujo);
    try {
      await rechazarFlujo(f.id_flujo);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
    }
  }

  async function handleRegistrarPago(f: TesoreriaFlujo) {
    setAccionando(f.id_flujo);
    try {
      await registrarPagoFlujo(f.id_flujo);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <ArrowLeftRight size={22} strokeWidth={1.5} />
        <Typography variant="h5">Flujos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Ingresos y egresos reales ligados a un contrato — capturar, autorizar y registrar el pago.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar por ID de flujo o concepto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, maxWidth: 320 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} strokeWidth={1.5} />
                </InputAdornment>
              ),
            }}
          />
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: "auto" } }}
            >
              Nuevo flujo
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID de flujo</TableCell>
                <TableCell>Contrato</TableCell>
                <TableCell>Cuenta</TableCell>
                <TableCell>Concepto</TableCell>
                <TableCell align="right">Total MXP</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Pagado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : flujos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin flujos registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                flujos.map((f) => (
                  <TableRow key={f.id_flujo} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{f.id_flujo}</TableCell>
                    <TableCell>{f.contrato || "—"}</TableCell>
                    <TableCell>{f.cuenta_alias || f.cuenta}</TableCell>
                    <TableCell>{f.concepto || "—"}</TableCell>
                    <TableCell align="right">
                      {f.total_mxp
                        ? Number(f.total_mxp).toLocaleString("es-MX", { style: "currency", currency: "MXN" })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={f.validacion_estado || "PENDIENTE"}
                        color={VALIDACION_COLOR[f.validacion_estado || "PENDIENTE"]}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={f.pagado ? "Pagado" : "Sin pagar"}
                        color={f.pagado ? "success" : "default"}
                        variant={f.pagado ? "filled" : "outlined"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Editar">
                          <span>
                            <IconButton
                              size="small"
                              aria-label="Editar"
                              onClick={() => abrirEdicion(f)}
                              disabled={!puedeEditar}
                            >
                              <Pencil size={14} strokeWidth={1.5} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        {puedeAprobar && f.validacion_estado !== "APROBADA" && (
                          <Tooltip title="Aprobar">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Aprobar"
                                color="success"
                                onClick={() => handleAprobar(f)}
                                disabled={accionando === f.id_flujo}
                              >
                                <ThumbsUp size={14} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {puedeAprobar && f.validacion_estado !== "RECHAZADA" && (
                          <Tooltip title="Rechazar">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Rechazar"
                                color="error"
                                onClick={() => handleRechazar(f)}
                                disabled={accionando === f.id_flujo}
                              >
                                <X size={14} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {puedeEditar && !f.pagado && (
                          <Tooltip title={f.autorizacion ? "Registrar pago" : "Falta autorizar antes de pagar"}>
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Registrar pago"
                                color="primary"
                                onClick={() => handleRegistrarPago(f)}
                                disabled={!f.autorizacion || accionando === f.id_flujo}
                              >
                                <Check size={14} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editing ? `Editar ${editing.id_flujo}` : "Nuevo flujo"}
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
            {!editing && (
              <>
                <FormControl size="small" fullWidth>
                  <InputLabel id="contrato-label">Contrato (opcional)</InputLabel>
                  <Select
                    labelId="contrato-label"
                    label="Contrato (opcional)"
                    value={form.contrato}
                    onChange={(e) => setForm({ ...form, contrato: e.target.value })}
                  >
                    <MenuItem value="">
                      <em>Sin contrato (ej. reembolso suelto)</em>
                    </MenuItem>
                    {contratos.map((c) => (
                      <MenuItem key={c.id_contrato} value={c.id_contrato}>
                        {c.id_contrato} — {c.contraparte_nombre}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel id="cuenta-label">Cuenta bancaria</InputLabel>
                  <Select
                    labelId="cuenta-label"
                    label="Cuenta bancaria"
                    value={form.cuenta}
                    onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
                  >
                    {cuentas.map((c) => (
                      <MenuItem key={c.id_cuenta_bancaria} value={c.id_cuenta_bancaria}>
                        {c.alias || c.clabe}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.reembolso}
                      onChange={(e) => setForm({ ...form, reembolso: e.target.checked })}
                    />
                  }
                  label="Es un reembolso"
                />
                {form.reembolso && (
                  <TextField
                    size="small"
                    label="ID de empleado (reembolso)"
                    value={form.idEmpleadoReembolso}
                    onChange={(e) => setForm({ ...form, idEmpleadoReembolso: e.target.value })}
                    fullWidth
                  />
                )}
              </>
            )}
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                type="date"
                label="Fecha efectiva"
                value={form.fechaEfectiva}
                onChange={(e) => setForm({ ...form, fechaEfectiva: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label="Total (MXP)"
                value={form.totalMxp}
                onChange={(e) => setForm({ ...form, totalMxp: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Concepto"
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Comentarios"
              value={form.comentarios}
              onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
              multiline
              minRows={2}
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
