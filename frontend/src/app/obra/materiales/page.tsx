"use client";

import { useEffect, useState } from "react";
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
  List,
  ListItem,
  ListItemText,
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
import { Camera, Package, Pencil, Plus, Trash2, Truck, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
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
const FORM_EVIDENCIA_VACIO = { linkDrive: "", fecha: fechaActual(), hora: horaActual(), comentarios: "" };

// Flujo de 3 estados, sin paso intermedio de aprobacion (decision de
// Mariana 21/Ago/2026: "tendremos Entregado, Solicitado, Rechazado").
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
// Movido de /ventas-vivienda/materiales a /obra/materiales (21/Ago/2026,
// pedido de Mariana: "materiales debe estar en obra").
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
// El catalogo de mano de obra se saco de esta pantalla (21/Ago/2026,
// pedido de Mariana: "no se que va ahi pero nos pueden fundir por tenerlo
// en materiales") - el modelo ManoObraCatalogo sigue en el backend (lo
// usa ConceptoPresupuesto), solo falta decidir en que pantalla vive.
export default function MaterialesPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [materiales, setMateriales] = useState<MaterialCatalogo[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudMaterial[]>([]);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [editandoMaterial, setEditandoMaterial] = useState<MaterialCatalogo | null>(null);
  const [formMaterial, setFormMaterial] = useState(FORM_MATERIAL_VACIO);

  const [solicitudDialogOpen, setSolicitudDialogOpen] = useState(false);
  const [formSolicitud, setFormSolicitud] = useState(FORM_SOLICITUD_VACIO);

  const [bitacoraSolicitud, setBitacoraSolicitud] = useState<SolicitudMaterial | null>(null);
  const [evidencias, setEvidencias] = useState<EvidenciaRecepcion[]>([]);
  const [evidenciasLoading, setEvidenciasLoading] = useState(false);
  const [formEvidencia, setFormEvidencia] = useState(FORM_EVIDENCIA_VACIO);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("materiales.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("materiales.editar") ?? false;

  function refresh() {
    setLoading(true);
    Promise.all([listMateriales(), listSolicitudes(), listProyectos()])
      .then(([m, s, p]) => {
        setMateriales(m);
        setSolicitudes(s);
        setProyectos(p);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

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
    setSaving(true);
    setFormError(null);
    try {
      const nueva = await createEvidenciaRecepcion({
        solicitud: bitacoraSolicitud.id_solicitud,
        linkDrive: formEvidencia.linkDrive || null,
        fecha: formEvidencia.fecha,
        hora: formEvidencia.hora,
        registradoPor: session.user_id,
        comentarios: formEvidencia.comentarios || null,
      });
      setEvidencias((prev) => [nueva, ...prev]);
      setFormEvidencia(FORM_EVIDENCIA_VACIO);
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
        Catálogo de materiales y salidas de almacén contra lo ya disponible ahí. Para pedir material que
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
        <Stack spacing={3}>
          <Paper variant="outlined">
            <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
              <Typography variant="subtitle1">Catálogo de materiales</Typography>
              {puedeCrear && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={abrirAltaMaterial}
                  sx={{ ml: "auto" }}
                >
                  Nuevo material
                </Button>
              )}
            </Stack>
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
          </Paper>

          <Paper variant="outlined">
            <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
              <Truck size={18} strokeWidth={1.5} />
              <Typography variant="subtitle1">Salida de almacén</Typography>
              {puedeCrear && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={abrirAltaSolicitud}
                  disabled={materiales.length === 0}
                  sx={{ ml: "auto" }}
                >
                  Nueva salida
                </Button>
              )}
            </Stack>
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
          </Paper>
        </Stack>
      )}

      <Dialog open={materialDialogOpen} onClose={() => setMaterialDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editandoMaterial ? `Editar ${editandoMaterial.material}` : "Nuevo material"}
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
          Nueva salida de almacén
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
          <Typography variant="caption" color="text.secondary">
            Mientras no exista la carpeta de Drive para Obra, la foto se registra como un link pegado a mano.
          </Typography>
          {formError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              size="small"
              label="Link de la foto (Drive u otro)"
              value={formEvidencia.linkDrive}
              onChange={(e) => setFormEvidencia({ ...formEvidencia, linkDrive: e.target.value })}
              fullWidth
            />
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
            <Button variant="contained" onClick={handleAgregarEvidencia} disabled={saving} sx={{ alignSelf: "flex-start" }}>
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
    </AppShell>
  );
}
