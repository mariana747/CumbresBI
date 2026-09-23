"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { alpha } from "@mui/material/styles";
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  TablePagination,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { FileSearch, Plus, Scale, Sparkles, Trash2, X as CloseIcon } from "lucide-react";
import ContraparteSelector from "@/components/ContraparteSelector";
import FiltrosBar from "@/components/FiltrosBar";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { SessionUser, getSession } from "@/lib/auth";
import { TesoreriaContraparte } from "@/lib/tesoreria";
import {
  Cotizacion,
  confirmarExtraccionCotizacion,
  createCotizacion,
  generarOrdenDesdeCotizacion,
  listCotizaciones,
  reagendarCotizacion,
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

// "las cotizaciones duran una semana" (22/Sep/2026) - espejo del bloqueo
// real en OrdenCompraViewSet.generar_desde_cotizacion (backend); esto solo
// evita el clic inútil, el backend es quien de verdad lo impide.
function estaVencida(c: Cotizacion): boolean {
  if (!c.fecha_cotizacion || !c.vigencia_dias) return false;
  const vence = new Date(c.fecha_cotizacion);
  vence.setDate(vence.getDate() + c.vigencia_dias);
  return new Date() > vence;
}

// Whitelist de campos que confirmar_extraccion acepta - espejo de
// CotizacionViewSet.CAMPOS_CONFIRMABLES en views.py.
const CAMPOS_CONFIRMABLES = [
  "proveedor_nombre",
  "proveedor_rfc",
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

type CeldaComparacion = { cantidad: number; precioUnitario: number; importe: number } | null;

/** Arma la matriz de comparación: una fila por descripción de material
 * (agrupada por texto normalizado para alinear la misma partida entre
 * proveedores), una columna por cotización activa (no descartada), con
 * cantidad/precio unitario/importe de cada una (22/Sep/2026, antes solo
 * mostraba precio unitario). Solo informativa - no cambia el modelo ni
 * pre-selecciona nada, ver memoria "auditoria-compras-automatizacion-cotizaciones". */
function armarFilasComparacion(cotizaciones: Cotizacion[]) {
  const descripciones: string[] = [];
  const vistos = new Set<string>();
  for (const c of cotizaciones) {
    for (const linea of c.lineas) {
      const clave = linea.descripcion.trim().toLowerCase();
      if (clave && !vistos.has(clave)) {
        vistos.add(clave);
        descripciones.push(linea.descripcion.trim());
      }
    }
  }
  return descripciones.map((descripcion) => ({
    descripcion,
    porCotizacion: cotizaciones.map((c): CeldaComparacion => {
      const linea = c.lineas.find((l) => l.descripcion.trim().toLowerCase() === descripcion.toLowerCase());
      return linea
        ? { cantidad: Number(linea.cantidad), precioUnitario: Number(linea.precio_unitario), importe: Number(linea.importe) }
        : null;
    }),
  }));
}

function menorValor(valores: Array<number | null>): number | null {
  const validos = valores.filter((v): v is number => v !== null && !Number.isNaN(v));
  return validos.length ? Math.min(...validos) : null;
}

function formatoMoneda(valor: number): string {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

// Extraido de compras/cotizaciones/page.tsx (21/Sep/2026, "que sean en una
// pagina lateral" desde Solicitud de Compra) - mismo contenido, reusado
// tanto en la pagina completa (/compras/cotizaciones) como en el Drawer
// que abre SolicitudesCompraPage. `mostrarEncabezado` oculta el
// titulo/descripcion cuando ya lo da el contenedor (ej. el Drawer).
export default function CotizacionesPanel({
  solicitudId,
  mostrarEncabezado = false,
  soloLectura = false,
}: {
  solicitudId?: string;
  mostrarEncabezado?: boolean;
  /** Vista de solo lectura (21/Sep/2026, panel lateral desde Solicitudes) -
  oculta Nueva Cotizacion, Analizar con IA, editar/agregar/quitar lineas,
  Guardar lineas y Generar orden. Solo se puede consultar. */
  soloLectura?: boolean;
}) {
  const router = useRouter();

  const [session, setSession] = useState<SessionUser | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<Cotizacion["estado"] | "">("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [proveedor, setProveedor] = useState<TesoreriaContraparte | null>(null);
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Comparar cotizaciones (22/Sep/2026) - ya no se agrupa/muestra sola por
  // solicitud (antes con 2+ cotizaciones activas en la misma solicitud
  // aparecia automatico); ahora es un boton manual que abre una ventana
  // emergente donde el usuario elige cuales cotizaciones comparar, de
  // cualquier solicitud.
  const [compararOpen, setCompararOpen] = useState(false);
  const [seleccionadasComparar, setSeleccionadasComparar] = useState<Set<string>>(new Set());

  const [motorCotizacion, setMotorCotizacion] = useState<Cotizacion | null>(null);
  const [lineasCotizacion, setLineasCotizacion] = useState<Record<string, LineaForm[]>>({});

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = (session?.perm_keys.includes("compras.crear") ?? false) && !soloLectura;
  const puedeAprobar = (session?.perm_keys.includes("compras.aprobar") ?? false) && !soloLectura;
  // Editar/agregar/quitar lineas y "Guardar lineas" ahora exigen
  // puedeAprobar, no solo !soloLectura (22/Sep/2026, bug real: un usuario
  // sin compras.aprobar - ej. Compliance Officer con acceso de solo
  // consulta - llega a /compras/cotizaciones (soloLectura siempre false
  // ahi, es la pantalla completa) y veia los botones de editar/borrar
  // lineas aunque no tuviera permiso para usarlos). puedeAprobar y no
  // puedeCrear porque "Guardar lineas" llama confirmar_extraccion, que en
  // el backend exige compras.aprobar (CotizacionViewSet.get_permissions),
  // el mismo endpoint que usa la confirmacion del Motor Documental.

  function recargar() {
    setLoading(true);
    listCotizaciones({ solicitud: solicitudId, search: search || undefined, estado: filtroEstado || undefined })
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

  useEffect(recargar, [solicitudId, search, filtroEstado]);

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

  // Reagendar (22/Sep/2026, "no se bloquea, se debe reagendar, se debe
  // volver a pedir") - la vencida queda DESCARTADA en el backend, la
  // nueva nace vacia (sin lineas/precio) y se abre de una vez el Motor
  // Documental para subir el documento de cotizacion nuevo.
  async function handleReagendar(idCotizacion: string) {
    try {
      const nueva = await reagendarCotizacion(idCotizacion);
      recargar();
      setMotorCotizacion(nueva);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  // Cotizaciones elegibles para comparar (activas) - de cualquier
  // solicitud, el usuario elige cuales dentro de la ventana emergente.
  const cotizacionesComparables = cotizaciones.filter((c) => c.estado !== "DESCARTADA");
  const cotizacionesSeleccionadas = cotizacionesComparables.filter((c) => seleccionadasComparar.has(c.id_cotizacion));

  function toggleSeleccionComparar(idCotizacion: string) {
    setSeleccionadasComparar((prev) => {
      const next = new Set(prev);
      if (next.has(idCotizacion)) next.delete(idCotizacion);
      else next.add(idCotizacion);
      return next;
    });
  }

  function cerrarComparar() {
    setCompararOpen(false);
    setSeleccionadasComparar(new Set());
  }

  return (
    <Box>
      {mostrarEncabezado && (
        <>
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
        </>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!soloLectura && (
        <FiltrosBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por proveedor..."
          actions={
            // wrap en tablet/angosto (22/Sep/2026) - con Nueva Cotizacion +
            // Comparar cotizaciones juntos, la fila fija de FiltrosBar
            // (flexShrink: 0) se salia del ancho en tablet; envueltos en su
            // propio Stack con flexWrap se acomodan en 2 lineas antes de
            // desbordar.
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {solicitudId && puedeCrear && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={() => setDialogOpen(true)}
                >
                  Nueva Cotización
                </Button>
              )}
              {cotizacionesComparables.length >= 2 && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Scale size={14} strokeWidth={2} />}
                  onClick={() => setCompararOpen(true)}
                >
                  Comparar cotizaciones
                </Button>
              )}
            </Stack>
          }
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="filtro-estado-cotizacion-label">Filtrar por estado</InputLabel>
            <Select
              labelId="filtro-estado-cotizacion-label"
              label="Filtrar por estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as Cotizacion["estado"] | "")}
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
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : (
        <Stack spacing={2}>
          {cotizaciones.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Sin cotizaciones registradas.
              </Typography>
            </Paper>
          )}

          {cotizaciones.map((c) => (
            <Paper key={c.id_cotizacion} variant="outlined" sx={{ p: 2 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                alignItems={{ xs: "stretch", sm: "center" }}
                spacing={2}
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle1">{c.proveedor_nombre || "(sin proveedor)"}</Typography>
                <Chip size="small" label={ESTADO_LABELS[c.estado]} color={ESTADO_COLOR[c.estado]} sx={{ alignSelf: "flex-start" }} />
                {estaVencida(c) && c.estado !== "GANADORA" && c.estado !== "DESCARTADA" && (
                  <Chip size="small" label="Vencida" color="error" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                )}
                <Typography variant="body2" color="text.secondary">
                  {c.moneda || "MXN"} {c.total || "—"}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ ml: { xs: 0, sm: "auto" } }}>
                  {!soloLectura && (
                    <Button
                      size="small"
                      startIcon={<Sparkles size={14} strokeWidth={2} />}
                      onClick={() => setMotorCotizacion(c)}
                    >
                      Analizar con IA
                    </Button>
                  )}
                  {puedeAprobar && c.estado !== "GANADORA" && c.estado !== "DESCARTADA" && (
                    <Button
                      size="small"
                      variant="contained"
                      disabled={estaVencida(c)}
                      title={estaVencida(c) ? "Esta cotización ya venció" : undefined}
                      onClick={() => handleGenerarOrden(c.id_cotizacion)}
                    >
                      Generar orden
                    </Button>
                  )}
                  {puedeAprobar && estaVencida(c) && c.estado !== "GANADORA" && c.estado !== "DESCARTADA" && (
                    <Button size="small" variant="outlined" color="warning" onClick={() => handleReagendar(c.id_cotizacion)}>
                      Reagendar
                    </Button>
                  )}
                </Stack>
              </Stack>

              {/* Tabla normal en pantallas >= sm; en celular (xs) se
              reemplaza por tarjetas con los mismos campos apilados - una
              fila con 4 inputs no cabe comoda en un telefono, mismo patron
              que tesoreria/flujos/page.tsx. */}
              <Box sx={{ display: { xs: "none", sm: "block" } }}>
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
                              disabled={!puedeAprobar}
                              fullWidth
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              variant="standard"
                              value={linea.cantidad}
                              onChange={(e) => actualizarLinea(c.id_cotizacion, index, "cantidad", e.target.value)}
                              disabled={!puedeAprobar}
                              sx={{ width: 80 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              variant="standard"
                              value={linea.precio_unitario}
                              onChange={(e) =>
                                actualizarLinea(c.id_cotizacion, index, "precio_unitario", e.target.value)
                              }
                              disabled={!puedeAprobar}
                              sx={{ width: 100 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              size="small"
                              variant="standard"
                              value={linea.importe}
                              onChange={(e) => actualizarLinea(c.id_cotizacion, index, "importe", e.target.value)}
                              disabled={!puedeAprobar}
                              sx={{ width: 100 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {puedeAprobar && (
                              <IconButton size="small" onClick={() => quitarLinea(c.id_cotizacion, index)}>
                                <Trash2 size={14} strokeWidth={2} />
                              </IconButton>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {/* Tarjetas apiladas - solo celular (xs), ver comentario
              arriba. */}
              <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" } }}>
                {(lineasCotizacion[c.id_cotizacion] || []).map((linea, index) => (
                  <Paper key={index} variant="outlined" sx={{ p: 1.5 }}>
                    {puedeAprobar && (
                      <Stack direction="row" justifyContent="flex-end">
                        <IconButton size="small" onClick={() => quitarLinea(c.id_cotizacion, index)}>
                          <Trash2 size={14} strokeWidth={2} />
                        </IconButton>
                      </Stack>
                    )}
                    <Stack spacing={1}>
                      <TextField
                        label="Descripción"
                        size="small"
                        value={linea.descripcion}
                        onChange={(e) => actualizarLinea(c.id_cotizacion, index, "descripcion", e.target.value)}
                        disabled={!puedeAprobar}
                        fullWidth
                      />
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label="Cantidad"
                          size="small"
                          value={linea.cantidad}
                          onChange={(e) => actualizarLinea(c.id_cotizacion, index, "cantidad", e.target.value)}
                          disabled={!puedeAprobar}
                          fullWidth
                        />
                        <TextField
                          label="Precio unitario"
                          size="small"
                          value={linea.precio_unitario}
                          onChange={(e) =>
                            actualizarLinea(c.id_cotizacion, index, "precio_unitario", e.target.value)
                          }
                          disabled={!puedeAprobar}
                          fullWidth
                        />
                      </Stack>
                      <TextField
                        label="Importe"
                        size="small"
                        value={linea.importe}
                        onChange={(e) => actualizarLinea(c.id_cotizacion, index, "importe", e.target.value)}
                        disabled={!puedeAprobar}
                        fullWidth
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              {puedeAprobar && (
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button size="small" onClick={() => agregarLinea(c.id_cotizacion)}>
                    + Línea
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => handleGuardarLineas(c.id_cotizacion)}>
                    Guardar líneas
                  </Button>
                </Stack>
              )}
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nueva Cotización</DialogTitle>
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

      <Dialog
        open={compararOpen}
        onClose={(_, reason) => {
          // Solo se cierra con el boton X (mismo criterio que
          // PanelReferenciaCruzada - "las pantallas flotantes deben tener
          // esto de solo cerrar con la x").
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          cerrarComparar();
        }}
        fullWidth
        maxWidth="lg"
        // Dialog mas ancho que el tope global de 900px del tema (22/Sep/2026,
        // "haz la pestaña emergente mas grande") - con 3+ proveedores de 3
        // columnas cada uno, 900px se quedaba corto y forzaba mucho scroll
        // horizontal. Solo esta ventana lo necesita, no se toca el tema.
        sx={{ "& .MuiDialog-paper": { maxWidth: "1400px" } }}
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <span>Comparar cotizaciones</span>
            <IconButton size="small" aria-label="Cerrar" onClick={cerrarComparar}>
              <CloseIcon size={18} strokeWidth={1.5} />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Elige 2 o más cotizaciones (de cualquier solicitud) para compararlas lado a lado.
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(220px, 1fr))" },
              gap: 1.5,
              mb: 3,
            }}
          >
            {cotizacionesComparables.map((c) => {
              const seleccionada = seleccionadasComparar.has(c.id_cotizacion);
              return (
                <Paper
                  key={c.id_cotizacion}
                  variant="outlined"
                  onClick={() => toggleSeleccionComparar(c.id_cotizacion)}
                  sx={{
                    p: 1.5,
                    cursor: "pointer",
                    borderColor: seleccionada ? "success.main" : undefined,
                    borderWidth: seleccionada ? 2 : 1,
                    bgcolor: seleccionada ? "rgba(46, 125, 50, 0.08)" : undefined,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Checkbox size="small" checked={seleccionada} sx={{ p: 0, mt: 0.25 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>
                        {c.proveedor_nombre || "(sin proveedor)"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Solicitud {c.solicitud}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ mt: 0.5 }}>
                        {c.moneda || "MXN"} {c.total ? formatoMoneda(Number(c.total)).replace(/^\D+/, "") : "—"}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              );
            })}
          </Box>
          {cotizacionesSeleccionadas.length >= 2 ? (
            <ComparacionCotizaciones
              cotizaciones={cotizacionesSeleccionadas}
              puedeAprobar={puedeAprobar}
              onSeleccionar={(idCotizacion) => {
                cerrarComparar();
                handleGenerarOrden(idCotizacion);
              }}
            />
          ) : (
            <Alert severity="info">Selecciona al menos 2 cotizaciones para ver la comparación.</Alert>
          )}
        </DialogContent>
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
    </Box>
  );
}

/** Tabla comparativa de precio unitario por línea + total, entre todas las
 * cotizaciones activas de la solicitud actual. Solo informativa (resalta
 * el menor precio en verde); la selección real sigue siendo
 * generar_desde_cotizacion, ahora disparada desde aquí en vez de tener que
 * abrir cada tarjeta por separado. */
function ComparacionCotizaciones({
  cotizaciones: cotizacionesOriginal,
  puedeAprobar,
  onSeleccionar,
}: {
  cotizaciones: Cotizacion[];
  puedeAprobar: boolean;
  onSeleccionar: (idCotizacion: string) => void;
}) {
  const [pagina, setPagina] = useState(0);
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const esTablet = useMediaQuery(theme.breakpoints.down("md"));
  // Menos columnas de proveedor por pagina en pantallas angostas
  // (22/Sep/2026, ventana emergente de Comparar cotizaciones tambien se
  // abre en tablet) - con 4 columnas fijas la tabla se apretaba/forzaba
  // scroll horizontal incomodo en tablet, y en movil directo se salia.
  const proveedoresPorPagina = esMovil ? 1 : esTablet ? 2 : 4;

  // Orden alfabetico por proveedor (21/Sep/2026, "que tal si se tienen mas"
  // de 3) - antes dependia del orden de creacion de la cotizacion.
  const cotizacionesOrdenadas = [...cotizacionesOriginal].sort((a, b) =>
    (a.proveedor_nombre || "").localeCompare(b.proveedor_nombre || "", "es"),
  );

  // El "menor" (por fila y total) y la sugerencia de ganador se calculan
  // sobre TODAS las cotizaciones, no solo la pagina visible - paginar las
  // columnas no debe cambiar cual es la mas barata.
  const filasGlobal = armarFilasComparacion(cotizacionesOrdenadas);
  const totalesGlobal = cotizacionesOrdenadas.map((c) => (c.total ? Number(c.total) : null));
  const menorTotalGlobal = menorValor(totalesGlobal);
  // Sugerencia de ganador (21/Sep/2026, "hay que hacer la parte donde
  // sugiere ganador, esto no significa que lo decida") - solo resalta la
  // cotizacion de menor total como sugerida; generar_desde_cotizacion
  // sigue exigiendo el clic humano en "Usar esta", nunca se preselecciona
  // ni se marca GANADORA sola. Si dos cotizaciones empatan en el menor
  // total, no se sugiere ninguna (ambigua a proposito).
  const indicesConMenorTotalGlobal = totalesGlobal
    .map((t, i) => (t !== null && t === menorTotalGlobal ? i : -1))
    .filter((i) => i >= 0);
  const indiceSugeridoGlobal = indicesConMenorTotalGlobal.length === 1 ? indicesConMenorTotalGlobal[0] : -1;

  const inicio = pagina * proveedoresPorPagina;
  const cotizaciones = cotizacionesOrdenadas.slice(inicio, inicio + proveedoresPorPagina);
  const filas = filasGlobal.map((fila) => ({
    descripcion: fila.descripcion,
    menorPrecio: menorValor(fila.porCotizacion.map((c) => c?.precioUnitario ?? null)),
    porCotizacion: fila.porCotizacion.slice(inicio, inicio + proveedoresPorPagina),
  }));
  const totales = totalesGlobal.slice(inicio, inicio + proveedoresPorPagina);
  const indiceSugerido = indiceSugeridoGlobal - inicio;

  // Tarjeta por proveedor (22/Sep/2026, diseño acordado - Cantidad/Precio
  // Unitario/Importe por columna, la de menor precio unitario por fila en
  // pill verde, la sugerida con toda su columna resaltada y boton oscuro
  // "USAR ESTA" + chip). Reemplaza la tabla plana anterior (solo precio
  // unitario, una celda de texto verde).
  const fondoSugerida = alpha(theme.palette.success.main, 0.08);
  // Toda columna de proveedor lleva su propio borde a modo de tarjeta -
  // gris para las normales, verde (mas grueso) para la sugerida - en vez
  // de solo la sugerida, para que las 3 se lean como tarjetas separadas.
  const bordeColor = (index: number) => (index === indiceSugerido ? "success.main" : "divider");
  const bordeGrosor = (index: number) => (index === indiceSugerido ? 2 : 1);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Comparación de cotizaciones
      </Typography>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2} sx={{ verticalAlign: "bottom", border: "none" }}>
                Material
              </TableCell>
              {cotizaciones.map((c, index) => (
                <Fragment key={c.id_cotizacion}>
                  <TableCell
                    colSpan={3}
                    align="center"
                    sx={{
                      fontWeight: 600,
                      borderTop: bordeGrosor(index),
                      borderLeft: bordeGrosor(index),
                      borderRight: bordeGrosor(index),
                      borderColor: bordeColor(index),
                      bgcolor: index === indiceSugerido ? fondoSugerida : undefined,
                    }}
                  >
                    <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                      <span>{c.proveedor_nombre || "(sin proveedor)"}</span>
                      {index === indiceSugerido && (
                        <Chip size="small" label="Sugerida" color="success" variant="outlined" />
                      )}
                    </Stack>
                  </TableCell>
                  {/* Separador entre proveedores (22/Sep/2026, "ponle
                  margenes para diferenciar") - columna vacia sin borde, da
                  el efecto de tarjetas separadas en vez de una sola tabla
                  pegada. */}
                  {index < cotizaciones.length - 1 && <TableCell sx={{ border: "none", width: 20, p: 0 }} />}
                </Fragment>
              ))}
            </TableRow>
            <TableRow>
              {cotizaciones.map((c, index) => (
                <Fragment key={c.id_cotizacion}>
                  <TableCell
                    align="right"
                    sx={{ color: "text.secondary", borderLeft: bordeGrosor(index), borderColor: bordeColor(index), bgcolor: index === indiceSugerido ? fondoSugerida : undefined }}
                  >
                    Cantidad
                  </TableCell>
                  <TableCell align="right" sx={{ color: "text.secondary", bgcolor: index === indiceSugerido ? fondoSugerida : undefined }}>
                    Unitario
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: "text.secondary", borderRight: bordeGrosor(index), borderColor: bordeColor(index), bgcolor: index === indiceSugerido ? fondoSugerida : undefined }}
                  >
                    Subtotal
                  </TableCell>
                  {index < cotizaciones.length - 1 && <TableCell sx={{ border: "none", width: 20, p: 0 }} />}
                </Fragment>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.descripcion}>
                <TableCell>{fila.descripcion}</TableCell>
                {fila.porCotizacion.map((celda, index) => (
                  <Fragment key={cotizaciones[index].id_cotizacion}>
                    <TableCell
                      align="right"
                      sx={{ color: "text.secondary", borderLeft: bordeGrosor(index), borderColor: bordeColor(index), bgcolor: index === indiceSugerido ? fondoSugerida : undefined }}
                    >
                      {celda ? celda.cantidad.toLocaleString("es-MX") : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ bgcolor: index === indiceSugerido ? fondoSugerida : undefined }}>
                      {celda ? (
                        <Box
                          component="span"
                          sx={
                            celda.precioUnitario === fila.menorPrecio
                              ? {
                                  bgcolor: "success.light",
                                  color: "success.dark",
                                  fontWeight: 600,
                                  borderRadius: 4,
                                  px: 1,
                                  py: 0.25,
                                }
                              : undefined
                          }
                        >
                          {formatoMoneda(celda.precioUnitario)}
                        </Box>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ borderRight: bordeGrosor(index), borderColor: bordeColor(index), bgcolor: index === indiceSugerido ? fondoSugerida : undefined }}
                    >
                      {celda ? formatoMoneda(celda.importe) : "—"}
                    </TableCell>
                    {index < cotizaciones.length - 1 && <TableCell sx={{ border: "none", width: 20, p: 0 }} />}
                  </Fragment>
                ))}
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Total general</TableCell>
              {totales.map((total, index) => (
                <Fragment key={cotizaciones[index].id_cotizacion}>
                  <TableCell
                    colSpan={3}
                    align="right"
                    sx={{
                      fontWeight: 600,
                      borderLeft: bordeGrosor(index),
                      borderRight: bordeGrosor(index),
                      borderColor: bordeColor(index),
                      bgcolor: index === indiceSugerido ? fondoSugerida : undefined,
                      ...(!puedeAprobar ? { borderBottom: bordeGrosor(index), borderRadius: "0 0 8px 8px" } : {}),
                    }}
                  >
                    {total !== null ? formatoMoneda(total) : "—"}
                  </TableCell>
                  {index < cotizaciones.length - 1 && <TableCell sx={{ border: "none", width: 20, p: 0 }} />}
                </Fragment>
              ))}
            </TableRow>
            {puedeAprobar && (
              <TableRow>
                <TableCell sx={{ border: "none" }} />
                {cotizaciones.map((c, index) => (
                  <Fragment key={c.id_cotizacion}>
                    <TableCell
                      colSpan={3}
                      align="center"
                      sx={{
                        pb: 2,
                        borderLeft: bordeGrosor(index),
                        borderRight: bordeGrosor(index),
                        borderBottom: bordeGrosor(index),
                        borderColor: bordeColor(index),
                        borderRadius: "0 0 8px 8px",
                        bgcolor: index === indiceSugerido ? fondoSugerida : undefined,
                      }}
                    >
                    <Button
                      size="small"
                      variant="contained"
                      disabled={c.estado === "GANADORA" || estaVencida(c)}
                      title={estaVencida(c) ? "Esta cotización ya venció" : undefined}
                      onClick={() => onSeleccionar(c.id_cotizacion)}
                      sx={{
                        borderRadius: 20,
                        bgcolor: c.estado === "GANADORA" ? undefined : "text.primary",
                        "&:hover": { bgcolor: c.estado === "GANADORA" ? undefined : "text.secondary" },
                      }}
                    >
                      {c.estado === "GANADORA"
                        ? "Seleccionada"
                        : `Usar ${c.proveedor_nombre || "esta"}${index === indiceSugerido ? " (Sugerida)" : ""}`}
                    </Button>
                  </TableCell>
                  {index < cotizaciones.length - 1 && <TableCell sx={{ border: "none", width: 20, p: 0 }} />}
                  </Fragment>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {cotizacionesOrdenadas.length > proveedoresPorPagina && (
        <TablePagination
          component="div"
          count={cotizacionesOrdenadas.length}
          page={pagina}
          onPageChange={(_, nuevaPagina) => setPagina(nuevaPagina)}
          rowsPerPage={proveedoresPorPagina}
          rowsPerPageOptions={[proveedoresPorPagina]}
          labelRowsPerPage="Proveedores por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      )}
    </Paper>
  );
}
