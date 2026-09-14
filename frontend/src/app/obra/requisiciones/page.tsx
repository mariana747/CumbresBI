"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { ClipboardList, Plus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import { Requisicion, RequisicionEstado, listRequisiciones } from "@/lib/materiales";

const ESTADO_LABELS: Record<RequisicionEstado, string> = {
  PENDIENTE: "Pendiente de autorización",
  AUTORIZADA: "Autorizada",
  RECHAZADA: "Rechazada",
};
const ESTADO_COLOR: Record<RequisicionEstado, "warning" | "success" | "error"> = {
  PENDIENTE: "warning",
  AUTORIZADA: "success",
  RECHAZADA: "error",
};

// Requisicion de materiales (21/Ago/2026, decision de Mariana: "en
// requisicion es donde se va a pedir material") - documento formal por
// proyecto+etapa que jala los ConceptoPresupuesto ya presupuestados y
// dispara la COMPRA. Distinta de "Salida de almacen" en /obra/materiales
// (esa es para pedir contra lo que ya hay). Diseno del documento sobre el
// mockup de Ruben aprobado 17/Ago/2026.
//
// El alta vive en /obra/requisiciones/nueva (21/Ago/2026, pedido de
// Mariana: "este debe ser editable, es la vista de nueva requisicion") -
// ya no es un dialogo simple, es el mismo documento oscuro pero con los
// campos editables y una vista previa en vivo de los conceptos.
export default function RequisicionesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [requisiciones, setRequisiciones] = useState<Requisicion[]>([]);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("materiales.crear") ?? false;

  useEffect(() => {
    setLoading(true);
    Promise.all([listRequisiciones(), listProyectos()])
      .then(([r, p]) => {
        setRequisiciones(r);
        setProyectos(p);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <ClipboardList size={22} strokeWidth={1.5} />
        <Typography variant="h5">Requisiciones de Materiales</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Documento formal por proyecto y etapa constructiva que jala los conceptos ya presupuestados y dispara
        la compra. Para pedir contra lo que ya hay en almacén, esa es{" "}
        <Typography component="a" href="/obra/materiales" sx={{ color: "primary.main" }}>
          Materiales — Salida de almacén
        </Typography>
        .
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
            <Typography variant="subtitle1">Requisiciones</Typography>
            {puedeCrear && (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={() => router.push("/obra/requisiciones/nueva")}
                sx={{ ml: "auto" }}
              >
                Nueva Requisición
              </Button>
            )}
          </Stack>
          {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza
          por tarjetas apiladas (ver abajo), mismo patron que tesoreria/
          flujos/page.tsx. */}
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Folio</TableCell>
                    <TableCell>Proyecto</TableCell>
                    <TableCell>Etapa constructiva</TableCell>
                    <TableCell align="right">Viviendas</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {requisiciones.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Sin requisiciones registradas.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    requisiciones.map((r) => (
                      <TableRow
                        key={r.id_requisicion}
                        hover
                        onClick={() => router.push(`/obra/requisiciones/${r.id_requisicion}`)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>{r.folio}</TableCell>
                        <TableCell>
                          {proyectos.find((p) => p.id_proyecto === r.proyecto)?.alias_proyecto || r.proyecto}
                        </TableCell>
                        <TableCell>{r.etapa_constructiva}</TableCell>
                        <TableCell align="right">{r.num_viviendas}</TableCell>
                        <TableCell>
                          <Chip size="small" label={ESTADO_LABELS[r.estado]} color={ESTADO_COLOR[r.estado]} />
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small">Ver</Button>
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
            {requisiciones.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                Sin requisiciones registradas.
              </Typography>
            ) : (
              requisiciones.map((r) => (
                <Paper
                  key={r.id_requisicion}
                  variant="outlined"
                  sx={{ p: 2, cursor: "pointer" }}
                  onClick={() => router.push(`/obra/requisiciones/${r.id_requisicion}`)}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2">{r.folio}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {proyectos.find((p) => p.id_proyecto === r.proyecto)?.alias_proyecto || r.proyecto}
                      </Typography>
                    </Stack>
                    <Chip size="small" label={ESTADO_LABELS[r.estado]} color={ESTADO_COLOR[r.estado]} sx={{ flexShrink: 0 }} />
                  </Stack>
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Etapa:</strong> {r.etapa_constructiva}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Viviendas:</strong> {r.num_viviendas}
                    </Typography>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        </Paper>
      )}
    </AppShell>
  );
}
