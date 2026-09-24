"use client";

import { useEffect, useState } from "react";
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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Pencil, Plus, Trash2, X as CloseIcon } from "lucide-react";
import { IamUser } from "@/lib/iam";
import {
  Ticket,
  TicketsDependencia,
  TicketsDependenciaTipo,
  TicketsLog,
  TicketsLogAccion,
  addLog,
  createDependencia,
  deleteDependencia,
  listDependencias,
  listLog,
} from "@/lib/tickets";

const TIPOS_DEPENDENCIA: TicketsDependenciaTipo[] = ["ESTRICTO", "FLEXIBLE"];
const ACCIONES_LOG: TicketsLogAccion[] = ["COMENTARIO", "ACTUALIZACION", "CARGA ARCHIVO", "CAMBIO ASIGNACION", "OTRO"];

const PRIORIDAD_COLOR: Record<Ticket["prioridad"], "default" | "info" | "warning" | "error"> = {
  BAJA: "default",
  MEDIA: "info",
  ALTA: "warning",
  URGENTE: "error",
};

const ESTADO_TICKET_COLOR: Record<Ticket["estado"], "default" | "info" | "warning" | "success" | "error"> = {
  PENDIENTE: "default",
  "EN CURSO": "info",
  "EN REVISION": "warning",
  COMPLETADO: "success",
  CANCELADO: "error",
};

type TabDetalle = "detalles" | "dependencias" | "log";

// Detalle de un Ticket (24/Sep/2026) - mismo patron "todo dentro de un
// dialogo con sus propios tabs" que Conciliacion de Facturas (ver memoria
// feedback-patron-tabs-pegados-a-tabla). Dependencias/Log son el ultimo
// nivel de la jerarquia de Tickets.
export default function TicketDetalleDialog({
  open,
  onClose,
  ticket,
  ticketsDelSubproyecto,
  usuarios,
  puedeEditar,
  onEditar,
  onBorrar,
}: {
  open: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  ticketsDelSubproyecto: Ticket[];
  usuarios: IamUser[];
  puedeEditar: boolean;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const [tab, setTab] = useState<TabDetalle>("detalles");
  const [dependencias, setDependencias] = useState<TicketsDependencia[]>([]);
  const [cargandoDependencias, setCargandoDependencias] = useState(false);
  const [log, setLog] = useState<TicketsLog[]>([]);
  const [cargandoLog, setCargandoLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nuevaDependencia, setNuevaDependencia] = useState<Ticket | null>(null);
  const [tipoDependencia, setTipoDependencia] = useState<TicketsDependenciaTipo>("ESTRICTO");
  const [guardandoDependencia, setGuardandoDependencia] = useState(false);

  const [nuevoLogAccion, setNuevoLogAccion] = useState<TicketsLogAccion>("COMENTARIO");
  const [nuevoLogComentario, setNuevoLogComentario] = useState("");
  const [guardandoLog, setGuardandoLog] = useState(false);

  function nombreUsuario(userId: string | null): string {
    if (!userId) return "—";
    const u = usuarios.find((x) => x.user_id === userId);
    return u?.display_name || u?.primary_email || userId;
  }

  function cargarDependencias(idTicket: string) {
    setCargandoDependencias(true);
    listDependencias(idTicket)
      .then((res) => setDependencias(res.results))
      .catch(() => setDependencias([]))
      .finally(() => setCargandoDependencias(false));
  }

  function cargarLog(idTicket: string) {
    setCargandoLog(true);
    listLog(idTicket)
      .then((res) => setLog(res.results))
      .catch(() => setLog([]))
      .finally(() => setCargandoLog(false));
  }

  useEffect(() => {
    if (!open || !ticket) return;
    setTab("detalles");
    setError(null);
    setNuevaDependencia(null);
    setNuevoLogComentario("");
    cargarDependencias(ticket.id_ticket);
    cargarLog(ticket.id_ticket);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket?.id_ticket]);

  async function agregarDependencia() {
    if (!ticket || !nuevaDependencia) return;
    setGuardandoDependencia(true);
    setError(null);
    try {
      await createDependencia({ predecesora: nuevaDependencia.id_ticket, sucesora: ticket.id_ticket, tipo: tipoDependencia });
      cargarDependencias(ticket.id_ticket);
      setNuevaDependencia(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardandoDependencia(false);
    }
  }

  async function quitarDependencia(d: TicketsDependencia) {
    try {
      await deleteDependencia(d.id_dependencia);
      setDependencias((prev) => prev.filter((x) => x.id_dependencia !== d.id_dependencia));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function agregarLog() {
    if (!ticket) return;
    setGuardandoLog(true);
    setError(null);
    try {
      await addLog({ idTicket: ticket.id_ticket, accion: nuevoLogAccion, comentario: nuevoLogComentario || undefined });
      cargarLog(ticket.id_ticket);
      setNuevoLogComentario("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardandoLog(false);
    }
  }

  if (!ticket) return null;

  const opcionesPredecesora = ticketsDelSubproyecto.filter(
    (t) =>
      t.id_ticket !== ticket.id_ticket &&
      !dependencias.some((d) => d.predecesora === t.id_ticket && d.sucesora === ticket.id_ticket)
  );

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
        onClose();
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {ticket.denominacion}
        <IconButton onClick={onClose} size="small" aria-label="Cerrar">
          <CloseIcon size={18} strokeWidth={1.5} />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab value="detalles" label="Detalles" />
          <Tab value="dependencias" label="Dependencias" />
          <Tab value="log" label="Bitácora" />
        </Tabs>
      </Box>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {tab === "detalles" && (
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Prioridad
              </Typography>
              <Chip size="small" label={ticket.prioridad} color={PRIORIDAD_COLOR[ticket.prioridad]} />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Estado
              </Typography>
              <Chip size="small" label={ticket.estado} color={ESTADO_TICKET_COLOR[ticket.estado]} />
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Categoría
              </Typography>
              <Typography variant="body2">{ticket.categoria || "—"}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Asignado a
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {nombreUsuario(ticket.asignado_a)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Fecha fin (prog.)
              </Typography>
              <Typography variant="body2">{ticket.fecha_fin_prog || "—"}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Fecha fin (real)
              </Typography>
              <Typography variant="body2">{ticket.fecha_fin_real || "—"}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Estimación
              </Typography>
              <Typography variant="body2">{ticket.estimacion_horas ? `${ticket.estimacion_horas} hrs` : "—"}</Typography>
            </Stack>
            {ticket.descripcion && (
              <Typography variant="body2" color="text.secondary">
                {ticket.descripcion}
              </Typography>
            )}
            {ticket.instrucciones_entrega && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Instrucciones de entrega
                </Typography>
                <Typography variant="body2">{ticket.instrucciones_entrega}</Typography>
              </Box>
            )}
          </Stack>
        )}

        {tab === "dependencias" && (
          <Stack spacing={2}>
            {cargandoDependencias ? (
              <Stack alignItems="center" sx={{ py: 2 }}>
                <CircularProgress size={20} />
              </Stack>
            ) : (
              <Stack spacing={0.5}>
                {dependencias.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Sin dependencias todavía — este ticket no depende de ningún otro.
                  </Typography>
                )}
                {dependencias.map((d) => {
                  const predecesora = ticketsDelSubproyecto.find((t) => t.id_ticket === d.predecesora);
                  return (
                    <Stack key={d.id_dependencia} direction="row" alignItems="center" justifyContent="space-between">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2">{predecesora?.denominacion || d.predecesora}</Typography>
                        <Chip size="small" variant="outlined" label={d.tipo} />
                      </Stack>
                      {puedeEditar && (
                        <IconButton size="small" aria-label="Quitar" onClick={() => quitarDependencia(d)}>
                          <Trash2 size={13} strokeWidth={1.5} />
                        </IconButton>
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            )}
            {puedeEditar && (
              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  Este ticket depende de que termine:
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Autocomplete
                    size="small"
                    fullWidth
                    openOnFocus
                    options={opcionesPredecesora}
                    value={nuevaDependencia}
                    onChange={(_, value) => setNuevaDependencia(value)}
                    getOptionLabel={(t) => t.denominacion}
                    isOptionEqualToValue={(o, v) => o.id_ticket === v.id_ticket}
                    renderInput={(params) => <TextField {...params} label="Ticket predecesor" />}
                  />
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel id="tipo-dependencia-label">Tipo</InputLabel>
                    <Select
                      labelId="tipo-dependencia-label"
                      label="Tipo"
                      value={tipoDependencia}
                      onChange={(e) => setTipoDependencia(e.target.value as TicketsDependenciaTipo)}
                    >
                      {TIPOS_DEPENDENCIA.map((t) => (
                        <MenuItem key={t} value={t}>
                          {t}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Tooltip title="Agregar">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={agregarDependencia}
                        disabled={!nuevaDependencia || guardandoDependencia}
                      >
                        <Plus size={18} strokeWidth={1.5} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
            )}
          </Stack>
        )}

        {tab === "log" && (
          <Stack spacing={2}>
            {cargandoLog ? (
              <Stack alignItems="center" sx={{ py: 2 }}>
                <CircularProgress size={20} />
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {log.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Sin bitácora todavía.
                  </Typography>
                )}
                {log.map((l) => (
                  <Box key={l.id_log}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" variant="outlined" label={l.accion} />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(l.created_at).toLocaleString("es-MX")}
                      </Typography>
                    </Stack>
                    {l.comentario && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {l.comentario}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
            {puedeEditar && (
              <Stack spacing={1}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="log-accion-label">Acción</InputLabel>
                  <Select
                    labelId="log-accion-label"
                    label="Acción"
                    value={nuevoLogAccion}
                    onChange={(e) => setNuevoLogAccion(e.target.value as TicketsLogAccion)}
                  >
                    {ACCIONES_LOG.map((a) => (
                      <MenuItem key={a} value={a}>
                        {a}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="Comentario"
                  value={nuevoLogComentario}
                  onChange={(e) => setNuevoLogComentario(e.target.value)}
                  fullWidth
                  multiline
                  minRows={2}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={agregarLog}
                  disabled={guardandoLog}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Agregar a la bitácora
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Tooltip title="Borrar ticket">
          <span>
            <IconButton aria-label="Borrar" onClick={onBorrar} disabled={!puedeEditar}>
              <Trash2 size={16} strokeWidth={1.5} />
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="contained" startIcon={<Pencil size={14} strokeWidth={2} />} onClick={onEditar} disabled={!puedeEditar}>
          Editar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
