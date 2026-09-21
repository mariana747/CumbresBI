"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Link,
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
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Camera, ImagePlus, Truck } from "lucide-react";
import AppShell from "@/components/AppShell";
import EscanerDocumento from "@/components/EscanerDocumento";
import { SessionUser, getSession } from "@/lib/auth";
import {
  OrdenCompra,
  Recepcion,
  createRecepcion,
  listOrdenesCompra,
  listRecepciones,
  subirEvidenciaRecepcion,
} from "@/lib/compras";

type CantidadPorLinea = Record<string, string>;

// Fase 4B - Compras (02/Sep/2026). Registra lo que llegó de una orden -
// puede haber varias recepciones por orden (entregas parciales). El
// backend valida que no se reciba mas de lo que falta por linea (ver
// RecepcionViewSet.create en views.py).
export default function RecepcionesPage() {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
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
  // Evidencia fotografica (21/Sep/2026, "falta el componente de tomar
  // fotos") - mismo patron que MiCumbres > Tickets: la foto pasa por
  // EscanerDocumento antes de quedar lista para subir; se sube DESPUES de
  // registrar la recepcion (necesita su id_recepcion).
  const [evidencia, setEvidencia] = useState<File | null>(null);
  const [fotoParaEscanear, setFotoParaEscanear] = useState<File | null>(null);

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
      const nueva = await createRecepcion({ orden: ordenSeleccionada.id_orden, fecha, hora: `${hora}:00`, lineas });
      if (evidencia) {
        // Fail-open a proposito: si la subida a Drive falla, la recepcion
        // ya quedo registrada - no se pierde el trabajo de capturar
        // cantidades por un problema de red al subir la foto.
        try {
          await subirEvidenciaRecepcion(nueva.id_recepcion, evidencia);
        } catch (err) {
          setError(err instanceof Error ? `Recepción registrada, pero no se pudo subir la evidencia: ${err.message}` : "No se pudo subir la evidencia.");
        }
      }
      const [ordenesActualizadas, recepcionesActualizadas] = await Promise.all([
        listOrdenesCompra(),
        listRecepciones(ordenSeleccionada.id_orden),
      ]);
      const actualizada = ordenesActualizadas.find((o) => o.id_orden === ordenSeleccionada.id_orden) || null;
      setOrdenes(ordenesActualizadas.filter((o) => o.estado !== "RECIBIDA_TOTAL" && o.estado !== "CANCELADA"));
      setOrdenSeleccionada(actualizada);
      setRecepciones(recepcionesActualizadas);
      setCantidades({});
      setEvidencia(null);
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
                    <>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
                        {esMovil && (
                          <Button component="label" variant="outlined" startIcon={<Camera size={16} strokeWidth={1.5} />}>
                            Tomar foto
                            <input
                              type="file"
                              hidden
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                setFotoParaEscanear(f);
                                e.target.value = "";
                              }}
                            />
                          </Button>
                        )}
                        <Button component="label" variant="outlined" startIcon={<ImagePlus size={16} strokeWidth={1.5} />}>
                          Evidencia (opcional)
                          <input
                            type="file"
                            hidden
                            accept="image/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setFotoParaEscanear(f);
                              e.target.value = "";
                            }}
                          />
                        </Button>
                      </Stack>
                      {evidencia && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                          Evidencia lista: {evidencia.name}
                        </Typography>
                      )}
                      <Button
                        sx={{ mt: 2 }}
                        variant="contained"
                        disabled={guardando}
                        onClick={handleRegistrar}
                      >
                        {guardando ? <CircularProgress size={20} /> : "Registrar recepción"}
                      </Button>
                    </>
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
                        <TableCell>Evidencia</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recepciones.map((r) => (
                        <TableRow key={r.id_recepcion}>
                          <TableCell>{r.fecha}</TableCell>
                          <TableCell>{r.hora}</TableCell>
                          <TableCell>{r.recibido_por || "—"}</TableCell>
                          <TableCell>
                            {r.link_drive ? (
                              <Link href={r.link_drive} target="_blank" rel="noopener noreferrer">
                                Ver
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>
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

      <EscanerDocumento
        open={!!fotoParaEscanear}
        archivo={fotoParaEscanear}
        onCancelar={() => setFotoParaEscanear(null)}
        onConfirmar={(archivo) => {
          setEvidencia(archivo);
          setFotoParaEscanear(null);
        }}
      />
    </AppShell>
  );
}
