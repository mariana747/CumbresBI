"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
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
  Typography,
} from "@mui/material";
import { FileText } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { OrdenCompra, cerrarOrdenConFaltante, listOrdenesCompra } from "@/lib/compras";

const ESTADO_LABELS: Record<OrdenCompra["estado"], string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada al proveedor",
  RECIBIDA_PARCIAL: "Recibida parcial",
  RECIBIDA_TOTAL: "Recibida total",
  CANCELADA: "Cancelada",
  CERRADA_CON_FALTANTE: "Cerrada con faltante",
};
const ESTADO_COLOR: Record<OrdenCompra["estado"], "default" | "warning" | "info" | "success" | "error"> = {
  BORRADOR: "default",
  ENVIADA: "info",
  RECIBIDA_PARCIAL: "warning",
  RECIBIDA_TOTAL: "success",
  CANCELADA: "error",
  CERRADA_CON_FALTANTE: "error",
};

// Fase 4B - Compras (02/Sep/2026). Solo lectura - una orden nace completa
// de OrdenCompraViewSet.generar_desde_cotizacion, no se captura a mano
// (ver views.py). Para registrar lo que llegó, ver /compras/recepciones.
function OrdenesPageInner() {
  const searchParams = useSearchParams();
  const ordenResaltada = searchParams.get("orden") || undefined;

  const [session, setSession] = useState<SessionUser | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(ordenResaltada || null);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<OrdenCompra["estado"] | "">("");
  const [cerrando, setCerrando] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeAprobar = session?.perm_keys.includes("compras.aprobar") ?? false;

  function recargar() {
    setLoading(true);
    listOrdenesCompra({ search: search || undefined, estado: filtroEstado || undefined })
      .then(setOrdenes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(recargar, [search, filtroEstado]);

  async function handleCerrarConFaltante(idOrden: string) {
    setCerrando(idOrden);
    setError(null);
    try {
      await cerrarOrdenConFaltante(idOrden);
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCerrando(null);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileText size={22} strokeWidth={1.5} />
        <Typography variant="h5">Órdenes de Compra</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Generadas desde la cotización ganadora de cada solicitud. Para registrar lo que llegó de una orden, ve a
        Recepciones.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <FiltrosBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por folio o proveedor...">
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="filtro-estado-orden-label">Filtrar por estado</InputLabel>
          <Select
            labelId="filtro-estado-orden-label"
            label="Filtrar por estado"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as OrdenCompra["estado"] | "")}
          >
            <MenuItem value="">
              <em>Todos los estados</em>
            </MenuItem>
            {Object.entries(ESTADO_LABELS).map(([valor, label]) => (
              <MenuItem key={valor} value={valor}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FiltrosBar>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : (
        <Paper variant="outlined">
          {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza
          por tarjetas apiladas (ver abajo) - mismo patron que
          tesoreria/flujos/page.tsx. */}
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Folio</TableCell>
                    <TableCell>Proyecto</TableCell>
                    <TableCell>Proveedor</TableCell>
                    <TableCell align="right">Monto total</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ordenes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Sin órdenes generadas todavía.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    ordenes.map((o) => (
                      <Fragment key={o.id_orden}>
                        <TableRow
                          hover
                          selected={o.id_orden === ordenResaltada}
                          onClick={() => setExpandido(expandido === o.id_orden ? null : o.id_orden)}
                          sx={{ cursor: "pointer" }}
                        >
                          <TableCell>{o.folio}</TableCell>
                          <TableCell>{o.proyecto}</TableCell>
                          <TableCell>{o.proveedor_nombre || "—"}</TableCell>
                          <TableCell align="right">{o.monto_total}</TableCell>
                          <TableCell>
                            <Chip size="small" label={ESTADO_LABELS[o.estado]} color={ESTADO_COLOR[o.estado]} />
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={5} sx={{ p: 0, border: 0 }}>
                            <Collapse in={expandido === o.id_orden}>
                              <Table size="small" sx={{ bgcolor: "action.hover" }}>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Descripción</TableCell>
                                    <TableCell align="right">Cantidad</TableCell>
                                    <TableCell align="right">Recibido</TableCell>
                                    <TableCell align="right">Precio unitario</TableCell>
                                    <TableCell align="right">Importe</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {o.lineas.map((l) => (
                                    <TableRow key={l.id_linea}>
                                      <TableCell>{l.descripcion}</TableCell>
                                      <TableCell align="right">{l.cantidad}</TableCell>
                                      <TableCell align="right">{l.cantidad_recibida}</TableCell>
                                      <TableCell align="right">{l.precio_unitario}</TableCell>
                                      <TableCell align="right">{l.importe}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {puedeAprobar && o.estado === "RECIBIDA_PARCIAL" && (
                                <Box sx={{ p: 1 }}>
                                  <Button
                                    size="small"
                                    color="error"
                                    disabled={cerrando === o.id_orden}
                                    onClick={(e) => { e.stopPropagation(); handleCerrarConFaltante(o.id_orden); }}
                                  >
                                    {cerrando === o.id_orden ? "Cerrando…" : "Cerrar con faltante"}
                                  </Button>
                                </Box>
                              )}
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba.
          Cada tarjeta se expande in-place igual que la fila de tabla. */}
          <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
            {ordenes.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                Sin órdenes generadas todavía.
              </Typography>
            ) : (
              ordenes.map((o) => (
                <Paper
                  key={o.id_orden}
                  variant={o.id_orden === ordenResaltada ? "elevation" : "outlined"}
                  sx={{ p: 2, cursor: "pointer" }}
                  onClick={() => setExpandido(expandido === o.id_orden ? null : o.id_orden)}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2">{o.folio}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {o.proveedor_nombre || "—"}
                      </Typography>
                    </Stack>
                    <Chip size="small" label={ESTADO_LABELS[o.estado]} color={ESTADO_COLOR[o.estado]} sx={{ flexShrink: 0 }} />
                  </Stack>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Proyecto:</strong> {o.proyecto}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Monto total:</strong> {o.monto_total}
                    </Typography>
                  </Stack>
                  <Collapse in={expandido === o.id_orden}>
                    <Stack spacing={1} sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                      {o.lineas.map((l) => (
                        <Stack key={l.id_linea} spacing={0.25}>
                          <Typography variant="body2">{l.descripcion}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {l.cantidad_recibida}/{l.cantidad} recibido · {l.precio_unitario} c/u · importe{" "}
                            {l.importe}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                    {puedeAprobar && o.estado === "RECIBIDA_PARCIAL" && (
                      <Button
                        size="small"
                        color="error"
                        disabled={cerrando === o.id_orden}
                        onClick={(e) => { e.stopPropagation(); handleCerrarConFaltante(o.id_orden); }}
                        sx={{ mt: 1 }}
                      >
                        {cerrando === o.id_orden ? "Cerrando…" : "Cerrar con faltante"}
                      </Button>
                    )}
                  </Collapse>
                </Paper>
              ))
            )}
          </Stack>
        </Paper>
      )}
    </AppShell>
  );
}

export default function OrdenesPage() {
  return (
    <Suspense fallback={null}>
      <OrdenesPageInner />
    </Suspense>
  );
}
