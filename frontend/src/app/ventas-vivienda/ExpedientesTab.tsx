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
import { Pencil, Plus, Trash2, Users, X as CloseIcon } from "lucide-react";
import ContraparteSelector from "@/components/ContraparteSelector";
import { TesoreriaContraparte, getContraparte } from "@/lib/tesoreria";
import {
  ViviendaAsesor,
  ViviendaClienteExpediente,
  ViviendaClienteTipo,
  ViviendaExpediente,
  ViviendaExpedienteEstado,
  ViviendaUnidad,
  createClienteExpediente,
  createExpediente,
  deleteClienteExpediente,
  listAsesores,
  listClientesExpediente,
  listExpedientes,
  listViviendas,
  updateExpediente,
} from "@/lib/vivienda";

const TIPO_CLIENTE_LABELS: Record<ViviendaClienteTipo, string> = {
  ACREDITADO: "Acreditado",
  COACREDITADO: "Coacreditado",
};

// Dialogo de clientes de un expediente (19/Ago/2026, conectado al catalogo
// real de contrapartes - ver ContraparteSelector.tsx y docs/architecture/
// README.md sec. 11.2 #7). Aparte del dialogo de arriba porque un
// expediente puede tener 0+ clientes (acreditado/coacreditado), no es un
// campo mas del formulario del expediente.
function ClientesExpedienteDialog({
  expediente,
  onClose,
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  expediente: ViviendaExpediente;
  onClose: () => void;
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [clientes, setClientes] = useState<(ViviendaClienteExpediente & { contraparteNombre?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevaContraparte, setNuevaContraparte] = useState<TesoreriaContraparte | null>(null);
  const [nuevoTipo, setNuevoTipo] = useState<ViviendaClienteTipo>("ACREDITADO");
  const [agregando, setAgregando] = useState(false);

  function refresh() {
    setLoading(true);
    listClientesExpediente(expediente.id_expediente)
      .then(async (lista) => {
        const conNombre = await Promise.all(
          lista.map(async (c) => {
            try {
              const contraparte = await getContraparte(c.id_contraparte);
              return { ...c, contraparteNombre: contraparte.razon_social };
            } catch {
              return c;
            }
          })
        );
        setClientes(conNombre);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [expediente.id_expediente]);

  async function handleAgregar() {
    if (!nuevaContraparte) return;
    setAgregando(true);
    setError(null);
    try {
      await createClienteExpediente({
        expediente: expediente.id_expediente,
        idContraparte: nuevaContraparte.id_contraparte,
        tipo: nuevoTipo,
        actorId,
      });
      setNuevaContraparte(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAgregando(false);
    }
  }

  async function handleQuitar(cliente: ViviendaClienteExpediente) {
    if (!window.confirm("¿Quitar este cliente del expediente?")) return;
    try {
      await deleteClienteExpediente(cliente.id_rel_viv_exp_cliente);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Clientes del expediente {expediente.id_expediente}
        <IconButton onClick={onClose} size="small" aria-label="Cerrar">
          <CloseIcon size={18} strokeWidth={1.5} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
          </Stack>
        ) : clientes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sin clientes registrados en este expediente.
          </Typography>
        ) : (
          <Table size="small" sx={{ mb: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell>Contraparte</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.id_rel_viv_exp_cliente}>
                  <TableCell>{c.contraparteNombre || c.id_contraparte}</TableCell>
                  <TableCell>{TIPO_CLIENTE_LABELS[c.tipo]}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      aria-label="Quitar"
                      onClick={() => handleQuitar(c)}
                      disabled={!puedeEditar}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {puedeCrear && (
          <Stack spacing={2} sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
            <Typography variant="subtitle2" sx={{ pt: 2 }}>
              Agregar cliente
            </Typography>
            <ContraparteSelector value={nuevaContraparte} onChange={setNuevaContraparte} label="Cliente" />
            <FormControl size="small" fullWidth>
              <InputLabel id="tipo-cliente-label">Tipo</InputLabel>
              <Select
                labelId="tipo-cliente-label"
                label="Tipo"
                value={nuevoTipo}
                onChange={(e) => setNuevoTipo(e.target.value as ViviendaClienteTipo)}
              >
                {Object.entries(TIPO_CLIENTE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={handleAgregar}
              disabled={!nuevaContraparte || agregando}
              sx={{ alignSelf: "flex-start" }}
            >
              {agregando ? <CircularProgress size={14} /> : "Agregar"}
            </Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

const ESTADO_LABELS: Record<ViviendaExpedienteEstado, string> = {
  PENDIENTE: "Pendiente",
  "EN PROCESO": "En proceso",
  CONCLUIDO: "Concluido",
  CANCELADO: "Cancelado",
};

const ESTADO_COLORS: Record<ViviendaExpedienteEstado, "default" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  "EN PROCESO": "info",
  CONCLUIDO: "success",
  CANCELADO: "error",
};

const FORM_VACIO = {
  vivienda: "",
  asesor: "",
  idContrato: "",
  estado: "PENDIENTE" as ViviendaExpedienteEstado,
  comentarios: "",
};

export default function ExpedientesTab({
  puedeCrear,
  puedeEditar,
  actorId,
}: {
  puedeCrear: boolean;
  puedeEditar: boolean;
  actorId: string;
}) {
  const [expedientes, setExpedientes] = useState<ViviendaExpediente[]>([]);
  const [viviendas, setViviendas] = useState<ViviendaUnidad[]>([]);
  const [asesores, setAsesores] = useState<ViviendaAsesor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViviendaExpediente | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientesDe, setClientesDe] = useState<ViviendaExpediente | null>(null);

  useEffect(() => {
    listViviendas().then(setViviendas).catch(() => undefined);
    listAsesores().then(setAsesores).catch(() => undefined);
  }, []);

  function refresh() {
    setLoading(true);
    listExpedientes()
      .then(setExpedientes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function abrirAlta() {
    setEditing(null);
    setForm(FORM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirEdicion(e: ViviendaExpediente) {
    setEditing(e);
    setForm({
      vivienda: e.vivienda,
      asesor: e.asesor,
      idContrato: e.id_contrato,
      estado: e.estado,
      comentarios: e.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && (!form.vivienda || !form.asesor || !form.idContrato.trim())) {
      setFormError("Vivienda, asesor y contrato son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateExpediente(
          editing.id_expediente,
          { estado: form.estado, comentarios: form.comentarios || null },
          actorId
        );
      } else {
        await createExpediente({
          vivienda: form.vivienda,
          asesor: form.asesor,
          idContrato: form.idContrato,
          estado: form.estado,
          comentarios: form.comentarios || null,
          actorId,
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

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Expedientes de venta (vivienda + asesor + contrato de Tesorería).
          </Typography>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: "auto" } }}
            >
              Nuevo expediente
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Vivienda</TableCell>
                <TableCell>Asesor</TableCell>
                <TableCell>Contrato</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : expedientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin expedientes registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                expedientes.map((e) => (
                  <TableRow key={e.id_expediente} hover>
                    <TableCell>{e.vivienda_denominacion || "—"}</TableCell>
                    <TableCell>{e.asesor_nombre}</TableCell>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id_contrato}</TableCell>
                    <TableCell>
                      <Chip size="small" label={ESTADO_LABELS[e.estado]} color={ESTADO_COLORS[e.estado]} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" aria-label="Clientes" onClick={() => setClientesDe(e)}>
                        <Users size={14} strokeWidth={1.5} />
                      </IconButton>
                      <IconButton size="small" aria-label="Editar" onClick={() => abrirEdicion(e)} disabled={!puedeEditar}>
                        <Pencil size={14} strokeWidth={1.5} />
                      </IconButton>
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
          {editing ? `Editar expediente ${editing.id_expediente}` : "Nuevo expediente"}
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
                  <InputLabel id="vivienda-label">Vivienda</InputLabel>
                  <Select
                    labelId="vivienda-label"
                    label="Vivienda"
                    value={form.vivienda}
                    onChange={(e) => setForm({ ...form, vivienda: e.target.value })}
                  >
                    {viviendas.map((v) => (
                      <MenuItem key={v.id_vivienda} value={v.id_vivienda}>
                        {v.denominacion || v.num_oficial || v.id_vivienda} ({v.proyecto_denominacion})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel id="asesor-label">Asesor</InputLabel>
                  <Select
                    labelId="asesor-label"
                    label="Asesor"
                    value={form.asesor}
                    onChange={(e) => setForm({ ...form, asesor: e.target.value })}
                  >
                    {asesores.map((a) => (
                      <MenuItem key={a.id_asesor} value={a.id_asesor}>
                        {a.nombre}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="ID de contrato (Tesorería)"
                  value={form.idContrato}
                  onChange={(e) => setForm({ ...form, idContrato: e.target.value })}
                  helperText="Formato sociedad-contraparte-consecutivo, generado en Tesorería"
                  fullWidth
                />
              </>
            )}
            <FormControl size="small" fullWidth>
              <InputLabel id="estado-label">Estado</InputLabel>
              <Select
                labelId="estado-label"
                label="Estado"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as ViviendaExpedienteEstado })}
              >
                {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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

      {clientesDe && (
        <ClientesExpedienteDialog
          expediente={clientesDe}
          onClose={() => setClientesDe(null)}
          puedeCrear={puedeCrear}
          puedeEditar={puedeEditar}
          actorId={actorId}
        />
      )}
    </>
  );
}
