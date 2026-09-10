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
  Divider,
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
  Tabs,
  Tab,
  TextField,
  Typography,
} from "@mui/material";
import { Eye, Plus, UserCheck, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  RrhhEmpleado,
  RrhhPuesto,
  createEmpleado,
  createPuesto,
  darDeBajaPuesto,
  listEmpleados,
  listPuestos,
} from "@/lib/rrhh";

const FORM_EMPLEADO_VACIO = {
  nombres: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  curp: "",
  rfc: "",
  nss: "",
  telefono: "",
  email: "",
  banco: "",
  cuentaBanco: "",
};

const FORM_PUESTO_VACIO = {
  sociedad: "",
  proyecto: "",
  departamento: "",
  puesto: "",
  salarioDiario: "",
  tipoSalario: "",
  tipoPago: "",
};

// Empleados/Puestos (10/Sep/2026, Fase 2 del modulo de Nominas - primera
// pantalla real de rrhh-service, hasta ahora solo tenia modelos). El
// historial de sueldo (09/Sep/2026, notas de Jenny) se logra dando de baja
// el Puesto vigente y creando uno nuevo con el sueldo actualizado - nunca
// se edita salario_diario de un Puesto ya usado, para no perder el
// historial real. Ver services/rrhh-service/rrhh/views.py::dar_de_baja.
export default function RrhhEmpleadosPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [empleados, setEmpleados] = useState<RrhhEmpleado[]>([]);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formEmpleado, setFormEmpleado] = useState(FORM_EMPLEADO_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Detalle de un empleado: sus Puestos (historial completo, mas reciente
  // primero) + alta de un Puesto nuevo (09/Sep/2026, "cambio de sueldo").
  const [detalle, setDetalle] = useState<RrhhEmpleado | null>(null);
  const [puestos, setPuestos] = useState<RrhhPuesto[]>([]);
  const [tab, setTab] = useState<"puestos" | "nuevoPuesto">("puestos");
  const [formPuesto, setFormPuesto] = useState(FORM_PUESTO_VACIO);
  const [puestoError, setPuestoError] = useState<string | null>(null);
  const [savingPuesto, setSavingPuesto] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listProyectos().then(setProyectos).catch(() => setProyectos([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("rrhh.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("rrhh.editar") ?? false;

  function refresh() {
    setLoading(true);
    listEmpleados(search || undefined)
      .then(setEmpleados)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function aliasSociedad(rfc: string | null): string {
    if (!rfc) return "—";
    const s = sociedades.find((x) => x.rfc === rfc);
    return s?.alias_sociedad || s?.razon_social || rfc;
  }

  function aliasProyecto(idProyecto: string | null): string {
    if (!idProyecto) return "—";
    const p = proyectos.find((x) => x.id_proyecto === idProyecto);
    return p ? p.alias_proyecto || p.denominacion || idProyecto : idProyecto;
  }

  function abrirAlta() {
    setFormEmpleado(FORM_EMPLEADO_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardarEmpleado() {
    if (!formEmpleado.nombres) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createEmpleado(formEmpleado);
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function abrirDetalle(e: RrhhEmpleado) {
    setDetalle(e);
    setTab("puestos");
    setFormPuesto(FORM_PUESTO_VACIO);
    setPuestoError(null);
    listPuestos({ empleado: e.id_empleado })
      .then(setPuestos)
      .catch(() => setPuestos([]));
  }

  const puestoVigente = puestos.find((p) => !p.fecha_baja) || null;

  async function handleDarDeBaja(p: RrhhPuesto) {
    if (!window.confirm(`¿Dar de baja el puesto actual (${p.puesto || p.id_puesto})? Podrás dar de alta uno nuevo después.`)) {
      return;
    }
    try {
      await darDeBajaPuesto(p.id_puesto);
      if (detalle) {
        listPuestos({ empleado: detalle.id_empleado }).then(setPuestos);
      }
    } catch (err) {
      setPuestoError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleGuardarPuesto() {
    if (!detalle) return;
    if (!formPuesto.sociedad) {
      setPuestoError("La empresa es obligatoria.");
      return;
    }
    setSavingPuesto(true);
    setPuestoError(null);
    try {
      await createPuesto({ empleado: detalle.id_empleado, ...formPuesto });
      setFormPuesto(FORM_PUESTO_VACIO);
      setTab("puestos");
      listPuestos({ empleado: detalle.id_empleado }).then(setPuestos);
    } catch (err) {
      setPuestoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingPuesto(false);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <UserCheck size={22} strokeWidth={1.5} />
        <Typography variant="h5">Empleados</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Datos generales y Puestos (historial de sueldo) — alimenta a Nóminas.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <FiltrosBar
          flush
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre, CURP o RFC..."
          actions={
            puedeCrear ? (
              <Button size="small" variant="contained" startIcon={<Plus size={14} strokeWidth={2} />} onClick={abrirAlta}>
                Nuevo Empleado
              </Button>
            ) : undefined
          }
        />

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : empleados.length === 0 ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Sin empleados registrados todavía.
            </Typography>
          </Stack>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Nombre</TableCell>
                  <TableCell>CURP</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {empleados.map((e) => (
                  <TableRow key={e.id_empleado} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id_empleado}</TableCell>
                    <TableCell>{e.nombre_completo || "—"}</TableCell>
                    <TableCell>{e.curp || "—"}</TableCell>
                    <TableCell>{e.email || "—"}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Ver" onClick={() => abrirDetalle(e)}>
                        <Eye size={16} strokeWidth={1.5} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Alta de empleado */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Nuevo Empleado
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
            <TextField
              size="small"
              label="Nombre(s)"
              value={formEmpleado.nombres}
              onChange={(e) => setFormEmpleado({ ...formEmpleado, nombres: e.target.value })}
              fullWidth
              required
            />
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Apellido paterno"
                value={formEmpleado.apellidoPaterno}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, apellidoPaterno: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Apellido materno"
                value={formEmpleado.apellidoMaterno}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, apellidoMaterno: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="CURP"
                value={formEmpleado.curp}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, curp: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="RFC"
                value={formEmpleado.rfc}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, rfc: e.target.value })}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="NSS"
              value={formEmpleado.nss}
              onChange={(e) => setFormEmpleado({ ...formEmpleado, nss: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Teléfono"
                value={formEmpleado.telefono}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, telefono: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Email"
                value={formEmpleado.email}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, email: e.target.value })}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                label="Banco"
                value={formEmpleado.banco}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, banco: e.target.value })}
                fullWidth
              />
              <TextField
                size="small"
                label="Cuenta / CLABE"
                value={formEmpleado.cuentaBanco}
                onChange={(e) => setFormEmpleado({ ...formEmpleado, cuentaBanco: e.target.value })}
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarEmpleado} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detalle de empleado + Puestos (historial de sueldo) */}
      <Dialog open={!!detalle} onClose={() => setDetalle(null)} fullWidth maxWidth="sm">
        {detalle && (
          <>
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {detalle.nombre_completo}
              <IconButton onClick={() => setDetalle(null)} size="small" aria-label="Cerrar">
                <CloseIcon size={18} strokeWidth={1.5} />
              </IconButton>
            </DialogTitle>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tab label="Puestos" value="puestos" />
              {puedeCrear && <Tab label="Nuevo Puesto" value="nuevoPuesto" />}
            </Tabs>
            <DialogContent dividers>
              {puestoError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {puestoError}
                </Alert>
              )}

              {tab === "puestos" && (
                <Stack spacing={1.5}>
                  {puestos.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Sin puestos registrados todavía.
                    </Typography>
                  ) : (
                    puestos.map((p) => (
                      <Paper key={p.id_puesto} variant="outlined" sx={{ p: 1.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Stack spacing={0.5}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2" fontWeight={600}>
                                {p.puesto || "(sin puesto)"} — {aliasSociedad(p.sociedad)}
                              </Typography>
                              <Chip
                                size="small"
                                label={p.fecha_baja ? "Baja" : "Vigente"}
                                color={p.fecha_baja ? "default" : "success"}
                                variant={p.fecha_baja ? "outlined" : "filled"}
                              />
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {p.proyecto ? `Proyecto ${aliasProyecto(p.proyecto)} — ` : ""}
                              Sueldo diario: {p.salario_diario ? `$${p.salario_diario}` : "—"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Alta: {p.fecha_alta || "—"} {p.fecha_baja ? `· Baja: ${p.fecha_baja}` : ""}
                            </Typography>
                          </Stack>
                          {!p.fecha_baja && puedeEditar && (
                            <Button size="small" onClick={() => handleDarDeBaja(p)}>
                              Dar de baja
                            </Button>
                          )}
                        </Stack>
                      </Paper>
                    ))
                  )}
                </Stack>
              )}

              {tab === "nuevoPuesto" && (
                <Stack spacing={2}>
                  {puestoVigente && (
                    <Alert severity="warning">
                      Ya hay un puesto vigente ({puestoVigente.puesto || puestoVigente.id_puesto}). Dalo de baja
                      primero en la pestaña "Puestos" antes de crear uno nuevo, para no perder el historial de
                      sueldo.
                    </Alert>
                  )}
                  <Divider />
                  <FormControl size="small" fullWidth required>
                    <InputLabel id="sociedad-puesto-label">Empresa</InputLabel>
                    <Select
                      labelId="sociedad-puesto-label"
                      label="Empresa"
                      value={formPuesto.sociedad}
                      onChange={(e) => setFormPuesto({ ...formPuesto, sociedad: e.target.value })}
                    >
                      {sociedades.map((s) => (
                        <MenuItem key={s.rfc} value={s.rfc}>
                          {s.alias_sociedad || s.razon_social || s.rfc}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="proyecto-puesto-label">Proyecto</InputLabel>
                    <Select
                      labelId="proyecto-puesto-label"
                      label="Proyecto"
                      value={formPuesto.proyecto}
                      onChange={(e) => setFormPuesto({ ...formPuesto, proyecto: e.target.value })}
                    >
                      <MenuItem value="">
                        <em>Ninguno (corporativo)</em>
                      </MenuItem>
                      {proyectos.map((p) => (
                        <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                          {p.alias_proyecto || p.denominacion || p.id_proyecto}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    label="Puesto"
                    value={formPuesto.puesto}
                    onChange={(e) => setFormPuesto({ ...formPuesto, puesto: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="Departamento"
                    value={formPuesto.departamento}
                    onChange={(e) => setFormPuesto({ ...formPuesto, departamento: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="Sueldo diario"
                    value={formPuesto.salarioDiario}
                    onChange={(e) => setFormPuesto({ ...formPuesto, salarioDiario: e.target.value })}
                    fullWidth
                  />
                  <FormControl size="small" fullWidth>
                    <InputLabel id="tipo-salario-label">Tipo de nómina</InputLabel>
                    <Select
                      labelId="tipo-salario-label"
                      label="Tipo de nómina"
                      value={formPuesto.tipoSalario}
                      onChange={(e) => setFormPuesto({ ...formPuesto, tipoSalario: e.target.value })}
                    >
                      <MenuItem value="">
                        <em>Sin especificar</em>
                      </MenuItem>
                      <MenuItem value="QUINCENAL">Quincenal (corporativo)</MenuItem>
                      <MenuItem value="SEMANAL">Semanal (obra)</MenuItem>
                    </Select>
                  </FormControl>
                  <Stack direction="row" justifyContent="flex-end">
                    <Button variant="contained" onClick={handleGuardarPuesto} disabled={savingPuesto || !!puestoVigente}>
                      {savingPuesto ? <CircularProgress size={16} /> : "Guardar Puesto"}
                    </Button>
                  </Stack>
                </Stack>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </AppShell>
  );
}
