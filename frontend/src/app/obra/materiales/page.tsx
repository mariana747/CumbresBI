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
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Camera, Package, Pencil, Plus, Trash2, Truck, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import EscanerDocumento from "@/components/EscanerDocumento";
import FiltrosBar from "@/components/FiltrosBar";
import { SessionUser, getSession } from "@/lib/auth";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  EvidenciaRecepcion,
  MaterialCatalogo,
  SolicitudMaterial,
  SolicitudMaterialEstado,
  createEvidenciaRecepcion,
  createMaterial,
  createSolicitud,
  deleteMaterial,
  entregarSolicitud,
  listEvidenciasRecepcion,
  listMateriales,
  listSolicitudes,
  rechazarSolicitud,
  subirEvidenciaFotoRecepcion,
  updateMaterial,
} from "@/lib/materiales";

const FORM_MATERIAL_VACIO = {
  material: "",
  unidadMedida: "",
  cantidadDisponible: "0",
  precioUnitario: "",
  proveedor: "",
  comentarios: "",
};
const FORM_SOLICITUD_VACIO = { proyecto: "", material: "", cantidadSolicitada: "", comentarios: "" };

function horaActual() {
  return new Date().toTimeString().slice(0, 5);
}
function fechaActual() {
  return new Date().toISOString().slice(0, 10);
}
const FORM_EVIDENCIA_VACIO = { fecha: fechaActual(), hora: horaActual(), comentarios: "" };

// Flujo de 3 estados, sin paso intermedio de aprobacion.
const ESTADO_LABELS: Record<SolicitudMaterialEstado, string> = {
  SOLICITADO: "Solicitado",
  ENTREGADO: "Entregado",
  RECHAZADO: "Rechazado",
};
const ESTADO_COLOR: Record<SolicitudMaterialEstado, "default" | "success" | "error"> = {
  SOLICITADO: "default",
  ENTREGADO: "success",
  RECHAZADO: "error",
};

// Catalogo de materiales + "Salida de almacen" contra lo ya disponible en
// ese catalogo - materiales-service tenia modelos y migracion desde
// 19/Ago/2026 pero sin CRUD real, mismo punto en el que estaba Obra antes
// de construirlo.
//
// Movido de /ventas-vivienda/materiales a /obra/materiales: materiales
// pertenece al modulo de Obra.
//
// "Salida de almacen" (21/Ago/2026, antes "Solicitudes de material") es
// DISTINTA de la Requisicion de Materiales (diseno aprobado 17/Ago/2026,
// ver obra-requisicion-materiales-diseno en memoria del proyecto, TODAVIA
// SIN CONSTRUIR): la Requisicion es el documento formal por
// proyecto+etapa que jala los conceptos ya presupuestados y dispara la
// COMPRA (con folio, autorizacion, firmas y exportacion a xlsx); esta
// pantalla es solo para pedir contra lo que YA hay en almacen (por eso el
// backend valida que cantidad_solicitada no exceda
// MaterialCatalogo.cantidad_disponible, y "entregar" hace el descuento
// real). Los nombres del modelo/API internos siguen siendo
// SolicitudMaterial/`/api/solicitudes/` - solo cambio la etiqueta visible.
//
// El catalogo de mano de obra se saco de esta pantalla - el modelo
// ManoObraCatalogo sigue en el backend (lo usa ConceptoPresupuesto), solo
// falta decidir en que pantalla vive.
type Seccion = "catalogo" | "disponibles" | "salida";

export default function MaterialesPage() {
  // Pestañas (mismo patrón de Tabs que admin/reportes/page.tsx) en vez de
  // tarjetas apiladas/laterales: 3 secciones que antes competían por el
  // mismo scroll vertical.
  const [seccion, setSeccion] = useState<Seccion>("catalogo");
  const [session, setSession] = useState<SessionUser | null>(null);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Paginacion + filtros server-side (22/Sep/2026, mismo patron que
  // tesoreria/flujos/page.tsx, ver ListadoGrandePagination en el backend)
  // - cada seccion tiene su propio buscador/pagina, porque son consultas
  // distintas (Disponibles filtra solo_disponibles=true, Salida filtra por
  // estado/proyecto).
  const [materiales, setMateriales] = useState<MaterialCatalogo[]>([]);
  const [searchCatalogo, setSearchCatalogo] = useState("");
  const [paginaCatalogo, setPaginaCatalogo] = useState(0);
  const [filasPorPaginaCatalogo, setFilasPorPaginaCatalogo] = useState(20);
  const [totalCatalogo, setTotalCatalogo] = useState(0);

  const [disponibles, setDisponibles] = useState<MaterialCatalogo[]>([]);
  const [searchDisponibles, setSearchDisponibles] = useState("");
  const [paginaDisponibles, setPaginaDisponibles] = useState(0);
  const [filasPorPaginaDisponibles, setFilasPorPaginaDisponibles] = useState(20);
  const [totalDisponibles, setTotalDisponibles] = useState(0);

  const [solicitudes, setSolicitudes] = useState<SolicitudMaterial[]>([]);
  const [searchSalida, setSearchSalida] = useState("");
  const [filtroEstadoSalida, setFiltroEstadoSalida] = useState<SolicitudMaterialEstado | "">("");
  const [filtroProyectoSalida, setFiltroProyectoSalida] = useState("");
  const [paginaSalida, setPaginaSalida] = useState(0);
  const [filasPorPaginaSalida, setFilasPorPaginaSalida] = useState(20);
  const [totalSalida, setTotalSalida] = useState(0);

  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [editandoMaterial, setEditandoMaterial] = useState<MaterialCatalogo | null>(null);
  const [formMaterial, setFormMaterial] = useState(FORM_MATERIAL_VACIO);

  const [solicitudDialogOpen, setSolicitudDialogOpen] = useState(false);
  const [formSolicitud, setFormSolicitud] = useState(FORM_SOLICITUD_VACIO);

  const [bitacoraSolicitud, setBitacoraSolicitud] = useState<SolicitudMaterial | null>(null);
  const [evidencias, setEvidencias] = useState<EvidenciaRecepcion[]>([]);
  const [evidenciasLoading, setEvidenciasLoading] = useState(false);
  const [formEvidencia, setFormEvidencia] = useState(FORM_EVIDENCIA_VACIO);
  const [fotoParaEscanear, setFotoParaEscanear] = useState<File | null>(null);
  const [archivoEvidencia, setArchivoEvidencia] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("materiales.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("materiales.editar") ?? false;

  useEffect(() => {
    setLoading(true);
    listProyectos()
      .then(setProyectos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  function refreshCatalogo() {
    listMateriales({ search: searchCatalogo || undefined, page: paginaCatalogo + 1, pageSize: filasPorPaginaCatalogo })
      .then((res) => {
        setMateriales(res.results);
        setTotalCatalogo(res.count);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }

  useEffect(() => {
    const timeout = setTimeout(refreshCatalogo, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCatalogo, paginaCatalogo, filasPorPaginaCatalogo]);

  useEffect(() => {
    setPaginaCatalogo(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchCatalogo]);

  function refreshDisponibles() {
    listMateriales({
      search: searchDisponibles || undefined,
      soloDisponibles: true,
      page: paginaDisponibles + 1,
      pageSize: filasPorPaginaDisponibles,
    })
      .then((res) => {
        setDisponibles(res.results);
        setTotalDisponibles(res.count);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }

  useEffect(() => {
    if (seccion !== "disponibles") return;
    const timeout = setTimeout(refreshDisponibles, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, searchDisponibles, paginaDisponibles, filasPorPaginaDisponibles]);

  useEffect(() => {
    setPaginaDisponibles(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDisponibles]);

  function refreshSalida() {
    listSolicitudes({
      search: searchSalida || undefined,
      estado: filtroEstadoSalida || undefined,
      proyecto: filtroProyectoSalida || undefined,
      page: paginaSalida + 1,
      pageSize: filasPorPaginaSalida,
    })
      .then((res) => {
        setSolicitudes(res.results);
        setTotalSalida(res.count);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }

  useEffect(() => {
    if (seccion !== "salida") return;
    const timeout = setTimeout(refreshSalida, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, searchSalida, filtroEstadoSalida, filtroProyectoSalida, paginaSalida, filasPorPaginaSalida]);

  useEffect(() => {
    setPaginaSalida(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSalida, filtroEstadoSalida, filtroProyectoSalida]);

  // Refresco compartido tras crear/editar/borrar (dialogos) - siempre
  // recarga el Catalogo (fuente de materiales para el select de "Nueva
  // Salida") y ademas la seccion activa si es otra.
  function refresh() {
    refreshCatalogo();
    if (seccion === "disponibles") refreshDisponibles();
    if (seccion === "salida") refreshSalida();
  }

  function abrirAltaMaterial() {
    setEditandoMaterial(null);
    setFormMaterial(FORM_MATERIAL_VACIO);
    setFormError(null);
    setMaterialDialogOpen(true);
  }

  function abrirEdicionMaterial(m: MaterialCatalogo) {
    setEditandoMaterial(m);
    setFormMaterial({
      material: m.material,
      unidadMedida: m.unidad_medida,
      cantidadDisponible: m.cantidad_disponible,
      precioUnitario: m.precio_unitario,
      proveedor: m.proveedor || "",
      comentarios: m.comentarios || "",
    });
    setFormError(null);
    setMaterialDialogOpen(true);
  }

  async function handleGuardarMaterial() {
    if (!formMaterial.material.trim() || !formMaterial.unidadMedida.trim() || !formMaterial.precioUnitario) {
      setFormError("Material, unidad de medida y precio unitario son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editandoMaterial) {
        await updateMaterial(editandoMaterial.id_material, {
          material: formMaterial.material,
          unidad_medida: formMaterial.unidadMedida,
          cantidad_disponible: formMaterial.cantidadDisponible,
          precio_unitario: formMaterial.precioUnitario,
          proveedor: formMaterial.proveedor || null,
          comentarios: formMaterial.comentarios || null,
        });
      } else {
        await createMaterial({
          material: formMaterial.material,
          unidadMedida: formMaterial.unidadMedida,
          cantidadDisponible: formMaterial.cantidadDisponible,
          precioUnitario: formMaterial.precioUnitario,
          proveedor: formMaterial.proveedor || null,
          comentarios: formMaterial.comentarios || null,
        });
      }
      setMaterialDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrarMaterial(m: MaterialCatalogo) {
    if (!window.confirm(`¿Borrar el material "${m.material}"? Esto falla si tiene solicitudes o presupuestos ligados.`)) {
      return;
    }
    try {
      await deleteMaterial(m.id_material);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function abrirAltaSolicitud() {
    setFormSolicitud({
      ...FORM_SOLICITUD_VACIO,
      proyecto: proyectos[0]?.id_proyecto ?? "",
      material: materiales[0]?.id_material ?? "",
    });
    setFormError(null);
    setSolicitudDialogOpen(true);
  }

  async function handleGuardarSolicitud() {
    if (!session) return;
    if (!formSolicitud.proyecto.trim() || !formSolicitud.material || !formSolicitud.cantidadSolicitada) {
      setFormError("Proyecto, material y cantidad son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createSolicitud({
        proyecto: formSolicitud.proyecto,
        material: formSolicitud.material,
        cantidadSolicitada: formSolicitud.cantidadSolicitada,
        solicitadoPor: session.user_id,
        comentarios: formSolicitud.comentarios || null,
      });
      setSolicitudDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleAccionSolicitud(id: string, accion: "entregar" | "rechazar") {
    setAccionando(id);
    try {
      if (accion === "entregar") await entregarSolicitud(id);
      if (accion === "rechazar") await rechazarSolicitud(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(null);
    }
  }

  function abrirBitacora(s: SolicitudMaterial) {
    setBitacoraSolicitud(s);
    setFormEvidencia(FORM_EVIDENCIA_VACIO);
    setArchivoEvidencia(null);
    setFormError(null);
    setEvidenciasLoading(true);
    listEvidenciasRecepcion(s.id_solicitud)
      .then(setEvidencias)
      .catch((err) => setFormError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setEvidenciasLoading(false));
  }

  async function handleAgregarEvidencia() {
    if (!session || !bitacoraSolicitud) return;
    if (!formEvidencia.fecha || !formEvidencia.hora) {
      setFormError("Fecha y hora son requeridas.");
      return;
    }
    if (!archivoEvidencia) {
      setFormError("Toma o sube una foto antes de agregar a la bitácora.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const nueva = await createEvidenciaRecepcion({
        solicitud: bitacoraSolicitud.id_solicitud,
        fecha: formEvidencia.fecha,
        hora: formEvidencia.hora,
        registradoPor: session.user_id,
        comentarios: formEvidencia.comentarios || null,
      });
      // Se sube DESPUES de crear el registro (necesita su id_evidencia) -
      // mismo patron que Compras > Recepciones.
      const conFoto = await subirEvidenciaFotoRecepcion(nueva.id_evidencia, archivoEvidencia);
      setEvidencias((prev) => [conFoto, ...prev]);
      setFormEvidencia(FORM_EVIDENCIA_VACIO);
      setArchivoEvidencia(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Package size={22} strokeWidth={1.5} />
        <Typography variant="h5">Materiales</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Catálogo de Materiales y salidas de almacén contra lo ya disponible ahí. Para pedir material que
        implique una compra nueva, esa es la Requisición de Materiales (pantalla aparte, todavía en diseño).
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
        <>
          {/* Pestañas (mismo patrón que admin/reportes/page.tsx) - antes
          eran 3 tarjetas compitiendo por el mismo scroll vertical (o 2
          lado a lado + 1 abajo). "Catálogo de Materiales" y "Catálogo de
          materiales disponibles" leen la misma fuente (MaterialCatalogo);
          la segunda solo filtra a lo que sí hay en existencia ahora mismo
          (cantidad_disponible > 0) y es de solo lectura - alta/edición/
          borrado siguen viviendo en la primera pestaña. */}
          <Tabs
            value={seccion}
            onChange={(_, v) => setSeccion(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab label="Catálogo de Materiales" value="catalogo" />
            <Tab label="Catálogo de Materiales Disponibles" value="disponibles" />
            <Tab icon={<Truck size={16} strokeWidth={1.5} />} iconPosition="start" label="Salida de Almacén" value="salida" />
          </Tabs>

          {seccion === "catalogo" && (
            <>
              <FiltrosBar
                search={searchCatalogo}
                onSearchChange={setSearchCatalogo}
                searchPlaceholder="Buscar por material o unidad..."
                actions={
                  puedeCrear ? (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<Plus size={14} strokeWidth={2} />}
                      onClick={abrirAltaMaterial}
                    >
                      Nuevo Material
                    </Button>
                  ) : undefined
                }
              />
              <Paper variant="outlined">
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Material</TableCell>
                      <TableCell>Unidad</TableCell>
                      <TableCell align="right">Disponible</TableCell>
                      <TableCell align="right">Precio unitario</TableCell>
                      <TableCell>Proveedor</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {materiales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            Sin materiales registrados.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      materiales.map((m) => (
                        <TableRow key={m.id_material} hover>
                          <TableCell>{m.material}</TableCell>
                          <TableCell>{m.unidad_medida}</TableCell>
                          <TableCell align="right">{m.cantidad_disponible}</TableCell>
                          <TableCell align="right">${m.precio_unitario}</TableCell>
                          <TableCell>{m.proveedor || "—"}</TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              aria-label="Editar"
                              onClick={() => abrirEdicionMaterial(m)}
                              disabled={!puedeEditar}
                            >
                              <Pencil size={14} strokeWidth={1.5} />
                            </IconButton>
                            <IconButton
                              size="small"
                              aria-label="Borrar"
                              onClick={() => handleBorrarMaterial(m)}
                              disabled={!puedeEditar}
                            >
                              <Trash2 size={14} strokeWidth={1.5} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={totalCatalogo}
                page={paginaCatalogo}
                onPageChange={(_, nuevaPagina) => setPaginaCatalogo(nuevaPagina)}
                rowsPerPage={filasPorPaginaCatalogo}
                onRowsPerPageChange={(e) => {
                  setFilasPorPaginaCatalogo(parseInt(e.target.value, 10));
                  setPaginaCatalogo(0);
                }}
                rowsPerPageOptions={[20, 50, 100]}
                labelRowsPerPage="Filas por página"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
              />
              </Paper>
            </>
          )}

          {seccion === "disponibles" && (
            <>
              <FiltrosBar
                search={searchDisponibles}
                onSearchChange={setSearchDisponibles}
                searchPlaceholder="Buscar por material o unidad..."
              />
              <Paper variant="outlined">
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Material</TableCell>
                      <TableCell>Unidad</TableCell>
                      <TableCell align="right">Disponible</TableCell>
                      <TableCell align="right">Precio unitario</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {disponibles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            Ningún material tiene existencia disponible ahora mismo.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      disponibles.map((m) => (
                        <TableRow key={m.id_material} hover>
                          <TableCell>{m.material}</TableCell>
                          <TableCell>{m.unidad_medida}</TableCell>
                          <TableCell align="right">{m.cantidad_disponible}</TableCell>
                          <TableCell align="right">${m.precio_unitario}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={totalDisponibles}
                page={paginaDisponibles}
                onPageChange={(_, nuevaPagina) => setPaginaDisponibles(nuevaPagina)}
                rowsPerPage={filasPorPaginaDisponibles}
                onRowsPerPageChange={(e) => {
                  setFilasPorPaginaDisponibles(parseInt(e.target.value, 10));
                  setPaginaDisponibles(0);
                }}
                rowsPerPageOptions={[20, 50, 100]}
                labelRowsPerPage="Filas por página"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
              />
              </Paper>
            </>
          )}

          {seccion === "salida" && (
            <>
              <FiltrosBar
                search={searchSalida}
                onSearchChange={setSearchSalida}
                searchPlaceholder="Buscar por proyecto o material..."
                actions={
                  puedeCrear ? (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<Plus size={14} strokeWidth={2} />}
                      onClick={abrirAltaSolicitud}
                      disabled={materiales.length === 0}
                    >
                      Nueva Salida
                    </Button>
                  ) : undefined
                }
              >
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="filtro-estado-salida-label">Estado</InputLabel>
                  <Select
                    labelId="filtro-estado-salida-label"
                    label="Estado"
                    value={filtroEstadoSalida}
                    onChange={(e) => setFiltroEstadoSalida(e.target.value as SolicitudMaterialEstado | "")}
                  >
                    <MenuItem value="">
                      <em>Todos</em>
                    </MenuItem>
                    {(Object.keys(ESTADO_LABELS) as SolicitudMaterialEstado[]).map((estado) => (
                      <MenuItem key={estado} value={estado}>
                        {ESTADO_LABELS[estado]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="filtro-proyecto-salida-label">Proyecto</InputLabel>
                  <Select
                    labelId="filtro-proyecto-salida-label"
                    label="Proyecto"
                    value={filtroProyectoSalida}
                    onChange={(e) => setFiltroProyectoSalida(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>Todos</em>
                    </MenuItem>
                    {proyectos.map((p) => (
                      <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                        {p.alias_proyecto || p.denominacion || p.id_proyecto}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </FiltrosBar>
              <Paper variant="outlined">
              {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza
              por tarjetas apiladas (ver abajo) - 6 columnas no caben comodas
              en un telefono, mismo patron que tesoreria/flujos/page.tsx. */}
              <Box sx={{ display: { xs: "none", sm: "block" } }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Proyecto</TableCell>
                        <TableCell>Material</TableCell>
                        <TableCell align="right">Cantidad</TableCell>
                        <TableCell>Estado</TableCell>
                        <TableCell>Fecha solicitud</TableCell>
                        <TableCell align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {solicitudes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                            <Typography variant="body2" color="text.secondary">
                              Sin salidas registradas.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        solicitudes.map((s) => (
                          <TableRow key={s.id_solicitud} hover>
                            <TableCell>
                              {proyectos.find((p) => p.id_proyecto === s.proyecto)?.alias_proyecto || s.proyecto}
                            </TableCell>
                            <TableCell>{s.material_nombre}</TableCell>
                            <TableCell align="right">{s.cantidad_solicitada}</TableCell>
                            <TableCell>
                              <Chip size="small" label={ESTADO_LABELS[s.estado]} color={ESTADO_COLOR[s.estado]} />
                            </TableCell>
                            <TableCell>{s.fecha_solicitud}</TableCell>
                            <TableCell align="right">
                              {puedeEditar && s.estado === "SOLICITADO" && (
                                <>
                                  <Button
                                    size="small"
                                    onClick={() => handleAccionSolicitud(s.id_solicitud, "entregar")}
                                    disabled={accionando === s.id_solicitud || !s.tiene_evidencia}
                                    title={!s.tiene_evidencia ? "Falta la foto en la bitácora de recepción" : undefined}
                                  >
                                    Entregar
                                  </Button>
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() => handleAccionSolicitud(s.id_solicitud, "rechazar")}
                                    disabled={accionando === s.id_solicitud}
                                  >
                                    Rechazar
                                  </Button>
                                </>
                              )}
                              <IconButton
                                size="small"
                                aria-label={s.tiene_evidencia ? "Bitácora de recepción (con foto)" : "Bitácora de recepción (sin foto)"}
                                title={s.tiene_evidencia ? "Con foto de recepción" : "Sin foto de recepción"}
                                onClick={() => abrirBitacora(s)}
                              >
                                <Camera
                                  size={14}
                                  strokeWidth={1.5}
                                  color={s.tiene_evidencia ? "#2e7d32" : "#c62828"}
                                />
                              </IconButton>
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
                    Sin salidas registradas.
                  </Typography>
                ) : (
                  solicitudes.map((s) => (
                    <Paper key={s.id_solicitud} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2">{s.material_nombre}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {proyectos.find((p) => p.id_proyecto === s.proyecto)?.alias_proyecto || s.proyecto}
                          </Typography>
                        </Stack>
                        <IconButton
                          size="small"
                          aria-label={s.tiene_evidencia ? "Bitácora de recepción (con foto)" : "Bitácora de recepción (sin foto)"}
                          title={s.tiene_evidencia ? "Con foto de recepción" : "Sin foto de recepción"}
                          onClick={() => abrirBitacora(s)}
                          sx={{ flexShrink: 0 }}
                        >
                          <Camera size={14} strokeWidth={1.5} color={s.tiene_evidencia ? "#2e7d32" : "#c62828"} />
                        </IconButton>
                      </Stack>
                      <Stack spacing={0.5} sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          <strong>Cantidad:</strong> {s.cantidad_solicitada}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Fecha solicitud:</strong> {s.fecha_solicitud}
                        </Typography>
                        <Chip
                          size="small"
                          label={ESTADO_LABELS[s.estado]}
                          color={ESTADO_COLOR[s.estado]}
                          sx={{ alignSelf: "flex-start" }}
                        />
                      </Stack>
                      {puedeEditar && s.estado === "SOLICITADO" && (
                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                          <Button
                            size="small"
                            onClick={() => handleAccionSolicitud(s.id_solicitud, "entregar")}
                            disabled={accionando === s.id_solicitud || !s.tiene_evidencia}
                          >
                            Entregar
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            onClick={() => handleAccionSolicitud(s.id_solicitud, "rechazar")}
                            disabled={accionando === s.id_solicitud}
                          >
                            Rechazar
                          </Button>
                        </Stack>
                      )}
                    </Paper>
                  ))
                )}
              </Stack>
              <TablePagination
                component="div"
                count={totalSalida}
                page={paginaSalida}
                onPageChange={(_, nuevaPagina) => setPaginaSalida(nuevaPagina)}
                rowsPerPage={filasPorPaginaSalida}
                onRowsPerPageChange={(e) => {
                  setFilasPorPaginaSalida(parseInt(e.target.value, 10));
                  setPaginaSalida(0);
                }}
                rowsPerPageOptions={[20, 50, 100]}
                labelRowsPerPage="Filas por página"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
              />
              </Paper>
            </>
          )}
        </>
      )}

      <Dialog open={materialDialogOpen} onClose={() => setMaterialDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editandoMaterial ? `Editar ${editandoMaterial.material}` : "Nuevo Material"}
          <IconButton onClick={() => setMaterialDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Material"
              value={formMaterial.material}
              onChange={(e) => setFormMaterial({ ...formMaterial, material: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Unidad de medida"
              value={formMaterial.unidadMedida}
              onChange={(e) => setFormMaterial({ ...formMaterial, unidadMedida: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Cantidad disponible"
              type="number"
              value={formMaterial.cantidadDisponible}
              onChange={(e) => setFormMaterial({ ...formMaterial, cantidadDisponible: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Precio unitario"
              type="number"
              value={formMaterial.precioUnitario}
              onChange={(e) => setFormMaterial({ ...formMaterial, precioUnitario: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Proveedor (id_contraparte)"
              value={formMaterial.proveedor}
              onChange={(e) => setFormMaterial({ ...formMaterial, proveedor: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Comentarios"
              value={formMaterial.comentarios}
              onChange={(e) => setFormMaterial({ ...formMaterial, comentarios: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMaterialDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarMaterial} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={solicitudDialogOpen} onClose={() => setSolicitudDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Nueva Salida de Almacén
          <IconButton onClick={() => setSolicitudDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            {proyectos.length > 0 ? (
              <TextField
                size="small"
                select
                label="Proyecto"
                value={formSolicitud.proyecto}
                onChange={(e) => setFormSolicitud({ ...formSolicitud, proyecto: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                SelectProps={{ native: true }}
              >
                <option value="" disabled>
                  Selecciona un proyecto
                </option>
                {proyectos.map((p) => (
                  <option key={p.id_proyecto} value={p.id_proyecto}>
                    {p.alias_proyecto || p.denominacion || p.id_proyecto}
                  </option>
                ))}
              </TextField>
            ) : (
              <TextField
                size="small"
                label="Proyecto (todavía no hay catálogo de proyectos)"
                value={formSolicitud.proyecto}
                onChange={(e) => setFormSolicitud({ ...formSolicitud, proyecto: e.target.value })}
                fullWidth
              />
            )}
            <TextField
              size="small"
              select
              label="Material"
              value={formSolicitud.material}
              onChange={(e) => setFormSolicitud({ ...formSolicitud, material: e.target.value })}
              fullWidth
              SelectProps={{ native: true }}
            >
              {materiales.map((m) => (
                <option key={m.id_material} value={m.id_material}>
                  {m.material} (disponible: {m.cantidad_disponible} {m.unidad_medida})
                </option>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Cantidad solicitada"
              type="number"
              value={formSolicitud.cantidadSolicitada}
              onChange={(e) => setFormSolicitud({ ...formSolicitud, cantidadSolicitada: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Comentarios"
              value={formSolicitud.comentarios}
              onChange={(e) => setFormSolicitud({ ...formSolicitud, comentarios: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSolicitudDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarSolicitud} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!bitacoraSolicitud} onClose={() => setBitacoraSolicitud(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Bitácora de recepción — {bitacoraSolicitud?.material_nombre}
          <IconButton onClick={() => setBitacoraSolicitud(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
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
              <Button component="label" variant="outlined">
                Subir archivo
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
            {archivoEvidencia && (
              <Typography variant="caption" color="text.secondary">
                Foto lista: {archivoEvidencia.name}
              </Typography>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Fecha"
                type="date"
                value={formEvidencia.fecha}
                onChange={(e) => setFormEvidencia({ ...formEvidencia, fecha: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label="Hora"
                type="time"
                value={formEvidencia.hora}
                onChange={(e) => setFormEvidencia({ ...formEvidencia, hora: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            <TextField
              size="small"
              label="Comentarios"
              value={formEvidencia.comentarios}
              onChange={(e) => setFormEvidencia({ ...formEvidencia, comentarios: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
            <Button
              variant="contained"
              onClick={handleAgregarEvidencia}
              disabled={saving || !archivoEvidencia}
              sx={{ alignSelf: "flex-start" }}
            >
              {saving ? <CircularProgress size={16} /> : "Agregar a la bitácora"}
            </Button>
          </Stack>

          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
            Historial
          </Typography>
          {evidenciasLoading ? (
            <Stack alignItems="center" sx={{ py: 2 }}>
              <CircularProgress size={18} />
            </Stack>
          ) : evidencias.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Sin entradas todavía.
            </Typography>
          ) : (
            <List dense disablePadding>
              {evidencias.map((ev) => (
                <ListItem key={ev.id_evidencia} disableGutters divider>
                  <ListItemText
                    primary={`${ev.fecha} ${ev.hora}${ev.link_drive ? " — " + ev.link_drive : ""}`}
                    secondary={ev.comentarios || undefined}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBitacoraSolicitud(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <EscanerDocumento
        open={!!fotoParaEscanear}
        archivo={fotoParaEscanear}
        onCancelar={() => setFotoParaEscanear(null)}
        onConfirmar={(archivo) => {
          setArchivoEvidencia(archivo);
          setFotoParaEscanear(null);
        }}
      />
    </AppShell>
  );
}
