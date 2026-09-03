"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Paper,
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
import { OrdenCompra, listOrdenesCompra } from "@/lib/compras";

const ESTADO_LABELS: Record<OrdenCompra["estado"], string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada al proveedor",
  RECIBIDA_PARCIAL: "Recibida parcial",
  RECIBIDA_TOTAL: "Recibida total",
  CANCELADA: "Cancelada",
};
const ESTADO_COLOR: Record<OrdenCompra["estado"], "default" | "warning" | "info" | "success" | "error"> = {
  BORRADOR: "default",
  ENVIADA: "info",
  RECIBIDA_PARCIAL: "warning",
  RECIBIDA_TOTAL: "success",
  CANCELADA: "error",
};

// Fase 4B - Compras (02/Sep/2026). Solo lectura - una orden nace completa
// de OrdenCompraViewSet.generar_desde_cotizacion, no se captura a mano
// (ver views.py). Para registrar lo que llegó, ver /compras/recepciones.
function OrdenesPageInner() {
  const searchParams = useSearchParams();
  const ordenResaltada = searchParams.get("orden") || undefined;

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(ordenResaltada || null);

  useEffect(() => {
    setLoading(true);
    listOrdenesCompra()
      .then(setOrdenes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileText size={22} strokeWidth={1.5} />
        <Typography variant="h5">Órdenes de compra</Typography>
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
