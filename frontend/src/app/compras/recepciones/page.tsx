"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
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
import { Truck } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { OrdenCompra, Recepcion, createRecepcion, listOrdenesCompra, listRecepciones } from "@/lib/compras";

type CantidadPorLinea = Record<string, string>;

// Fase 4B - Compras (02/Sep/2026). Registra lo que llegó de una orden -
// puede haber varias recepciones por orden (entregas parciales). El
// backend valida que no se reciba mas de lo que falta por linea (ver
// RecepcionViewSet.create en views.py).
export default function RecepcionesPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenCompra | null>(null);
  const [recepciones, setRecepciones] = useState<Recepcion[]>([]);
  const [cantidades, setCantidades] = useState<CantidadPorLinea>({});
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [hora, setHora] = useState(new Date().toTimeString().slice(0, 5));
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("compras.crear") ?? false;

  useEffect(() => {
    setLoading(true);
    listOrdenesCompra()
      .then((data) => setOrdenes(data.filter((o) => o.estado !== "RECIBIDA_TOTAL" && o.estado !== "CANCELADA")))
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!ordenSeleccionada) {
      setRecepciones([]);
      return;
    }
    listRecepciones(ordenSeleccionada.id_orden)
      .then(setRecepciones)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }, [ordenSeleccionada]);

  const lineasPendientes = useMemo(
    () => (ordenSeleccionada ? ordenSeleccionada.lineas.filter((l) => Number(l.cantidad_recibida) < Number(l.cantidad)) : []),
    [ordenSeleccionada]
  );

  async function handleRegistrar() {
    if (!ordenSeleccionada) return;
    const lineas = Object.entries(cantidades)
      .filter(([, valor]) => valor && Number(valor) > 0)
      .map(([orden_linea, cantidad_recibida]) => ({ orden_linea, cantidad_recibida }));
    if (lineas.length === 0) {
      setError("Captura al menos una cantidad recibida.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await createRecepcion({ orden: ordenSeleccionada.id_orden, fecha, hora: `${hora}:00`, lineas });
      const [ordenesActualizadas, recepcionesActualizadas] = await Promise.all([
        listOrdenesCompra(),
        listRecepciones(ordenSeleccionada.id_orden),
      ]);
      const actualizada = ordenesActualizadas.find((o) => o.id_orden === ordenSeleccionada.id_orden) || null;
      setOrdenes(ordenesActualizadas.filter((o) => o.estado !== "RECIBIDA_TOTAL" && o.estado !== "CANCELADA"));
      setOrdenSeleccionada(actualizada);
      setRecepciones(recepcionesActualizadas);
      setCantidades({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Truck size={22} strokeWidth={1.5} />
        <Typography variant="h5">Recepciones</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Registra lo que llegó de una orden de compra. Puede haber varias entregas parciales antes de que la orden
        quede recibida por completo.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : (
        <Stack spacing={3}>
          <Autocomplete
            options={ordenes}
            getOptionLabel={(o) => `${o.folio} — ${o.proveedor_nombre || "sin proveedor"}`}
            value={ordenSeleccionada}
            onChange={(_, value) => setOrdenSeleccionada(value)}
            renderInput={(params) => <TextField {...params} label="Orden de compra" />}
            sx={{ maxWidth: 480 }}
          />

          {ordenSeleccionada && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                {ordenSeleccionada.folio} — {ordenSeleccionada.proveedor_nombre || "sin proveedor"}
              </Typography>

              {lineasPendientes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Esta orden ya se recibió por completo.
                </Typography>
              ) : (
                <>
                  <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                    <TextField
                      label="Fecha"
                      type="date"
                      size="small"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label="Hora"
                      type="time"
                      size="small"
                      value={hora}
                      onChange={(e) => setHora(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Stack>
                  {/* Tabla normal en pantallas >= sm; en celular (xs) se
                  reemplaza por tarjetas apiladas (ver abajo) - 5 columnas +
                  un campo editable no caben comodas en un telefono, mismo
                  patron que tesoreria/flujos/page.tsx. */}
                  <Box sx={{ display: { xs: "none", sm: "block" } }}>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Descripción</TableCell>
                            <TableCell align="right">Pedido</TableCell>
                            <TableCell align="right">Recibido</TableCell>
                            <TableCell align="right">Pendiente</TableCell>
                            <TableCell align="right">Recibiendo ahora</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {lineasPendientes.map((l) => {
                            const pendiente = Number(l.cantidad) - Number(l.cantidad_recibida);
                            return (
                              <TableRow key={l.id_linea}>
                                <TableCell>{l.descripcion}</TableCell>
                                <TableCell align="right">{l.cantidad}</TableCell>
                                <TableCell align="right">{l.cantidad_recibida}</TableCell>
                                <TableCell align="right">{pendiente}</TableCell>
                                <TableCell align="right">
                                  <TextField
                                    size="small"
                                    variant="standard"
                                    value={cantidades[l.id_linea] || ""}
                                    onChange={(e) =>
                                      setCantidades((prev) => ({ ...prev, [l.id_linea]: e.target.value }))
                                    }
                                    sx={{ width: 90 }}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>

                  {/* Tarjetas apiladas - solo celular (xs), ver comentario
                  arriba. */}
                  <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" } }}>
                    {lineasPendientes.map((l) => {
                      const pendiente = Number(l.cantidad) - Number(l.cantidad_recibida);
                      return (
                        <Paper key={l.id_linea} variant="outlined" sx={{ p: 1.5 }}>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            {l.descripcion}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                            Pedido {l.cantidad} · recibido {l.cantidad_recibida} · pendiente {pendiente}
                          </Typography>
                          <TextField
                            label="Recibiendo ahora"
                            size="small"
                            value={cantidades[l.id_linea] || ""}
                            onChange={(e) => setCantidades((prev) => ({ ...prev, [l.id_linea]: e.target.value }))}
                            fullWidth
                          />
                        </Paper>
                      );
                    })}
                  </Stack>
                  {puedeCrear && (
                    <Button
                      sx={{ mt: 2 }}
                      variant="contained"
                      disabled={guardando}
                      onClick={handleRegistrar}
                    >
                      {guardando ? <CircularProgress size={20} /> : "Registrar recepción"}
                    </Button>
                  )}
                </>
              )}

              {recepciones.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                    Bitácora de entregas
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Hora</TableCell>
                        <TableCell>Recibido por</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recepciones.map((r) => (
                        <TableRow key={r.id_recepcion}>
                          <TableCell>{r.fecha}</TableCell>
                          <TableCell>{r.hora}</TableCell>
                          <TableCell>{r.recibido_por || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Paper>
          )}
        </Stack>
      )}
    </AppShell>
  );
}
