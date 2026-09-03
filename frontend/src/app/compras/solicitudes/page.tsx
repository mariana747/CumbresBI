"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  Paper,
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
import { ClipboardList, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { SolicitudCompra, createSolicitudCompra, listSolicitudesCompra } from "@/lib/compras";

const ESTADO_LABELS: Record<SolicitudCompra["estado"], string> = {
  PENDIENTE: "Pendiente",
  EN_COTIZACION: "En cotización",
  ORDEN_GENERADA: "Orden generada",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
};
const ESTADO_COLOR: Record<SolicitudCompra["estado"], "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  EN_COTIZACION: "warning",
  ORDEN_GENERADA: "info",
  CERRADA: "success",
  CANCELADA: "error",
};

// Fase 4B - Compras (02/Sep/2026). Cabecera del proceso; cada solicitud
// puede o no venir de una Requisicion ya autorizada de materiales-service
// (campo libre `requisicion`, referencia laxa - ver
// services/compras-tesoreria-service/compras_tesoreria/models.py).
export default function SolicitudesCompraPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [proyecto, setProyecto] = useState("");
  const [requisicion, setRequisicion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("compras.crear") ?? false;

  function recargar() {
    setLoading(true);
    listSolicitudesCompra()
      .then(setSolicitudes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(recargar, []);

  async function handleCrear() {
    setGuardando(true);
    setError(null);
    try {
      await createSolicitudCompra({
        proyecto,
        descripcion,
        requisicion: requisicion || null,
      });
      setDialogOpen(false);
      setProyecto("");
      setRequisicion("");
      setDescripcion("");
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <ClipboardList size={22} strokeWidth={1.5} />
        <Typography variant="h5">Solicitudes de compra</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Punto de partida del proceso de Compras: solicitud → cotizaciones → orden de compra → recepción. Puede
        venir de una Requisición ya autorizada de Obra/Materiales, o levantarse suelta.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : (
        <Paper variant="outlined">
          <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
            <Typography variant="subtitle1">Solicitudes</Typography>
            {puedeCrear && (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={() => setDialogOpen(true)}
                sx={{ ml: "auto" }}
              >
                Nueva solicitud
              </Button>
            )}
          </Stack>
          {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza
          por tarjetas apiladas (ver abajo) - mismo patron que
          tesoreria/flujos/page.tsx. */}
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Proyecto</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell>Requisición</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Cotizaciones</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {solicitudes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Sin solicitudes registradas.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    solicitudes.map((s) => (
                      <TableRow
                        key={s.id_solicitud}
                        hover
                        onClick={() => router.push(`/compras/cotizaciones?solicitud=${s.id_solicitud}`)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>{s.proyecto}</TableCell>
                        <TableCell>{s.descripcion}</TableCell>
                        <TableCell>{s.requisicion || "—"}</TableCell>
                        <TableCell>
                          <Chip size="small" label={ESTADO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} />
                        </TableCell>
                        <TableCell align="right">{s.cotizaciones.length}</TableCell>
                        <TableCell align="right">
                          <Button size="small">Ver cotizaciones</Button>
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
            {solicitudes.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                Sin solicitudes registradas.
              </Typography>
            ) : (
              solicitudes.map((s) => (
                <Paper
                  key={s.id_solicitud}
                  variant="outlined"
                  sx={{ p: 2, cursor: "pointer" }}
                  onClick={() => router.push(`/compras/cotizaciones?solicitud=${s.id_solicitud}`)}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2">{s.proyecto}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.descripcion}
                      </Typography>
                    </Stack>
                    <Chip size="small" label={ESTADO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} sx={{ flexShrink: 0 }} />
                  </Stack>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Requisición:</strong> {s.requisicion || "—"}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Cotizaciones:</strong> {s.cotizaciones.length}
                    </Typography>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        </Paper>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nueva solicitud de compra</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Proyecto"
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              helperText="id_proyecto de vivienda_proyectos"
              fullWidth
            />
            <TextField
              label="Descripción"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Requisición de origen (opcional)"
              value={requisicion}
              onChange={(e) => setRequisicion(e.target.value)}
              helperText="id_requisicion de materiales-service, si esta compra viene de una requisición ya autorizada"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!proyecto || !descripcion || guardando}
            onClick={handleCrear}
          >
            {guardando ? <CircularProgress size={20} /> : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
