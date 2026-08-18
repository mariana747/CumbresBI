"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  FileText,
  Flag,
  History,
  Pencil,
  RefreshCw,
  ShieldQuestion,
  Snowflake,
  Trash2,
  UploadCloud,
  X as CloseIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { BRAND } from "@/theme/theme";
import { SessionUser, getSession, puedeVerBitacora } from "@/lib/auth";
import { BitacoraEvento, friendlyActionName, friendlyServiceName, listBitacora } from "@/lib/audit";
import {
  PldContraparteDoc,
  PldContraparteKyc,
  PldDatosEditables,
  aprobarKyc,
  congelarKyc,
  editarKyc,
  eliminarDocumentoKyc,
  getKyc,
  marcarSospechosoKyc,
  reactivarCuentaKyc,
  verificarDocumentosKyc,
} from "@/lib/pld";

// Tipos que el Motor Documental ya reconoce (docint/classifier.py) - solo
// referencia informativa, la deteccion es automatica por nombre de archivo.
const SUPPORTED_DOCUMENT_TYPES = [
  "INE / IFE",
  "CURP",
  "Comprobante de domicilio",
  "Constancia de situación fiscal",
  "Acta de nacimiento",
  "Acta constitutiva",
];

const ESTADO_CUENTA_LABELS: Record<string, string> = {
  ACTIVA: "Activa",
  SOSPECHOSA: "Marcada como sospechosa",
  CONGELADA: "Congelada",
};

const ESTADO_CUENTA_COLOR: Record<string, "success" | "warning" | "error"> = {
  ACTIVA: "success",
  SOSPECHOSA: "warning",
  CONGELADA: "error",
};

// Vista de detalle de un expediente KYC (17/Ago/2026, referencia visual
// pedida por Mariana: dossier tipo "KYC/AML Customer Dossier" con pestañas
// y semáforo de riesgo) - adaptado a nuestra paleta clara (BRAND) en vez
// del mockup oscuro original, y a los datos que REALMENTE existen hoy.
// "Análisis de riesgo" e "Historial de transacciones" quedan como
// "próximamente": requieren integración externa de KYC/AML (PEP/OFAC) y el
// módulo de Tesorería respectivamente, ninguno construido todavía (ver
// memoria de sesión "pld-validacion-externa-kyc-pendiente").

// Agrupado en secciones (17/Ago/2026, combinando con KycDetalleDialog.tsx
// de feature/pld-drive-explorador - esa rama tenia mas campos que esta
// vista, ver memoria de sesion "pld-detalle-expediente-comparacion"):
// Identificacion/Domicilio/Domicilio de correspondencia/Contacto, mismo
// whitelist que PLD_CAMPOS_CONFIRMABLES.
const GRUPOS_CAMPOS_GENERAL: { titulo: string; campos: { campo: keyof PldDatosEditables; label: string }[] }[] = [
  {
    titulo: "Identificación",
    campos: [
      { campo: "nombre_completo", label: "Nombre completo / Razón social" },
      { campo: "curp", label: "CURP" },
      { campo: "nacionalidad", label: "Nacionalidad" },
      { campo: "pais_nac_const", label: "País de nacimiento / constitución" },
      { campo: "fecha_nac_const", label: "Fecha de nacimiento / constitución" },
      { campo: "folio_mercantil", label: "Folio mercantil" },
      { campo: "objeto_social", label: "Objeto social" },
      { campo: "ocupacion_act_economica", label: "Ocupación / actividad económica" },
      { campo: "tipo_identificacion", label: "Tipo de identificación" },
      { campo: "autoridad_identificacion", label: "Autoridad emisora" },
      { campo: "numero_identificacion", label: "Número de identificación" },
      { campo: "estado_civil", label: "Estado civil" },
      { campo: "ident_fideicomiso", label: "Fideicomiso" },
    ],
  },
  {
    titulo: "Domicilio",
    campos: [
      { campo: "dom_calle", label: "Calle" },
      { campo: "dom_numero_ext", label: "Número exterior" },
      { campo: "dom_numero_int", label: "Número interior" },
      { campo: "dom_colonia", label: "Colonia" },
      { campo: "dom_municipio_alcaldia", label: "Municipio / alcaldía" },
      { campo: "dom_estado", label: "Estado" },
      { campo: "dom_cp", label: "Código postal" },
      { campo: "dom_pais", label: "País" },
    ],
  },
  {
    titulo: "Domicilio de correspondencia",
    campos: [
      { campo: "dom_corresp_dom_calle", label: "Calle" },
      { campo: "dom_corresp_dom_numero_ext", label: "Número exterior" },
      { campo: "dom_corresp_dom_numero_int", label: "Número interior" },
      { campo: "dom_corresp_dom_colonia", label: "Colonia" },
      { campo: "dom_corresp_dom_municipio_alcaldia", label: "Municipio / alcaldía" },
      { campo: "dom_corresp_dom_estado", label: "Estado" },
      { campo: "dom_corresp_dom_cp", label: "Código postal" },
      { campo: "dom_corresp_dom_pais", label: "País" },
    ],
  },
  {
    titulo: "Contacto",
    campos: [
      { campo: "telefono_fijo", label: "Teléfono fijo" },
      { campo: "telefono_sms", label: "Teléfono / SMS" },
    ],
  },
];

export default function PldExpedienteDetallePage() {
  const params = useParams<{ idKyc: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [kyc, setKyc] = useState<(PldContraparteKyc & PldDatosEditables) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [aprobando, setAprobando] = useState(false);
  const [cambiandoEstadoCuenta, setCambiandoEstadoCuenta] = useState(false);
  const [motorAbierto, setMotorAbierto] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [verificarError, setVerificarError] = useState<string | null>(null);
  const [verificarMensaje, setVerificarMensaje] = useState<string | null>(null);
  const [confirmandoEliminarDoc, setConfirmandoEliminarDoc] = useState<PldContraparteDoc | null>(null);
  const [eliminandoDoc, setEliminandoDoc] = useState(false);
  const [historial, setHistorial] = useState<BitacoraEvento[] | null>(null);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);
  // Edicion manual del expediente (18/Ago/2026) - ver
  // pld/audit_utils.py::contexto_kyc y views.py::update, ya auditado en el
  // backend; esto es la UI que faltaba. editandoCampos es null cuando no
  // esta en modo edicion.
  const [editandoCampos, setEditandoCampos] = useState<PldDatosEditables | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  function cargar() {
    setLoading(true);
    getKyc(params.idKyc)
      .then(setKyc)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar el expediente"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    getSession().then(setSession);
    setHistorial(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.idKyc]);

  const puedeAprobar = session?.perm_keys.includes("pld-compliance.aprobar") ?? false;
  const puedeCrear = session?.perm_keys.includes("pld-compliance.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("pld-compliance.editar") ?? false;
  const puedeVerHistorial = puedeVerBitacora(session);

  // Historial de auditoria (18/Ago/2026) - reusa el mismo buscador
  // unificado de audit-service (?search=), que ya encuentra tanto eventos
  // de pld-service (entidad_id = id_kyc) como de docint (entidad_id =
  // carpeta de Drive que incluye id_contraparte) porque busca tambien
  // dentro del JSON valores_nuevos/valores_previos - ver
  // audit-service/auditoria/views.py::get_queryset. Carga perezosa: solo
  // al abrir la pestana, y solo si el usuario tiene el mismo gate que la
  // bitacora general (GLOBAL o rol AUDITOR).
  useEffect(() => {
    if (tab !== 4 || !kyc || !puedeVerHistorial || historial !== null) return;
    setHistorialLoading(true);
    setHistorialError(null);
    listBitacora({ search: kyc.id_contraparte })
      .then(setHistorial)
      .catch((err) => setHistorialError(err instanceof Error ? err.message : "Error al cargar el historial"))
      .finally(() => setHistorialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kyc, puedeVerHistorial]);

  // Duplicados (18/Ago/2026, hallazgo real de Mariana): mismo nombre de
  // archivo subido mas de una vez para este expediente - solo un aviso
  // visual, no bloquea nada; el analista decide si borrar el sobrante.
  // Comparacion case-insensitive porque el nombre lo pone el cliente/
  // analista tal cual subio el archivo, sin normalizar.
  const denominacionesDuplicadas = (() => {
    const conteo = new Map<string, number>();
    for (const doc of kyc?.documentos ?? []) {
      if (!doc.denominacion) continue;
      const clave = doc.denominacion.trim().toLowerCase();
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    return new Set([...conteo.entries()].filter(([, n]) => n > 1).map(([clave]) => clave));
  })();

  async function handleAprobar() {
    if (!session?.user_id) return;
    setAprobando(true);
    try {
      await aprobarKyc(params.idKyc, session.user_id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aprobar el expediente");
    } finally {
      setAprobando(false);
    }
  }

  function handleIniciarEdicion() {
    if (!kyc) return;
    // Copia solo los campos editables (GRUPOS_CAMPOS_GENERAL) - no todo el
    // objeto kyc, que trae campos de solo lectura (id_kyc, estado_cuenta,
    // documentos, etc.) que no deben viajar en el PATCH.
    const campos: PldDatosEditables = {};
    for (const grupo of GRUPOS_CAMPOS_GENERAL) {
      for (const { campo } of grupo.campos) {
        campos[campo] = kyc[campo] ?? "";
      }
    }
    setEditandoCampos(campos);
    setErrorEdicion(null);
  }

  function handleCancelarEdicion() {
    setEditandoCampos(null);
    setErrorEdicion(null);
  }

  async function handleGuardarEdicion() {
    if (!editandoCampos) return;
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    try {
      await editarKyc(params.idKyc, editandoCampos, session?.user_id);
      setEditandoCampos(null);
      cargar();
    } catch (err) {
      setErrorEdicion(err instanceof Error ? err.message : "Error al guardar los cambios");
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function handleVerificarDocumentos() {
    setVerificando(true);
    setVerificarError(null);
    setVerificarMensaje(null);
    try {
      const resultado = await verificarDocumentosKyc(params.idKyc);
      const eliminados = resultado.documentos_eliminados;
      setVerificarMensaje(
        eliminados.length === 0
          ? "Todos los documentos siguen en Drive."
          : `Se quitaron ${eliminados.length} documento(s) que ya no están en Drive: ${eliminados
              .map((d) => d.denominacion || "sin nombre")
              .join(", ")}.`
      );
      cargar();
    } catch (err) {
      setVerificarError(err instanceof Error ? err.message : "Error al verificar los documentos en Drive");
    } finally {
      setVerificando(false);
    }
  }

  async function handleEliminarDocumento() {
    if (!confirmandoEliminarDoc) return;
    setEliminandoDoc(true);
    try {
      await eliminarDocumentoKyc(confirmandoEliminarDoc.id_kyc_doc, session?.user_id);
      setConfirmandoEliminarDoc(null);
      cargar();
    } catch (err) {
      setVerificarError(err instanceof Error ? err.message : "Error al eliminar el documento");
      setConfirmandoEliminarDoc(null);
    } finally {
      setEliminandoDoc(false);
    }
  }

  async function handleCambiarEstadoCuenta(accion: "marcar_sospechoso" | "congelar" | "reactivar_cuenta") {
    setCambiandoEstadoCuenta(true);
    try {
      const accionFn = { marcar_sospechoso: marcarSospechosoKyc, congelar: congelarKyc, reactivar_cuenta: reactivarCuentaKyc }[
        accion
      ];
      await accionFn(params.idKyc, session?.user_id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el estado de la cuenta");
    } finally {
      setCambiandoEstadoCuenta(false);
    }
  }

  return (
    <AppShell>
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
        onClick={() => router.push("/pld")}
        sx={{ mb: 2 }}
      >
        Volver a expedientes
      </Button>

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {kyc && (
        <Grid container spacing={3}>
          {/* Columna izquierda: identidad + acciones */}
          <Grid item xs={12} md={3}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
              <Avatar sx={{ width: 64, height: 64, mx: "auto", mb: 1.5, bgcolor: BRAND.azul, fontSize: 22 }}>
                {kyc.id_contraparte.slice(0, 2).toUpperCase()}
              </Avatar>
              <Typography variant="subtitle1" fontWeight={600}>
                {kyc.nombre_completo || `Contraparte ${kyc.id_contraparte}`}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {kyc.nombre_completo ? `Contraparte ${kyc.id_contraparte}` : "Nombre sin capturar todavía"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {kyc.curp ? `CURP: ${kyc.curp}` : "Sin CURP capturado todavía"}
              </Typography>
              <Box sx={{ mt: 1.5, mb: 2.5 }}>
                <Chip
                  size="small"
                  label={ESTADO_CUENTA_LABELS[kyc.estado_cuenta] ?? kyc.estado_cuenta}
                  color={ESTADO_CUENTA_COLOR[kyc.estado_cuenta] ?? "default"}
                />
              </Box>

              {/* Estadisticas (visual, mismo estilo del mockup) - Risk
              Score/PEP Status son "No disponible" a proposito, sin
              proveedor externo conectado todavia. Estado de cuenta si es
              real (mismo valor que el chip de arriba). */}
              <Stack spacing={1.5} divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />} sx={{ textAlign: "left" }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    NIVEL DE RIESGO
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="text.disabled">
                    No disponible
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    ESTATUS PEP
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="text.disabled">
                    No disponible
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    ESTADO DE CUENTA
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {ESTADO_CUENTA_LABELS[kyc.estado_cuenta] ?? kyc.estado_cuenta}
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ my: 2.5 }} />

              {/* Control puramente visual (17/Ago/2026, pedido de Mariana:
              "que no haga nada las partes faltantes") - ajustar
              calificacion de riesgo requiere el motor de scoring EBR, que
              no existe todavia (ver
              docs/CumbresBI_V2_Plan_de_Trabajo_y_Cronograma.md Fase 2
              Semana 10 y memoria "pld-validacion-externa-kyc-pendiente").
              Deshabilitado a proposito, no decorativo-enganoso: el cursor
              "not-allowed" y el texto atenuado dejan claro que no responde.
              Movido a la columna izquierda (18/Ago/2026, pedido de
              Mariana: antes vivia a ancho completo hasta abajo de la
              pagina, requeria scroll para actuar sobre la cuenta). */}
              <Box
                sx={{
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  opacity: 0.6,
                  cursor: "not-allowed",
                  bgcolor: "background.default",
                  borderRadius: 1,
                }}
              >
                <Typography variant="caption" fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
                  Riesgo
                </Typography>
                <Button size="small" disabled sx={{ minWidth: 0, px: 0.5 }}>
                  <ChevronLeft size={16} strokeWidth={1.5} />
                </Button>
                <Typography variant="caption" color="text.disabled" sx={{ flex: 1, textAlign: "center" }}>
                  No disponible
                </Typography>
                <Button size="small" disabled sx={{ minWidth: 0, px: 0.5 }}>
                  <ChevronRight size={16} strokeWidth={1.5} />
                </Button>
              </Box>

              {puedeAprobar && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  {!kyc.aprobado_en && (
                    <Button
                      fullWidth
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircle2 size={18} strokeWidth={1.5} />}
                      disabled={aprobando || cambiandoEstadoCuenta}
                      onClick={handleAprobar}
                    >
                      {aprobando ? <CircularProgress size={20} color="inherit" /> : "Aprobar expediente"}
                    </Button>
                  )}

                  {kyc.estado_cuenta !== "SOSPECHOSA" && (
                    <Button
                      fullWidth
                      variant="outlined"
                      color="warning"
                      startIcon={<Flag size={18} strokeWidth={1.5} />}
                      disabled={aprobando || cambiandoEstadoCuenta}
                      onClick={() => handleCambiarEstadoCuenta("marcar_sospechoso")}
                    >
                      Marcar como sospechoso
                    </Button>
                  )}

                  {kyc.estado_cuenta === "CONGELADA" ? (
                    <Button
                      fullWidth
                      variant="outlined"
                      disabled={aprobando || cambiandoEstadoCuenta}
                      onClick={() => handleCambiarEstadoCuenta("reactivar_cuenta")}
                    >
                      Reactivar cuenta
                    </Button>
                  ) : (
                    <Button
                      fullWidth
                      variant="outlined"
                      color="error"
                      startIcon={<Snowflake size={18} strokeWidth={1.5} />}
                      disabled={aprobando || cambiandoEstadoCuenta}
                      onClick={() => handleCambiarEstadoCuenta("congelar")}
                    >
                      Congelar cuenta
                    </Button>
                  )}
                </Stack>
              )}
            </Paper>
          </Grid>

          {/* Columna derecha: pestañas */}
          <Grid item xs={12} md={9}>
            <Paper variant="outlined">
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: "1px solid", borderColor: "divider", px: 2 }}>
                <Tab label="Información general" />
                <Tab label="Análisis de riesgo" />
                <Tab label="Documentos KYC" />
                <Tab label="Historial de transacciones" />
                {puedeVerHistorial && <Tab label="Historial de auditoría" icon={<History size={16} strokeWidth={1.5} />} iconPosition="start" />}
              </Tabs>

              <Box sx={{ p: 2.5, pt: 2 }}>
                {tab === 0 && (
                  <Stack spacing={2}>
                    {errorEdicion && <Alert severity="error">{errorEdicion}</Alert>}

                    {GRUPOS_CAMPOS_GENERAL.map((grupo, indiceGrupo) => (
                      <Box key={grupo.titulo}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle2" gutterBottom>
                            {grupo.titulo}
                          </Typography>
                          {/* Botones de edicion junto al primer titulo (18/Ago/2026:
                          antes era una fila aparte, ancho completo, con espacio
                          vacio a su izquierda - mejor junto al encabezado que ya
                          existe). */}
                          {indiceGrupo === 0 &&
                            (editandoCampos === null ? (
                              puedeEditar && (
                                <Button
                                  size="small"
                                  startIcon={<Pencil size={16} strokeWidth={1.5} />}
                                  onClick={handleIniciarEdicion}
                                >
                                  Editar
                                </Button>
                              )
                            ) : (
                              <Stack direction="row" spacing={1}>
                                <Button
                                  size="small"
                                  color="inherit"
                                  startIcon={<CloseIcon size={16} strokeWidth={1.5} />}
                                  onClick={handleCancelarEdicion}
                                  disabled={guardandoEdicion}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  startIcon={<CheckCircle2 size={16} strokeWidth={1.5} />}
                                  onClick={handleGuardarEdicion}
                                  disabled={guardandoEdicion}
                                >
                                  {guardandoEdicion ? "Guardando…" : "Guardar"}
                                </Button>
                              </Stack>
                            ))}
                        </Stack>
                        <Grid container rowSpacing={0.75} columnSpacing={2}>
                          {grupo.campos.map(({ campo, label }) =>
                            editandoCampos !== null ? (
                              <Grid item xs={12} sm={6} key={campo}>
                                <TextField
                                  size="small"
                                  fullWidth
                                  label={label}
                                  value={editandoCampos[campo] ?? ""}
                                  onChange={(e) =>
                                    setEditandoCampos((prev) => (prev ? { ...prev, [campo]: e.target.value } : prev))
                                  }
                                />
                              </Grid>
                            ) : (
                              <Grid item xs={12} sm={6} key={campo}>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                                  {label}
                                </Typography>
                                <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
                                  {kyc[campo] || "—"}
                                </Typography>
                              </Grid>
                            )
                          )}
                        </Grid>
                      </Box>
                    ))}

                    <Divider />

                    {/* Auditoria (17/Ago/2026, combinando con
                    KycDetalleDialog.tsx de feature/pld-drive-explorador -
                    esa rama si mostraba esto, esta vista no lo tenia). */}
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Estado y auditoría
                      </Typography>
                      <Grid container rowSpacing={0.75} columnSpacing={2}>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                            Aprobado por
                          </Typography>
                          <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{kyc.aprobado_por || "—"}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                            Aprobado en
                          </Typography>
                          <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
                            {kyc.aprobado_en ? new Date(kyc.aprobado_en).toLocaleString("es-MX") : "—"}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                            Vencimiento
                          </Typography>
                          <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{kyc.fecha_vencimiento || "—"}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                            Comentarios
                          </Typography>
                          <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{kyc.comentarios || "—"}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                            Creado
                          </Typography>
                          <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
                            {new Date(kyc.created_at).toLocaleString("es-MX")} — {kyc.created_by}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                            Última actualización
                          </Typography>
                          <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
                            {new Date(kyc.updated_at).toLocaleString("es-MX")} — {kyc.updated_by}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Box>
                  </Stack>
                )}

                {tab === 1 && (
                  <Alert severity="info" icon={<ShieldQuestion size={20} strokeWidth={1.5} />}>
                    Próximamente — requiere conectar un proveedor externo de KYC/AML (listas PEP/OFAC,
                    validación INE/RENAPO, RFC/SAT). Todavía no hay ninguno elegido.
                  </Alert>
                )}

                {tab === 2 && (
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between">
                      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
                        {SUPPORTED_DOCUMENT_TYPES.map((label) => (
                          <Chip key={label} label={label} size="small" variant="outlined" />
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {puedeEditar && kyc.documentos.length > 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={
                              verificando ? (
                                <CircularProgress size={16} />
                              ) : (
                                <RefreshCw size={16} strokeWidth={1.5} />
                              )
                            }
                            disabled={verificando}
                            onClick={handleVerificarDocumentos}
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            Verificar en Drive
                          </Button>
                        )}
                        {puedeCrear && (
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<UploadCloud size={16} strokeWidth={1.5} />}
                            onClick={() => setMotorAbierto(true)}
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            Analizar con Motor Documental
                          </Button>
                        )}
                      </Stack>
                    </Stack>

                    {verificarError && <Alert severity="error">{verificarError}</Alert>}
                    {verificarMensaje && (
                      <Alert severity="info" onClose={() => setVerificarMensaje(null)}>
                        {verificarMensaje}
                      </Alert>
                    )}

                    {kyc.documentos.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Sin documentos subidos todavía.
                      </Typography>
                    ) : (
                      kyc.documentos.map((doc) => {
                        const esDuplicado = Boolean(
                          doc.denominacion && denominacionesDuplicadas.has(doc.denominacion.trim().toLowerCase())
                        );
                        return (
                          <Paper key={doc.id_kyc_doc} variant="outlined" sx={{ p: 1.5 }}>
                            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                              <Stack direction="row" spacing={1.5} alignItems="center">
                                <FileText size={18} strokeWidth={1.5} color={BRAND.azul} />
                                <Typography variant="body2">{doc.denominacion || "Documento sin nombre"}</Typography>
                              </Stack>
                              <Stack direction="row" spacing={1} alignItems="center">
                                {esDuplicado && (
                                  <Chip
                                    size="small"
                                    color="warning"
                                    icon={<Copy size={14} strokeWidth={1.5} />}
                                    label="Duplicado"
                                  />
                                )}
                                <Chip size="small" label={doc.status ?? "Sin estado"} />
                                {puedeEditar && (
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label="Eliminar documento"
                                    onClick={() => setConfirmandoEliminarDoc(doc)}
                                  >
                                    <Trash2 size={16} strokeWidth={1.5} />
                                  </IconButton>
                                )}
                              </Stack>
                            </Stack>
                          </Paper>
                        );
                      })
                    )}
                  </Stack>
                )}

                {tab === 3 && (
                  <Alert severity="info" icon={<ShieldQuestion size={20} strokeWidth={1.5} />}>
                    Próximamente — depende del módulo de Tesorería, que todavía no existe.
                  </Alert>
                )}

                {tab === 4 && puedeVerHistorial && (
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                      Todo lo que le ha pasado a este expediente y sus documentos, cruzando pld-service y el
                      Motor Documental (docint) — quién aprobó, subió, eliminó o editó cada dato. Es la misma
                      bitácora de Auditoría (Super Admin), filtrada solo a este cliente.
                    </Typography>

                    {historialLoading && (
                      <Stack alignItems="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </Stack>
                    )}
                    {historialError && <Alert severity="error">{historialError}</Alert>}
                    {!historialLoading && !historialError && historial?.length === 0 && (
                      <Alert severity="info">Todavía no hay eventos de auditoría para este expediente.</Alert>
                    )}
                    {!historialLoading && !!historial?.length && (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Fecha</TableCell>
                              <TableCell>Servicio</TableCell>
                              <TableCell>Acción</TableCell>
                              <TableCell>Actor</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {historial.map((evento) => (
                              <TableRow key={evento.event_id}>
                                <TableCell>{new Date(evento.ocurrido_en).toLocaleString("es-MX")}</TableCell>
                                <TableCell>{friendlyServiceName(evento.servicio_origen)}</TableCell>
                                <TableCell>{friendlyActionName(evento.accion)}</TableCell>
                                <TableCell>{evento.actor_user_id}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Stack>
                )}
              </Box>
            </Paper>
          </Grid>

        </Grid>
      )}

      {kyc && (
        <MotorDocumentalDialog
          open={motorAbierto}
          onClose={() => setMotorAbierto(false)}
          kycPreseleccionado={{ id_kyc: kyc.id_kyc, id_contraparte: kyc.id_contraparte }}
          onDatosActualizados={cargar}
        />
      )}

      <Dialog open={Boolean(confirmandoEliminarDoc)} onClose={() => setConfirmandoEliminarDoc(null)}>
        <DialogTitle>¿Eliminar documento?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Vas a eliminar{" "}
            <strong>{confirmandoEliminarDoc?.denominacion || "este documento"}</strong> del expediente.
            Esto solo quita el registro de la plataforma - el archivo en Drive no se borra. Esta
            acción no se puede deshacer desde aquí.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmandoEliminarDoc(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleEliminarDocumento} disabled={eliminandoDoc}>
            {eliminandoDoc ? <CircularProgress size={20} color="inherit" /> : "Eliminar documento"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
