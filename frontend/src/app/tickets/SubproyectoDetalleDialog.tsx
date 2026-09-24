"use client";

import { useEffect, useState } from "react";
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
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { Pencil, Plus, Trash2, X as CloseIcon } from "lucide-react";
import { IamUser } from "@/lib/iam";
import { Ticket, TicketsProyectoEstado, TicketsSubproyecto, deleteTicket, listTickets } from "@/lib/tickets";
import TicketDetalleDialog from "./TicketDetalleDialog";
import TicketFormDialog from "./TicketFormDialog";

const ESTADO_COLOR: Record<TicketsProyectoEstado, "default" | "info" | "success" | "error"> = {
  PLANEADO: "default",
  "EN CURSO": "info",
  COMPLETADO: "success",
  CANCELADO: "error",
};

const PRIORIDAD_COLOR: Record<Ticket["prioridad"], "default" | "info" | "warning" | "error"> = {
  BAJA: "default",
  MEDIA: "info",
  ALTA: "warning",
  URGENTE: "error",
};

// Detalle de un Subproyecto (24/Sep/2026) - info + lista de Tickets, cada
// fila abre su propio TicketDetalleDialog (Detalles/Dependencias/Log).
export default function SubproyectoDetalleDialog({
  open,
  onClose,
  subproyecto,
  usuarios,
  puedeEditar,
  puedeCrear,
  onEditar,
  onBorrar,
}: {
  open: boolean;
  onClose: () => void;
  subproyecto: TicketsSubproyecto | null;
  usuarios: IamUser[];
  puedeEditar: boolean;
  puedeCrear: boolean;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ticketFormOpen, setTicketFormOpen] = useState(false);
  const [ticketEditando, setTicketEditando] = useState<Ticket | null>(null);
  const [ticketDetalle, setTicketDetalle] = useState<Ticket | null>(null);

  function refrescarTickets() {
    if (!subproyecto) return;
    setLoading(true);
    listTickets({ idSubproyecto: subproyecto.id_subproyecto })
      .then((res) => setTickets(res.results))
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open || !subproyecto) return;
    setError(null);
    refrescarTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subproyecto?.id_subproyecto]);

  function nombreUsuario(userId: string | null): string {
    if (!userId) return "—";
    const u = usuarios.find((x) => x.user_id === userId);
    return u?.display_name || u?.primary_email || userId;
  }

  async function borrarTicket(t: Ticket) {
    if (!window.confirm(`¿Borrar el ticket "${t.denominacion}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteTicket(t.id_ticket);
      setTicketDetalle(null);
      refrescarTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  if (!subproyecto) return null;

  return (
    <>
      <Dialog
        open={open}
        onClose={(_, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          onClose();
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {subproyecto.denominacion}
          <IconButton onClick={onClose} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <Stack spacing={1} sx={{ mb: 3 }}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Sociedad
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {subproyecto.sociedad}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Responsable
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {nombreUsuario(subproyecto.responsable)}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Estado
              </Typography>
              <Chip size="small" label={subproyecto.estado} color={ESTADO_COLOR[subproyecto.estado]} />
            </Stack>
            {subproyecto.progreso && (
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Progreso
                  </Typography>
                  <Typography variant="body2">{subproyecto.progreso}%</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={Number(subproyecto.progreso)} />
              </Box>
            )}
          </Stack>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">Tickets</Typography>
            {puedeCrear && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={() => {
                  setTicketEditando(null);
                  setTicketFormOpen(true);
                }}
              >
                Nuevo Ticket
              </Button>
            )}
          </Stack>

          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : tickets.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              Sin tickets todavía.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Ticket</TableCell>
                    <TableCell>Prioridad</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Asignado a</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tickets.map((t) => (
                    <TableRow key={t.id_ticket} hover onClick={() => setTicketDetalle(t)} sx={{ cursor: "pointer" }}>
                      <TableCell>{t.denominacion}</TableCell>
                      <TableCell>
                        <Chip size="small" label={t.prioridad} color={PRIORIDAD_COLOR[t.prioridad]} />
                      </TableCell>
                      <TableCell>{t.estado}</TableCell>
                      <TableCell>{nombreUsuario(t.asignado_a)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Editar">
                            <span>
                              <IconButton
                                size="small"
                                aria-label="Editar"
                                onClick={() => {
                                  setTicketEditando(t);
                                  setTicketFormOpen(true);
                                }}
                                disabled={!puedeEditar}
                              >
                                <Pencil size={13} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Borrar">
                            <span>
                              <IconButton size="small" aria-label="Borrar" onClick={() => borrarTicket(t)} disabled={!puedeEditar}>
                                <Trash2 size={13} strokeWidth={1.5} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Tooltip title="Borrar subproyecto">
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

      <TicketFormDialog
        open={ticketFormOpen}
        onClose={() => setTicketFormOpen(false)}
        idSubproyecto={subproyecto.id_subproyecto}
        ticket={ticketEditando}
        usuarios={usuarios}
        onSaved={refrescarTickets}
      />

      <TicketDetalleDialog
        open={!!ticketDetalle}
        onClose={() => setTicketDetalle(null)}
        ticket={ticketDetalle}
        ticketsDelSubproyecto={tickets}
        usuarios={usuarios}
        puedeEditar={puedeEditar}
        onEditar={() => {
          if (ticketDetalle) {
            setTicketEditando(ticketDetalle);
            setTicketFormOpen(true);
            setTicketDetalle(null);
          }
        }}
        onBorrar={() => {
          if (ticketDetalle) borrarTicket(ticketDetalle);
        }}
      />
    </>
  );
}
