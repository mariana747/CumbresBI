"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
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
  Eye,
  FileText,
  Flag,
  History,
  Pencil,
  Plus,
  RefreshCw,
  ShieldQuestion,
  Snowflake,
  Trash2,
  UploadCloud,
  X as CloseIcon,
} from "lucide-react";
import AppShell, { notifySolicitudEliminacionChanged } from "@/components/AppShell";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { BRAND } from "@/theme/theme";
import { SessionUser, getSession, puedeVerBitacora } from "@/lib/auth";
import { BitacoraEvento, friendlyActionName, friendlyServiceName, listBitacora } from "@/lib/audit";
import {
  AUTORIDAD_POR_TIPO_IDENTIFICACION,
  PldContraparteDoc,
  PldContraparteKyc,
  PldDatosEditables,
  PldRepresentanteLegal,
  PldSolicitudEliminacionDoc,
  aprobarKyc,
  aprobarSolicitudEliminacion,
  catalogoOcupacionPorTipoPersona,
  congelarKyc,
  crearDocumentoKyc,
  crearRepresentanteLegal,
  crearSolicitudEliminacion,
  editarKyc,
  editarRepresentanteLegal,
  eliminarDocumentoKyc,
  eliminarRepresentanteLegal,
  esCampoVisibleParaTipoPersona,
  etiquetaNombreParaTipoPersona,
  getKyc,
  listRepresentantesLegales,
  listSolicitudesEliminacion,
  marcarSospechosoKyc,
  nombreParaMostrar,
  reactivarCuentaKyc,
  rechazarSolicitudEliminacion,
  subirArchivoDocumento,
  urlVerDocumento,
  verificarDocumentosKyc,
} from "@/lib/pld";
import {
  TesoreriaComplementoPago,
  TesoreriaFactura,
  TesoreriaNotaCredito,
  listComplementosPago,
  listFacturas,
  listNotasCredito,
} from "@/lib/tesoreria";

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
// "Análisis de riesgo" se queda como "próximamente" (requiere integración
// externa de KYC/AML, PEP/OFAC, ninguna elegida todavía - ver memoria de
// sesión "pld-validacion-externa-kyc-pendiente"). "Historial de
// transacciones" (02/Sep/2026, pedido explicito: "ya funciona tesorería")
// SÍ está conectado - lee en vivo Factura/ComplementoPago/NotaCredito de
// tesoreria-service, filtrado por id_contraparte (ver el useEffect de
// "transacciones" mas abajo).


// Facultades del poder notarial (02/Sep/2026) - espejo de
// PldRepresentanteLegal.FACULTAD_CHOICES en pld-service/pld/models.py.
const FACULTADES_LABELS: Record<string, string> = {
  PLEITOS_COBRANZAS: "Pleitos y cobranzas",
  ACTOS_ADMINISTRACION: "Actos de administración",
  ACTOS_DOMINIO: "Actos de dominio",
  PLEITOS_Y_ADMINISTRACION: "Pleitos y cobranzas + Actos de administración",
  OTRAS: "Otras",
};

// Historial de transacciones (02/Sep/2026) - fila comun para presentar
// Factura/ComplementoPago/NotaCredito de tesoreria-service en una sola
// tabla ordenada por fecha, sin exponer los ~25 campos CFDI crudos de
// cada tipo (eso ya vive en las pantallas propias de Tesoreria).
type TransaccionUnificada = {
  id: string;
  tipo: "Factura" | "Complemento de pago" | "Nota de crédito";
  folio: string;
  fecha: string | null;
  monto: string | null;
  estado: string | null;
};

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
      // tipo_persona (02/Sep/2026, pedido explicito) - va justo despues
      // del nombre porque el catalogo de "Ocupación / actividad económica"
      // mas abajo depende de este valor (fisica vs moral, catalogo UIF).
      { campo: "tipo_persona", label: "Tipo de persona" },
      // nombre/apellido_paterno/apellido_materno (02/Sep/2026, pedido
      // explicito) - solo se muestran para Fisica (ver
      // esCampoVisibleParaTipoPersona), reemplazan a nombre_completo que
      // en ese caso se oculta. Moral/Fideicomiso siguen usando
      // nombre_completo unico (Denominación o Razón Social).
      { campo: "nombre", label: "Nombre(s)" },
      { campo: "apellido_paterno", label: "Primer apellido" },
      { campo: "apellido_materno", label: "Segundo apellido" },
      { campo: "curp", label: "CURP" },
      { campo: "rfc", label: "RFC" },
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
      { campo: "telefono_sms", label: "Celular" },
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
  // Preview embebido de "Ver documento" (01/Sep/2026) - antes abria Drive en
  // pestaña nueva; ahora se ve en un dialogo dentro de la misma pantalla,
  // igual que el panel lateral del Motor Documental en Facturas/Flujos.
  const [previewDoc, setPreviewDoc] = useState<PldContraparteDoc | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [verificarError, setVerificarError] = useState<string | null>(null);
  const [verificarMensaje, setVerificarMensaje] = useState<string | null>(null);
  const [confirmandoEliminarDoc, setConfirmandoEliminarDoc] = useState<PldContraparteDoc | null>(null);
  const [eliminandoDoc, setEliminandoDoc] = useState(false);
  const [subiendoDoc, setSubiendoDoc] = useState(false);

  // Solicitud de eliminacion (25/Ago/2026, requerimiento real del cliente):
  // el analista (puedeEditar) ya no puede borrar un archivo directo, pide
  // su eliminacion con una razon breve; solo Admin (puedeEliminarArchivos)
  // aprueba/rechaza. solicitudesPendientes son las de este expediente
  // (filtradas del lado del cliente contra kyc.documentos, el endpoint no
  // tiene ?kyc= propio).
  const [solicitandoEliminarDoc, setSolicitandoEliminarDoc] = useState<PldContraparteDoc | null>(null);
  const [razonSolicitud, setRazonSolicitud] = useState("");
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState<PldSolicitudEliminacionDoc[]>([]);
  const [resolviendoSolicitud, setResolviendoSolicitud] = useState<string | null>(null);
  const [historial, setHistorial] = useState<BitacoraEvento[] | null>(null);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);
  // Representantes legales (02/Sep/2026, pedido explicito, solo aplica a
  // Moral - ver tab "Representantes legales"). Mismo patron de carga
  // perezosa que historial de auditoria arriba.
  const [representantes, setRepresentantes] = useState<PldRepresentanteLegal[] | null>(null);
  const [representantesLoading, setRepresentantesLoading] = useState(false);
  const [representantesError, setRepresentantesError] = useState<string | null>(null);
  const [dialogRepAbierto, setDialogRepAbierto] = useState(false);
  const [editandoRep, setEditandoRep] = useState<PldRepresentanteLegal | null>(null);
  const [formRep, setFormRep] = useState<Partial<PldRepresentanteLegal>>({});
  const [guardandoRep, setGuardandoRep] = useState(false);
  const [errorRep, setErrorRep] = useState<string | null>(null);
  // Historial de transacciones (02/Sep/2026, pedido explicito: "hay que
  // trabajar en el historial de transacciones de pld, ya que funciona
  // tesoreria") - antes era un placeholder "Proximamente" que asumia que
  // Tesoreria no existia todavia; ya existe y tiene Factura/Complemento
  // de Pago/Nota de Credito con FK real a la contraparte. Lectura directa
  // desde el frontend a tesoreria-service (mismo patron que
  // ContraparteSelector.tsx en esta misma pantalla) - list/retrieve de
  // esos 3 catalogos es lectura abierta, sin perm_key especifico, no hace
  // falta que pld-service backend medie.
  const [transacciones, setTransacciones] = useState<TransaccionUnificada[] | null>(null);
  const [transaccionesLoading, setTransaccionesLoading] = useState(false);
  const [transaccionesError, setTransaccionesError] = useState<string | null>(null);
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

  const autoVerificadoRef = useRef(false);

  useEffect(() => {
    cargar();
    getSession().then(setSession);
    setHistorial(null);
    autoVerificadoRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.idKyc]);

  const puedeAprobar = session?.perm_keys.includes("pld-compliance.aprobar") ?? false;
  const puedeCrear = session?.perm_keys.includes("pld-compliance.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("pld-compliance.editar") ?? false;

  // Verificacion automatica contra Drive al abrir el expediente (25/Ago/2026,
  // hallazgo real: un documento puede desaparecer de Drive sin que nadie
  // pase por aqui a darle clic manual a "Verificar en Drive" - la lista se
  // quedaba mostrando registros huerfanos hasta que alguien se acordara).
  // Silenciosa (sin los mensajes/spinner del boton manual) y solo una vez
  // por expediente abierto - autoVerificadoRef evita que un re-render
  // dispare otra verificacion de la nada. Mismo permiso que el boton
  // manual (pld-compliance.editar, ver verificar_documentos en
  // pld/views.py) - si el usuario no tiene permiso, no se intenta.
  useEffect(() => {
    if (!kyc || autoVerificadoRef.current || !puedeEditar || kyc.documentos.length === 0) return;
    autoVerificadoRef.current = true;
    verificarDocumentosKyc(params.idKyc, session?.user_id)
      .then((resultado) => {
        if (resultado.documentos_eliminados.length > 0) cargar();
      })
      .catch(() => {
        // silencioso a proposito - si falla, el boton manual sigue
        // disponible; no vale la pena molestar al analista con un error de
        // una verificacion que el ni pidio.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kyc, puedeEditar]);
  // 25/Ago/2026 (requerimiento real del cliente: "nadie modifica en Drive,
  // todo desde CumbresBI") - agregar/eliminar un archivo es exclusivo de
  // Admin (pld-documentos.crear/editar), separado de puedeEditar (datos
  // escritos del expediente, que el analista conserva). Ver
  // services/pld-service/pld/views.py::PldContraparteDocViewSet.get_permissions.
  const puedeGestionarArchivos = session?.perm_keys.includes("pld-documentos.crear") ?? false;
  const puedeEliminarArchivos = session?.perm_keys.includes("pld-documentos.editar") ?? false;
  const puedeVerHistorial = puedeVerBitacora(session);
  // esPersonaMoral (02/Sep/2026, pedido explicito) - gate del tab
  // "Representantes legales", solo tiene sentido para Moral (una persona
  // Fisica no tiene representante legal de si misma).
  const esPersonaMoral = kyc?.tipo_persona === "moral";

  // Solicitudes de eliminacion pendientes de este expediente (25/Ago/2026)
  // - visibles tanto para quien solicita (el analista quiere ver que sigue
  // pendiente) como para quien resuelve (Admin). Filtro del lado del
  // cliente contra los documentos actuales del expediente - el endpoint no
  // tiene ?kyc= propio (ver lib/pld.ts::listSolicitudesEliminacion).
  function cargarSolicitudesPendientes(idsDocumentos: Set<string>) {
    listSolicitudesEliminacion({ estado: "PENDIENTE" })
      .then((todas) => setSolicitudesPendientes(todas.filter((s) => s.documento && idsDocumentos.has(s.documento))))
      .catch(() => setSolicitudesPendientes([]));
  }
  useEffect(() => {
    if (!kyc || (!puedeEditar && !puedeEliminarArchivos)) return;
    cargarSolicitudesPendientes(new Set(kyc.documentos.map((d) => d.id_kyc_doc)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kyc, puedeEditar, puedeEliminarArchivos]);

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

  function cargarRepresentantes() {
    if (!kyc) return;
    setRepresentantesLoading(true);
    setRepresentantesError(null);
    listRepresentantesLegales(kyc.id_kyc)
      .then(setRepresentantes)
      .catch((err) => setRepresentantesError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setRepresentantesLoading(false));
  }

  useEffect(() => {
    if (tab !== 5 || !kyc || !esPersonaMoral || representantes !== null) return;
    cargarRepresentantes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kyc, esPersonaMoral]);

  useEffect(() => {
    if (tab !== 3 || !kyc || transacciones !== null) return;
    setTransaccionesLoading(true);
    setTransaccionesError(null);
    Promise.all([
      listFacturas(undefined, kyc.id_contraparte),
      listComplementosPago(undefined, kyc.id_contraparte),
      listNotasCredito(undefined, kyc.id_contraparte),
    ])
      .then(([facturas, complementos, notas]) => {
        const filaFactura = (f: TesoreriaFactura): TransaccionUnificada => ({
          id: `factura-${f.id}`,
          tipo: "Factura",
          folio: f.comprobante_folio || f.timbre_uuid,
          fecha: f.comprobante_fecha,
          monto: f.comprobante_total,
          estado: f.estado,
        });
        const filaComplemento = (c: TesoreriaComplementoPago): TransaccionUnificada => ({
          id: `complemento-${c.id}`,
          tipo: "Complemento de pago",
          folio: c.folio || c.timbre_uuid,
          fecha: c.fecha,
          monto: c.total,
          estado: c.estado,
        });
        const filaNota = (n: TesoreriaNotaCredito): TransaccionUnificada => ({
          id: `nota-${n.id}`,
          tipo: "Nota de crédito",
          folio: n.comprobante_folio || n.timbre_uuid,
          fecha: n.comprobante_fecha,
          monto: n.comprobante_total,
          estado: n.estado,
        });
        const filas = [
          ...facturas.map(filaFactura),
          ...complementos.map(filaComplemento),
          ...notas.map(filaNota),
        ].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
        setTransacciones(filas);
      })
      .catch((err) => setTransaccionesError(err instanceof Error ? err.message : "Error al cargar"))
      .finally(() => setTransaccionesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kyc]);

  function abrirNuevoRep() {
    setEditandoRep(null);
    setFormRep({ tipo: "REPRESENTANTE_LEGAL", poder_vigente: true });
    setErrorRep(null);
    setDialogRepAbierto(true);
  }

  function abrirEditarRep(rep: PldRepresentanteLegal) {
    setEditandoRep(rep);
    setFormRep(rep);
    setErrorRep(null);
    setDialogRepAbierto(true);
  }

  async function handleGuardarRep() {
    if (!kyc || !formRep.nombre_completo?.trim()) {
      setErrorRep("El nombre completo es requerido.");
      return;
    }
    setGuardandoRep(true);
    setErrorRep(null);
    try {
      if (editandoRep) {
        await editarRepresentanteLegal(editandoRep.id_representante, formRep, session?.user_id);
      } else {
        await crearRepresentanteLegal(kyc.id_kyc, formRep, session?.user_id);
      }
      setDialogRepAbierto(false);
      cargarRepresentantes();
    } catch (err) {
      setErrorRep(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardandoRep(false);
    }
  }

  async function handleEliminarRep(rep: PldRepresentanteLegal) {
    if (!window.confirm(`¿Borrar a ${rep.nombre_completo}? Esta acción no se puede deshacer.`)) return;
    try {
      await eliminarRepresentanteLegal(rep.id_representante);
      cargarRepresentantes();
    } catch (err) {
      setRepresentantesError(err instanceof Error ? err.message : "Error al borrar");
    }
  }

  const denominacionesDuplicadas = (() => {
    const conteo = new Map<string, number>();
    for (const doc of kyc?.documentos ?? []) {
      if (!doc.denominacion) continue;
      const clave = doc.denominacion.trim().toLowerCase();
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    return new Set([...conteo.entries()].filter(([, n]) => n > 1).map(([clave]) => clave));
  })();

  // "Se queda el ultimo que se subio" (25/Ago/2026, requerimiento real del
  // cliente) - no se borra nada solo (asi se decidio: avisar y dejar que
  // Admin resuelva), solo se marca cual es el vigente (el mas reciente) de
  // cada grupo de duplicados por nombre - el resto son candidatos a pedir
  // su eliminacion.
  const idsDocumentoVigentePorDuplicado = (() => {
    const porNombre = new Map<string, PldContraparteDoc[]>();
    for (const doc of kyc?.documentos ?? []) {
      if (!doc.denominacion) continue;
      const clave = doc.denominacion.trim().toLowerCase();
      porNombre.set(clave, [...(porNombre.get(clave) ?? []), doc]);
    }
    const vigentes = new Set<string>();
    for (const docs of porNombre.values()) {
      if (docs.length < 2) continue;
      const masReciente = docs.reduce((a, b) => (a.created_at > b.created_at ? a : b));
      vigentes.add(masReciente.id_kyc_doc);
    }
    return vigentes;
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
      // "" -> null antes de mandar (02/Sep/2026, hallazgo real: "Fecha con
      // formato erróneo... PLD-400") - handleIniciarEdicion llena el
      // formulario con "" para cualquier campo vacio (kyc[campo] ?? ""),
      // y si el analista no toca ese campo (ej. fecha_nac_const en un
      // <input type="date">, que tambien produce "" cuando esta vacio) se
      // reenvia tal cual - el backend espera null para un DateField vacio,
      // no una cadena vacia, y DRF lo rechaza como formato invalido.
      const campos = Object.fromEntries(
        Object.entries(editandoCampos).map(([campo, valor]) => [campo, valor === "" ? null : valor])
      ) as PldDatosEditables;
      await editarKyc(params.idKyc, campos, session?.user_id);
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
      const resultado = await verificarDocumentosKyc(params.idKyc, session?.user_id);
      const eliminados = resultado.documentos_eliminados;

      if (eliminados.length === 0) {
        setVerificarMensaje("Todo sigue igual - sin cambios en Drive.");
      } else {
        setVerificarMensaje(
          `Se quitaron ${eliminados.length} documento(s) que ya no están en Drive: ${eliminados
            .map((d) => d.denominacion || "sin nombre")
            .join(", ")}.`
        );
      }
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

  async function handleSolicitarEliminacion() {
    if (!solicitandoEliminarDoc || !razonSolicitud.trim() || !session?.user_id || !kyc) return;
    setEnviandoSolicitud(true);
    try {
      await crearSolicitudEliminacion({
        idKycDoc: solicitandoEliminarDoc.id_kyc_doc,
        razon: razonSolicitud.trim(),
        solicitadoPor: session.user_id,
      });
      setSolicitandoEliminarDoc(null);
      setRazonSolicitud("");
      cargarSolicitudesPendientes(new Set(kyc.documentos.map((d) => d.id_kyc_doc)));
      // Avisa a la campana de AppShell (25/Ago/2026, requerimiento real:
      // "en la sesion de admin en la campana debe llegar la notificacion")
      // - sin esto, Admin la veria hasta el proximo poll de 60s.
      notifySolicitudEliminacionChanged();
    } catch (err) {
      setVerificarError(err instanceof Error ? err.message : "Error al enviar la solicitud");
    } finally {
      setEnviandoSolicitud(false);
    }
  }

  async function handleResolverSolicitud(solicitud: PldSolicitudEliminacionDoc, aprobar: boolean) {
    setResolviendoSolicitud(solicitud.id_solicitud);
    try {
      const resolver = aprobar ? aprobarSolicitudEliminacion : rechazarSolicitudEliminacion;
      await resolver(solicitud.id_solicitud, session?.user_id);
      cargar();
      notifySolicitudEliminacionChanged();
    } catch (err) {
      setVerificarError(err instanceof Error ? err.message : "Error al resolver la solicitud");
    } finally {
      setResolviendoSolicitud(null);
    }
  }

  // Uploader interno (25/Ago/2026, requerimiento real del cliente: "nadie
  // modifica en Drive, todo desde CumbresBI") - unico camino real para
  // agregar un archivo desde ahora: crea el registro de metadata y sube el
  // archivo real a Drive via drive-service (dos llamadas, mismo criterio
  // que PldContraparteDocViewSet.subir en el backend). Gateado por
  // puedeGestionarArchivos (pld-documentos.crear), no puedeCrear.
  async function handleSubirDocumento(archivo: File) {
    if (!kyc) return;
    setSubiendoDoc(true);
    setVerificarError(null);
    let docCreado: PldContraparteDoc | null = null;
    try {
      docCreado = await crearDocumentoKyc(kyc.id_kyc, archivo.name, session?.user_id);
      await subirArchivoDocumento(docCreado.id_kyc_doc, archivo, session?.user_id);
      cargar();
    } catch (err) {
      // 25/Ago/2026 (hallazgo real: si el paso de crear metadata funciona
      // pero subir el archivo falla, quedaba un registro huerfano sin
      // drive_file_id - "Verificar en Drive" no lo limpia porque solo
      // revisa documentos que SI tienen drive_file_id. Un reintento
      // entonces creaba otro con el mismo nombre, pareciendo un duplicado
      // aunque en Drive solo existiera un archivo real). Se borra el
      // registro a medias en vez de dejarlo tirado.
      if (docCreado) {
        await eliminarDocumentoKyc(docCreado.id_kyc_doc, session?.user_id).catch(() => {});
        cargar();
      }
      setVerificarError(err instanceof Error ? err.message : "Error al subir el documento");
    } finally {
      setSubiendoDoc(false);
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
                {/* 02/Sep/2026, hallazgo real: "porque el avatar es un
                numero?" - antes siempre mostraba las primeras 2 letras de
                id_contraparte (un hex tipo "8d1bfbfa"), sin importar si ya
                habia un nombre real capturado. Ahora usa las iniciales del
                nombre cuando existe (primera letra de las 2 primeras
                palabras, ej. "María López" -> "ML"), y solo cae de vuelta
                al id si todavia no hay nombre (alta autonoma sin
                completar). nombreParaMostrar() (02/Sep/2026, tras dividir
                el nombre en 3 campos para Fisica) junta nombre/apellidos
                para Fisica en vez de leer nombre_completo, que ahi se
                queda vacio. */}
                {nombreParaMostrar(kyc)
                  ? nombreParaMostrar(kyc)
                      .trim()
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((palabra) => palabra[0])
                      .join("")
                      .toUpperCase()
                  : kyc.id_contraparte.slice(0, 2).toUpperCase()}
              </Avatar>
              <Typography variant="subtitle1" fontWeight={600}>
                {nombreParaMostrar(kyc) || `Contraparte ${kyc.id_contraparte}`}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {nombreParaMostrar(kyc) ? `Contraparte ${kyc.id_contraparte}` : "Nombre sin capturar todavía"}
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
              <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{ borderBottom: "1px solid", borderColor: "divider", px: 2 }}
              >
                <Tab value={0} label="Información general" />
                <Tab value={1} label="Análisis de riesgo" />
                <Tab value={2} label="Documentos KYC" />
                <Tab value={3} label="Historial de transacciones" />
                {puedeVerHistorial && (
                  <Tab
                    value={4}
                    label="Historial de auditoría"
                    icon={<History size={16} strokeWidth={1.5} />}
                    iconPosition="start"
                  />
                )}
                {/* Representantes legales (02/Sep/2026, pedido explicito:
                "Incluir como requisito obligatorio los datos... del
                Representante Legal / Apoderado" para Moral) - value=5
                explicito (igual que los demas, ver arriba) para que el
                indice no se corra cuando puedeVerHistorial es false y ese
                Tab de enmedio no se renderiza. */}
                {esPersonaMoral && <Tab value={5} label="Representantes legales" />}
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
                        <Grid container rowSpacing={2} columnSpacing={2}>
                          {grupo.campos
                            .filter(({ campo }) =>
                              esCampoVisibleParaTipoPersona(
                                campo,
                                editandoCampos ? editandoCampos.tipo_persona : kyc.tipo_persona
                              )
                            )
                            .map(({ campo, label }) =>
                            editandoCampos !== null ? campo === "tipo_identificacion" ? (
                              <Grid item xs={12} sm={6} key={campo}>
                                <FormControl size="small" fullWidth>
                                  <InputLabel id="tipo-identificacion-label">{label}</InputLabel>
                                  <Select
                                    labelId="tipo-identificacion-label"
                                    label={label}
                                    value={editandoCampos.tipo_identificacion ?? ""}
                                    onChange={(e) => {
                                      const tipo = e.target.value;
                                      // Autoridad emisora se llena sola segun
                                      // el catalogo (02/Sep/2026, pedido
                                      // explicito) - solo cuando el tipo
                                      // elegido tiene una autoridad conocida;
                                      // si el analista despues quiere
                                      // corregirla a mano, el campo de abajo
                                      // sigue siendo editable normal.
                                      setEditandoCampos((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              tipo_identificacion: tipo,
                                              ...(AUTORIDAD_POR_TIPO_IDENTIFICACION[tipo]
                                                ? { autoridad_identificacion: AUTORIDAD_POR_TIPO_IDENTIFICACION[tipo] }
                                                : {}),
                                            }
                                          : prev
                                      );
                                    }}
                                  >
                                    <MenuItem value="">
                                      <em>Sin especificar</em>
                                    </MenuItem>
                                    {Object.keys(AUTORIDAD_POR_TIPO_IDENTIFICACION).map((tipo) => (
                                      <MenuItem key={tipo} value={tipo}>
                                        {tipo}
                                      </MenuItem>
                                    ))}
                                    <MenuItem value="Otra">Otra</MenuItem>
                                  </Select>
                                </FormControl>
                              </Grid>
                            ) : campo === "tipo_persona" ? (
                              <Grid item xs={12} sm={6} key={campo}>
                                <FormControl size="small" fullWidth>
                                  <InputLabel id="tipo-persona-kyc-label">{label}</InputLabel>
                                  <Select
                                    labelId="tipo-persona-kyc-label"
                                    label={label}
                                    value={editandoCampos.tipo_persona ?? ""}
                                    onChange={(e) => {
                                      const tipoPersona = e.target.value;
                                      // Limpia ocupacion_act_economica al
                                      // cambiar de tipo (02/Sep/2026) - un
                                      // codigo del catalogo UIF de fisica no
                                      // tiene sentido guardado para una moral
                                      // y viceversa (ver
                                      // catalogoOcupacionPorTipoPersona).
                                      setEditandoCampos((prev) =>
                                        prev
                                          ? { ...prev, tipo_persona: tipoPersona, ocupacion_act_economica: "" }
                                          : prev
                                      );
                                    }}
                                  >
                                    <MenuItem value="">
                                      <em>Sin especificar</em>
                                    </MenuItem>
                                    <MenuItem value="fisica">Física</MenuItem>
                                    <MenuItem value="moral">Moral</MenuItem>
                                    <MenuItem value="fideicomiso">Fideicomiso</MenuItem>
                                  </Select>
                                </FormControl>
                              </Grid>
                            ) : campo === "ocupacion_act_economica" ? (
                              <Grid item xs={12} sm={6} key={campo}>
                                <FormControl size="small" fullWidth disabled={!editandoCampos.tipo_persona}>
                                  <InputLabel id="ocupacion-uif-label">{label}</InputLabel>
                                  <Select
                                    labelId="ocupacion-uif-label"
                                    label={label}
                                    value={editandoCampos.ocupacion_act_economica ?? ""}
                                    onChange={(e) =>
                                      setEditandoCampos((prev) =>
                                        prev ? { ...prev, ocupacion_act_economica: e.target.value } : prev
                                      )
                                    }
                                  >
                                    <MenuItem value="">
                                      <em>Sin especificar</em>
                                    </MenuItem>
                                    {Object.entries(catalogoOcupacionPorTipoPersona(editandoCampos.tipo_persona)).map(
                                      ([codigo, etiqueta]) => (
                                        <MenuItem key={codigo} value={`${codigo} – ${etiqueta}`}>
                                          {codigo} – {etiqueta}
                                        </MenuItem>
                                      )
                                    )}
                                  </Select>
                                  {!editandoCampos.tipo_persona && (
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                                      Elige el tipo de persona primero
                                    </Typography>
                                  )}
                                </FormControl>
                              </Grid>
                            ) : (
                              <Grid item xs={12} sm={6} key={campo}>
                                <TextField
                                  size="small"
                                  fullWidth
                                  // "Denominación o Razón Social" para Moral
                                  // (02/Sep/2026, pedido explicito) - solo
                                  // afecta nombre_completo, el resto de los
                                  // campos usa su label normal.
                                  label={
                                    campo === "nombre_completo"
                                      ? etiquetaNombreParaTipoPersona(
                                          editandoCampos ? editandoCampos.tipo_persona : kyc.tipo_persona
                                        )
                                      : label
                                  }
                                  // Selector de calendario nativo para fechas
                                  // (25/Ago/2026) - sin agregar una libreria
                                  // nueva, <input type="date"> del navegador
                                  // ya trae el picker.
                                  type={campo === "fecha_nac_const" ? "date" : "text"}
                                  InputLabelProps={campo === "fecha_nac_const" ? { shrink: true } : undefined}
                                  // lang="es-MX" (02/Sep/2026, hallazgo real:
                                  // "esto esta en mal orden" - el selector
                                  // nativo de <input type="date"> mostraba
                                  // el formato MM/DD/YYYY del navegador en
                                  // ingles por default; Chrome respeta el
                                  // atributo lang del propio input para
                                  // decidir el orden de dia/mes/año que
                                  // muestra (el value que SI se guarda
                                  // siempre es YYYY-MM-DD, esto solo cambia
                                  // como se ve).
                                  inputProps={
                                    campo === "fecha_nac_const"
                                      ? { lang: "es-MX" }
                                      : campo === "dom_cp" || campo === "dom_corresp_dom_cp"
                                        ? // 5 digitos numericos (02/Sep/2026,
                                          // pedido explicito del checklist de
                                          // cumplimiento) - maxLength/inputMode
                                          // son solo ayuda visual, la
                                          // validacion real esta en el backend
                                          // (PldContraparteKycSerializer.validate).
                                          { maxLength: 5, inputMode: "numeric" }
                                        : undefined
                                  }
                                  error={
                                    ((campo === "dom_cp" || campo === "dom_corresp_dom_cp") &&
                                      !!editandoCampos[campo] &&
                                      !/^\d{5}$/.test(editandoCampos[campo] ?? "")) ||
                                    // Colonia no puede ser solo numeros
                                    // (02/Sep/2026, pedido explicito) -
                                    // mismo criterio visual que CP, la
                                    // validacion real esta en el backend.
                                    ((campo === "dom_colonia" || campo === "dom_corresp_dom_colonia") &&
                                      /^\d+$/.test((editandoCampos[campo] ?? "").trim()))
                                  }
                                  helperText={
                                    (campo === "dom_cp" || campo === "dom_corresp_dom_cp") &&
                                    !!editandoCampos[campo] &&
                                    !/^\d{5}$/.test(editandoCampos[campo] ?? "")
                                      ? "Debe ser un código postal de 5 dígitos numéricos"
                                      : (campo === "dom_colonia" || campo === "dom_corresp_dom_colonia") &&
                                          /^\d+$/.test((editandoCampos[campo] ?? "").trim())
                                        ? "La colonia no puede ser solo números"
                                        : undefined
                                  }
                                  value={editandoCampos[campo] ?? ""}
                                  onChange={(e) => {
                                    // Mayusculas automaticas (02/Sep/2026,
                                    // pedido explicito) - convencion real de
                                    // formularios oficiales mexicanos
                                    // (RFC/CURP/nombre siempre en
                                    // mayusculas). No aplica a fecha.
                                    const valor =
                                      campo === "fecha_nac_const" ? e.target.value : e.target.value.toUpperCase();
                                    setEditandoCampos((prev) => (prev ? { ...prev, [campo]: valor } : prev));
                                  }}
                                />
                              </Grid>
                            ) : (
                              <Grid item xs={12} sm={6} key={campo}>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1.3 }}>
                                  {campo === "nombre_completo" ? etiquetaNombreParaTipoPersona(kyc.tipo_persona) : label}
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
                      <Grid container rowSpacing={2} columnSpacing={2}>
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
                        {puedeGestionarArchivos && kyc.documentos.length > 0 && (
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
                        {puedeGestionarArchivos && (
                          <Button
                            component="label"
                            size="small"
                            variant="outlined"
                            startIcon={
                              subiendoDoc ? <CircularProgress size={16} /> : <UploadCloud size={16} strokeWidth={1.5} />
                            }
                            disabled={subiendoDoc}
                            sx={{ whiteSpace: "nowrap" }}
                          >
                            Subir documento
                            <input
                              type="file"
                              hidden
                              onChange={(e) => {
                                const archivo = e.target.files?.[0];
                                e.target.value = "";
                                if (archivo) handleSubirDocumento(archivo);
                              }}
                            />
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

                    {/* 25/Ago/2026 (requerimiento real del cliente) - solo
                        Admin resuelve las solicitudes de eliminacion; el
                        analista ya ve el estado "Eliminación solicitada"
                        en el chip de cada documento, no necesita este
                        panel. */}
                    {puedeEliminarArchivos && solicitudesPendientes.length > 0 && (
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">
                          Solicitudes de eliminación pendientes ({solicitudesPendientes.length})
                        </Typography>
                        {solicitudesPendientes.map((solicitud) => (
                          <Paper key={solicitud.id_solicitud} variant="outlined" sx={{ p: 1.5, bgcolor: "warning.main" }}>
                            <Stack spacing={0.5}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {solicitud.denominacion_doc || "Documento sin nombre"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {solicitud.solicitado_por}: "{solicitud.razon}"
                              </Typography>
                              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                                <Button
                                  size="small"
                                  color="error"
                                  variant="contained"
                                  disabled={resolviendoSolicitud === solicitud.id_solicitud}
                                  onClick={() => handleResolverSolicitud(solicitud, true)}
                                >
                                  Aprobar (elimina)
                                </Button>
                                <Button
                                  size="small"
                                  disabled={resolviendoSolicitud === solicitud.id_solicitud}
                                  onClick={() => handleResolverSolicitud(solicitud, false)}
                                >
                                  Rechazar
                                </Button>
                              </Stack>
                            </Stack>
                          </Paper>
                        ))}
                      </Stack>
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
                        // "Se queda el ultimo que se subio" - el mas
                        // reciente del grupo se marca vigente, el resto
                        // como duplicado viejo (candidato a solicitar su
                        // eliminacion, no se borra solo).
                        const esDuplicadoViejo = esDuplicado && !idsDocumentoVigentePorDuplicado.has(doc.id_kyc_doc);
                        const solicitudPendiente = solicitudesPendientes.find((s) => s.documento === doc.id_kyc_doc);
                        return (
                          <Paper key={doc.id_kyc_doc} variant="outlined" sx={{ p: 1.5 }}>
                            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                              <Stack direction="row" spacing={1.5} alignItems="center">
                                <FileText size={18} strokeWidth={1.5} color={BRAND.azul} />
                                <Typography variant="body2">{doc.denominacion || "Documento sin nombre"}</Typography>
                              </Stack>
                              <Stack direction="row" spacing={1} alignItems="center">
                                {/* 25/Ago/2026 (requerimiento real del cliente: "en
                                    el expediente se debe poder ver los archivos aqui
                                    mismo") - sirve el archivo real A TRAVES de
                                    pld-service (urlVerDocumento), NO del link crudo
                                    de Drive (doc.link_documento) - un analista con
                                    permiso real en CumbresBI puede no tener acceso
                                    directo a la Unidad compartida de Google, ver
                                    PldContraparteDocViewSet.ver. Sin drive_file_id
                                    (documento "solicitado" pendiente de que llegue
                                    el archivo) no hay nada que ver todavía, se
                                    deshabilita en vez de esconderse (el boton no
                                    "salta" de lugar cuando el archivo si llega).
                                    01/Sep/2026: ya no abre pestaña nueva, se ve en
                                    DocumentoPreviewDialog (mismo criterio que el
                                    panel lateral del Motor Documental) - el
                                    endpoint ver() ahora manda CSP frame-ancestors
                                    para permitir el embed. */}
                                <IconButton
                                  size="small"
                                  onClick={() => setPreviewDoc(doc)}
                                  disabled={!doc.drive_file_id}
                                  aria-label="Ver documento"
                                  title="Ver documento"
                                >
                                  <Eye size={16} strokeWidth={1.5} />
                                </IconButton>
                                {esDuplicado && (
                                  <Chip
                                    size="small"
                                    color="warning"
                                    icon={<Copy size={14} strokeWidth={1.5} />}
                                    label={esDuplicadoViejo ? "Duplicado (no vigente)" : "Vigente"}
                                  />
                                )}
                                <Chip size="small" label={doc.status ?? "Sin estado"} />
                                {solicitudPendiente && (
                                  <Chip size="small" color="info" label="Eliminación solicitada" />
                                )}
                                {puedeEliminarArchivos ? (
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label="Eliminar documento"
                                    onClick={() => setConfirmandoEliminarDoc(doc)}
                                  >
                                    <Trash2 size={16} strokeWidth={1.5} />
                                  </IconButton>
                                ) : (
                                  puedeEditar && (
                                    // 25/Ago/2026 (requerimiento real del
                                    // cliente) - el analista ya no puede
                                    // borrar directo, pide la eliminacion
                                    // con una razon; Admin la aprueba o
                                    // rechaza.
                                    <IconButton
                                      size="small"
                                      color="warning"
                                      aria-label="Solicitar eliminación"
                                      title="Solicitar eliminación"
                                      disabled={Boolean(solicitudPendiente)}
                                      onClick={() => setSolicitandoEliminarDoc(doc)}
                                    >
                                      <Flag size={16} strokeWidth={1.5} />
                                    </IconButton>
                                  )
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
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                      Facturas, complementos de pago y notas de crédito de esta contraparte en
                      tesoreria-service — lectura directa, en tiempo real, sin duplicar datos aquí.
                    </Typography>
                    {transaccionesLoading && (
                      <Stack alignItems="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </Stack>
                    )}
                    {transaccionesError && <Alert severity="error">{transaccionesError}</Alert>}
                    {!transaccionesLoading && !transaccionesError && transacciones?.length === 0 && (
                      <Alert severity="info">
                        Todavía no hay facturas, complementos de pago ni notas de crédito para esta
                        contraparte en Tesorería.
                      </Alert>
                    )}
                    {!transaccionesLoading && !!transacciones?.length && (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Tipo</TableCell>
                              <TableCell>Folio / UUID</TableCell>
                              <TableCell>Fecha</TableCell>
                              <TableCell align="right">Monto</TableCell>
                              <TableCell>Estado</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {transacciones.map((t) => (
                              <TableRow key={t.id}>
                                <TableCell>{t.tipo}</TableCell>
                                <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{t.folio}</TableCell>
                                <TableCell>
                                  {t.fecha ? new Date(t.fecha).toLocaleDateString("es-MX") : "—"}
                                </TableCell>
                                <TableCell align="right">
                                  {t.monto
                                    ? Number(t.monto).toLocaleString("es-MX", {
                                        style: "currency",
                                        currency: "MXN",
                                      })
                                    : "—"}
                                </TableCell>
                                <TableCell>{t.estado || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Stack>
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

                {tab === 5 && esPersonaMoral && (
                  <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        Representantes legales, apoderados y beneficiarios controladores de esta empresa —
                        pedido de cumplimiento: al menos uno antes de aprobar el expediente.
                      </Typography>
                      {puedeCrear && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Plus size={16} strokeWidth={1.5} />}
                          onClick={abrirNuevoRep}
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          Agregar
                        </Button>
                      )}
                    </Stack>

                    {representantesLoading && (
                      <Stack alignItems="center" sx={{ py: 4 }}>
                        <CircularProgress size={24} />
                      </Stack>
                    )}
                    {representantesError && <Alert severity="error">{representantesError}</Alert>}
                    {!representantesLoading && !representantesError && representantes?.length === 0 && (
                      <Alert severity="warning">
                        Todavía no hay ningún representante legal capturado para esta empresa.
                      </Alert>
                    )}
                    {!representantesLoading &&
                      representantes?.map((rep) => (
                        <Paper key={rep.id_representante} variant="outlined" sx={{ p: 2 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Stack spacing={0.5}>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="subtitle2">{rep.nombre_completo}</Typography>
                                <Chip
                                  size="small"
                                  label={rep.tipo === "APODERADO" ? "Apoderado" : "Representante legal"}
                                  variant="outlined"
                                />
                                {rep.es_principal_del_tramite && (
                                  <Chip size="small" color="primary" label="Principal del trámite" />
                                )}
                                {rep.es_beneficiario_controlador && (
                                  <Chip
                                    size="small"
                                    color="warning"
                                    label={`Beneficiario controlador${
                                      rep.porcentaje_participacion ? ` (${rep.porcentaje_participacion}%)` : ""
                                    }`}
                                  />
                                )}
                                {!rep.poder_vigente && rep.poder_numero_escritura && (
                                  <Chip size="small" color="error" label="Poder no vigente" />
                                )}
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {rep.rfc && `RFC: ${rep.rfc}`}
                                {rep.rfc && rep.curp && " · "}
                                {rep.curp && `CURP: ${rep.curp}`}
                              </Typography>
                              {rep.poder_numero_escritura && (
                                <Typography variant="caption" color="text.secondary">
                                  Escritura {rep.poder_numero_escritura}
                                  {rep.poder_notario_nombre && ` — Notario ${rep.poder_notario_nombre}`}
                                  {rep.poder_notario_numero && ` (No. ${rep.poder_notario_numero})`}
                                  {rep.poder_facultades && ` — ${FACULTADES_LABELS[rep.poder_facultades]}`}
                                </Typography>
                              )}
                            </Stack>
                            {puedeEditar && (
                              <Stack direction="row" spacing={0.5}>
                                <IconButton size="small" onClick={() => abrirEditarRep(rep)} aria-label="Editar">
                                  <Pencil size={16} strokeWidth={1.5} />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleEliminarRep(rep)}
                                  aria-label="Borrar"
                                >
                                  <Trash2 size={16} strokeWidth={1.5} />
                                </IconButton>
                              </Stack>
                            )}
                          </Stack>
                        </Paper>
                      ))}
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

      <DocumentoPreviewDialog
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        url={previewDoc?.drive_file_id ? urlVerDocumento(previewDoc.id_kyc_doc) : null}
        titulo={previewDoc?.denominacion || "Documento"}
      />

      <Dialog open={dialogRepAbierto} onClose={() => setDialogRepAbierto(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editandoRep ? `Editar Representante` : "Nuevo Representante Legal"}
          <IconButton onClick={() => setDialogRepAbierto(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {errorRep && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorRep}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Nombre completo"
              fullWidth
              value={formRep.nombre_completo ?? ""}
              onChange={(e) => setFormRep({ ...formRep, nombre_completo: e.target.value.toUpperCase() })}
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="rep-tipo-label">Tipo</InputLabel>
              <Select
                labelId="rep-tipo-label"
                label="Tipo"
                value={formRep.tipo ?? "REPRESENTANTE_LEGAL"}
                onChange={(e) =>
                  setFormRep({ ...formRep, tipo: e.target.value as PldRepresentanteLegal["tipo"] })
                }
              >
                <MenuItem value="REPRESENTANTE_LEGAL">Representante legal</MenuItem>
                <MenuItem value="APODERADO">Apoderado</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!formRep.es_principal_del_tramite}
                  onChange={(e) => setFormRep({ ...formRep, es_principal_del_tramite: e.target.checked })}
                />
              }
              label="Es quien firma este trámite"
            />
            {/* Beneficiario Controlador (02/Sep/2026, pedido explicito: "no
            confundirlos... un representante legal tiene poder de firma,
            pero el Beneficiario Controlador es quien realmente posee el
            control o mas del 25% de las acciones") - flag independiente
            de "tipo", puede marcarse aunque tambien sea representante. */}
            <Divider />
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!formRep.es_beneficiario_controlador}
                  onChange={(e) =>
                    setFormRep({ ...formRep, es_beneficiario_controlador: e.target.checked })
                  }
                />
              }
              label="También es beneficiario controlador (posee >25% o controla la empresa)"
            />
            {formRep.es_beneficiario_controlador && (
              <TextField
                size="small"
                label="% de participación"
                type="number"
                inputProps={{ min: 0, max: 100, step: "0.01" }}
                value={formRep.porcentaje_participacion ?? ""}
                onChange={(e) => setFormRep({ ...formRep, porcentaje_participacion: e.target.value })}
              />
            )}
            <Divider />
            <Typography variant="overline" color="text.secondary">
              Identificación
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="RFC"
                fullWidth
                value={formRep.rfc ?? ""}
                onChange={(e) => setFormRep({ ...formRep, rfc: e.target.value.toUpperCase() })}
              />
              <TextField
                size="small"
                label="CURP"
                fullWidth
                value={formRep.curp ?? ""}
                onChange={(e) => setFormRep({ ...formRep, curp: e.target.value.toUpperCase() })}
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Tipo de identificación"
                fullWidth
                value={formRep.tipo_identificacion ?? ""}
                onChange={(e) => setFormRep({ ...formRep, tipo_identificacion: e.target.value.toUpperCase() })}
              />
              <TextField
                size="small"
                label="Número de identificación"
                fullWidth
                value={formRep.numero_identificacion ?? ""}
                onChange={(e) => setFormRep({ ...formRep, numero_identificacion: e.target.value.toUpperCase() })}
              />
            </Stack>
            <Divider />
            {/* Poder notarial - datos, no el archivo (02/Sep/2026,
            recordatorio explicito: en la base de datos se guarda el link
            del archivo, no el archivo - el PDF de la escritura se sube
            como documento normal en la pestaña "Documentos KYC"). */}
            <Typography variant="overline" color="text.secondary">
              Poder notarial
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Número de escritura"
                fullWidth
                value={formRep.poder_numero_escritura ?? ""}
                onChange={(e) => setFormRep({ ...formRep, poder_numero_escritura: e.target.value.toUpperCase() })}
              />
              <TextField
                size="small"
                label="Fecha de la escritura"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ lang: "es-MX" }}
                value={formRep.poder_fecha_escritura ?? ""}
                onChange={(e) => setFormRep({ ...formRep, poder_fecha_escritura: e.target.value })}
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="Nombre del notario"
                fullWidth
                value={formRep.poder_notario_nombre ?? ""}
                onChange={(e) => setFormRep({ ...formRep, poder_notario_nombre: e.target.value.toUpperCase() })}
              />
              <TextField
                size="small"
                label="Número de notaría"
                fullWidth
                value={formRep.poder_notario_numero ?? ""}
                onChange={(e) => setFormRep({ ...formRep, poder_notario_numero: e.target.value.toUpperCase() })}
              />
            </Stack>
            <FormControl size="small" fullWidth>
              <InputLabel id="rep-facultades-label">Facultades</InputLabel>
              <Select
                labelId="rep-facultades-label"
                label="Facultades"
                value={formRep.poder_facultades ?? ""}
                onChange={(e) =>
                  setFormRep({
                    ...formRep,
                    poder_facultades: (e.target.value || null) as PldRepresentanteLegal["poder_facultades"],
                  })
                }
              >
                <MenuItem value="">
                  <em>Sin especificar</em>
                </MenuItem>
                {Object.entries(FACULTADES_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formRep.poder_vigente ?? true}
                  onChange={(e) => setFormRep({ ...formRep, poder_vigente: e.target.checked })}
                />
              }
              label="El poder sigue vigente"
            />
            <TextField
              size="small"
              label="Comentarios"
              fullWidth
              multiline
              minRows={2}
              value={formRep.comentarios ?? ""}
              onChange={(e) => setFormRep({ ...formRep, comentarios: e.target.value.toUpperCase() })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogRepAbierto(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarRep} disabled={guardandoRep}>
            {guardandoRep ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* 25/Ago/2026 (requerimiento real del cliente) - solicitar
          eliminacion en vez de borrar directo (el analista no tiene
          pld-documentos.editar). Solo Admin resuelve, ver panel de
          solicitudes pendientes en la pestaña Documentos. */}
      <Dialog
        open={Boolean(solicitandoEliminarDoc)}
        onClose={() => {
          setSolicitandoEliminarDoc(null);
          setRazonSolicitud("");
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Solicitar eliminación</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Vas a pedirle a un Admin que elimine{" "}
            <strong>{solicitandoEliminarDoc?.denominacion || "este documento"}</strong>. Explica brevemente
            por qué.
          </DialogContentText>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label="Razón"
            value={razonSolicitud}
            onChange={(e) => setRazonSolicitud(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setSolicitandoEliminarDoc(null);
              setRazonSolicitud("");
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSolicitarEliminacion}
            disabled={enviandoSolicitud || !razonSolicitud.trim()}
          >
            {enviandoSolicitud ? <CircularProgress size={20} color="inherit" /> : "Enviar solicitud"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
