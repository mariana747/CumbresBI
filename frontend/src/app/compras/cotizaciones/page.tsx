"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
import { FileSearch, Plus, Sparkles, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import ContraparteSelector from "@/components/ContraparteSelector";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { SessionUser, getSession } from "@/lib/auth";
import { TesoreriaContraparte } from "@/lib/tesoreria";
import {
  Cotizacion,
  confirmarExtraccionCotizacion,
  createCotizacion,
  generarOrdenDesdeCotizacion,
  listCotizaciones,
} from "@/lib/compras";

const ESTADO_LABELS: Record<Cotizacion["estado"], string> = {
  PENDIENTE_REVISION: "Pendiente de revisión",
  CONFIRMADA: "Confirmada",
  GANADORA: "Ganadora",
  DESCARTADA: "Descartada",
};
const ESTADO_COLOR: Record<Cotizacion["estado"], "default" | "warning" | "success" | "error"> = {
  PENDIENTE_REVISION: "warning",
  CONFIRMADA: "default",
  GANADORA: "success",
  DESCARTADA: "error",
};

// Whitelist de campos que confirmar_extraccion acepta - espejo de
// CotizacionViewSet.CAMPOS_CONFIRMABLES en views.py.
const CAMPOS_CONFIRMABLES = [
  "proveedor_nombre",
  "fecha_cotizacion",
  "vigencia_dias",
  "moneda",
  "subtotal",
  "iva",
  "total",
  "link_drive",
  "comentarios",
] as const;

type LineaForm = { descripcion: string; cantidad: string; precio_unitario: string; importe: string };

function CotizacionesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const solicitudId = searchParams.get("solicitud") || undefined;

  const [session, setSession] = useState<SessionUser | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [proveedor, setProveedor] = useState<TesoreriaContraparte | null>(null);
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [motorCotizacion, setMotorCotizacion] = useState<Cotizacion | null>(null);
  const [lineasCotizacion, setLineasCotizacion] = useState<Record<string, LineaForm[]>>({});

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("compras.crear") ?? false;
  const puedeAprobar = session?.perm_keys.includes("compras.aprobar") ?? false;

  function recargar() {
    setLoading(true);
    listCotizaciones(solicitudId)
      .then((data) => {
        setCotizaciones(data);
        const inicial: Record<string, LineaForm[]> = {};
        for (const c of data) {
          inicial[c.id_cotizacion] = c.lineas.length
            ? c.lineas.map((l) => ({
                descripcion: l.descripcion,
                cantidad: l.cantidad,
                precio_unitario: l.precio_unitario,
                importe: l.importe,
              }))
            : [{ descripcion: "", cantidad: "", precio_unitario: "", importe: "" }];
        }
        setLineasCotizacion(inicial);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(recargar, [solicitudId]);

  async function handleCrear() {
    if (!solicitudId) return;
    setGuardando(true);
    setError(null);
    try {
      await createCotizacion({
        solicitud: solicitudId,
        proveedor: proveedor?.id_contraparte,
        proveedorNombre: proveedor?.razon_social || proveedorNombre,
      });
      setDialogOpen(false);
      setProveedor(null);
      setProveedorNombre("");
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGuardando(false);
    }
  }

  function actualizarLinea(idCotizacion: string, index: number, campo: keyof LineaForm, valor: string) {
    setLineasCotizacion((prev) => {
      const lineas = [...(prev[idCotizacion] || [])];
      lineas[index] = { ...lineas[index], [campo]: valor };
      return { ...prev, [idCotizacion]: lineas };
    });
  }

  function agregarLinea(idCotizacion: string) {
    setLineasCotizacion((prev) => ({
      ...prev,
      [idCotizacion]: [...(prev[idCotizacion] || []), { descripcion: "", cantidad: "", precio_unitario: "", importe: "" }],
    }));
  }

  function quitarLinea(idCotizacion: string, index: number) {
    setLineasCotizacion((prev) => ({
      ...prev,
      [idCotizacion]: (prev[idCotizacion] || []).filter((_, i) => i !== index),
    }));
  }

  async function handleGuardarLineas(idCotizacion: string) {
    const lineas = (lineasCotizacion[idCotizacion] || []).filter((l) => l.descripcion.trim() !== "");
    try {
      await confirmarExtraccionCotizacion(idCotizacion, { lineas });
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleGenerarOrden(idCotizacion: string) {
    try {
      const orden = await generarOrdenDesdeCotizacion(idCotizacion);
      router.push(`/compras/ordenes?orden=${orden.id_orden}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileSearch size={22} strokeWidth={1.5} />
        <Typography variant="h5">Cotizaciones</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {solicitudId
          ? `Cotizaciones de la solicitud ${solicitudId}. "Analizar con IA" reusa el Motor Documental (prompt `
          : "Todas las cotizaciones registradas. Entra desde una solicitud (Solicitudes de compra) para filtrar por una en particular."}
        {solicitudId && <code>compras.cotizacion</code>}
        {solicitudId && ") para leer el documento que subió el proveedor y proponer los campos."}
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
        <Stack spacing={2}>
          {solicitudId && puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={() => setDialogOpen(true)}
              sx={{ alignSelf: "flex-start" }}
            >
              Nueva cotización
            </Button>
          )}

          {cotizaciones.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Sin cotizaciones registradas.
              </Typography>
            </Paper>
          )}

          {cotizaciones.map((c) => (
            <Paper key={c.id_cotizacion} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                <Typography variant="subtitle1">{c.proveedor_nombre || "(sin proveedor)"}</Typography>
                <Chip size="small" label={ESTADO_LABELS[c.estado]} color={ESTADO_COLOR[c.estado]} />
                <Typography variant="body2" color="text.secondary">
                  {c.moneda || "MXN"} {c.total || "—"}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
                  <Button
                    size="small"
                    startIcon={<Sparkles size={14} strokeWidth={2} />}
                    onClick={() => setMotorCotizacion(c)}
                  >
                    Analizar con IA
                  </Button>
                  {puedeAprobar && c.estado !== "GANADORA" && c.estado !== "DESCARTADA" && (
                    <Button size="small" variant="contained" onClick={() => handleGenerarOrden(c.id_cotizacion)}>
                      Generar orden
                    </Button>
                  )}
                </Stack>
              </Stack>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Descripción</TableCell>
                      <TableCell align="right">Cantidad</TableCell>
                      <TableCell align="right">Precio unitario</TableCell>
                      <TableCell align="right">Importe</TableCell>
                      <TableCell align="right"></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(lineasCotizacion[c.id_cotizacion] || []).map((linea, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <TextField
                            size="small"
                            variant="standard"
                            value={linea.descripcion}
                            onChange={(e) => actualizarLinea(c.id_cotizacion, index, "descripcion", e.target.value)}
                            fullWidth
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            variant="standard"
                            value={linea.cantidad}
                            onChange={(e) => actualizarLinea(c.id_cotizacion, index, "cantidad", e.target.value)}
                            sx={{ width: 80 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            variant="standard"
                            value={linea.precio_unitario}
                            onChange={(e) => actualizarLinea(c.id_cotizacion, index, "precio_unitario", e.target.value)}
                            sx={{ width: 100 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            variant="standard"
                            value={linea.importe}
                            onChange={(e) => actualizarLinea(c.id_cotizacion, index, "importe", e.target.value)}
                            sx={{ width: 100 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => quitarLinea(c.id_cotizacion, index)}>
                            <Trash2 size={14} strokeWidth={2} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button size="small" onClick={() => agregarLinea(c.id_cotizacion)}>
                  + Línea
                </Button>
                <Button size="small" variant="outlined" onClick={() => handleGuardarLineas(c.id_cotizacion)}>
                  Guardar líneas
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nueva cotización</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <ContraparteSelector
              value={proveedor}
              onChange={setProveedor}
              label="Proveedor (catálogo)"
              tipo="proveedor"
            />
            <TextField
              label="O nombre del proveedor (si aún no está en el catálogo)"
              value={proveedorNombre}
              onChange={(e) => setProveedorNombre(e.target.value)}
              disabled={!!proveedor}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={guardando} onClick={handleCrear}>
            {guardando ? <CircularProgress size={20} /> : "Crear"}
          </Button>
        </DialogActions>
      </Dialog>

      <MotorDocumentalDialog
        open={!!motorCotizacion}
        onClose={() => {
          setMotorCotizacion(null);
          recargar();
        }}
        contexto={
          motorCotizacion
            ? {
                etiqueta: `cotización de ${motorCotizacion.proveedor_nombre || motorCotizacion.id_cotizacion}`,
                servicioSolicitante: "compras-tesoreria-service",
                carpeta: `Compras/Cotizaciones/${motorCotizacion.id_cotizacion}`,
                permKey: "compras.aprobar",
                expectedDocumentType: "compras.cotizacion",
                camposConfirmables: CAMPOS_CONFIRMABLES,
                onConfirmar: async (campos) => {
                  await confirmarExtraccionCotizacion(motorCotizacion.id_cotizacion, { campos });
                },
              }
            : undefined
        }
      />
    </AppShell>
  );
}

export default function CotizacionesPage() {
  return (
    <Suspense fallback={null}>
      <CotizacionesPageInner />
    </Suspense>
  );
}
