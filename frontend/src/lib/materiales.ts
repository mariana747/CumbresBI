// Cliente de materiales-service (CRUD real, 21/Ago/2026 - antes solo
// tenia modelos/migracion, sin serializers/views, ver services/
// materiales-service/materiales/views.py).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";
import { ExportarSheetsResultado } from "./tesoreria";

const MATERIALES_API_BASE_URL = `${GATEWAY_URL}/materiales`;

export interface MaterialCatalogo {
  id_material: string;
  material: string;
  unidad_medida: string;
  cantidad_disponible: string;
  precio_unitario: string;
  proveedor: string | null;
  cotizacion_fecha_vigencia: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listMateriales(search?: string): Promise<MaterialCatalogo[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/materiales/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function createMaterial(params: {
  material: string;
  unidadMedida: string;
  cantidadDisponible?: string;
  precioUnitario: string;
  proveedor?: string | null;
  cotizacionFechaVigencia?: string | null;
  comentarios?: string | null;
}): Promise<MaterialCatalogo> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/materiales/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      material: params.material,
      unidad_medida: params.unidadMedida,
      cantidad_disponible: params.cantidadDisponible || "0",
      precio_unitario: params.precioUnitario,
      proveedor: params.proveedor || null,
      cotizacion_fecha_vigencia: params.cotizacionFechaVigencia || null,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function updateMaterial(
  idMaterial: string,
  params: Partial<{
    material: string;
    unidad_medida: string;
    cantidad_disponible: string;
    precio_unitario: string;
    proveedor: string | null;
    cotizacion_fecha_vigencia: string | null;
    comentarios: string | null;
  }>
): Promise<MaterialCatalogo> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/materiales/${idMaterial}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function deleteMaterial(idMaterial: string): Promise<void> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/materiales/${idMaterial}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
}

export interface ManoObraCatalogo {
  id_mano_obra: string;
  etapa_constructiva: string;
  descripcion: string;
  costo_unitario: string;
  unidad_medida: string;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listManoObra(search?: string): Promise<ManoObraCatalogo[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/mano-obra/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function createManoObra(params: {
  etapaConstructiva: string;
  descripcion: string;
  costoUnitario: string;
  unidadMedida: string;
  comentarios?: string | null;
}): Promise<ManoObraCatalogo> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/mano-obra/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      etapa_constructiva: params.etapaConstructiva,
      descripcion: params.descripcion,
      costo_unitario: params.costoUnitario,
      unidad_medida: params.unidadMedida,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function updateManoObra(
  idManoObra: string,
  params: Partial<{
    etapa_constructiva: string;
    descripcion: string;
    costo_unitario: string;
    unidad_medida: string;
    comentarios: string | null;
  }>
): Promise<ManoObraCatalogo> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/mano-obra/${idManoObra}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function deleteManoObra(idManoObra: string): Promise<void> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/mano-obra/${idManoObra}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
}

// Flujo de 3 estados, sin paso intermedio de aprobacion:
// SOLICITADO -> ENTREGADO o SOLICITADO -> RECHAZADO.
export type SolicitudMaterialEstado = "SOLICITADO" | "ENTREGADO" | "RECHAZADO";

export interface SolicitudMaterial {
  id_solicitud: string;
  proyecto: string;
  material: string;
  material_nombre: string;
  cantidad_solicitada: string;
  solicitado_por: string;
  estado: SolicitudMaterialEstado;
  fecha_solicitud: string;
  fecha_entrega: string | null;
  comentarios: string | null;
  tiene_evidencia: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listSolicitudes(search?: string): Promise<SolicitudMaterial[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/solicitudes/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function createSolicitud(params: {
  proyecto: string;
  material: string;
  cantidadSolicitada: string;
  solicitadoPor: string;
  comentarios?: string | null;
}): Promise<SolicitudMaterial> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/solicitudes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyecto: params.proyecto,
      material: params.material,
      cantidad_solicitada: params.cantidadSolicitada,
      solicitado_por: params.solicitadoPor,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function entregarSolicitud(idSolicitud: string): Promise<SolicitudMaterial> {
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/solicitudes/${idSolicitud}/entregar/`,
    { method: "POST" }
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function rechazarSolicitud(idSolicitud: string): Promise<SolicitudMaterial> {
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/solicitudes/${idSolicitud}/rechazar/`,
    { method: "POST" }
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

// Bitacora de recepcion (foto + fecha/hora) contra una solicitud - mismo
// patron que ObraEvidencia en obra-service: `link_drive` se captura a mano
// mientras no exista la Unidad compartida de Drive (ver
// materiales-evidencia-recepcion-pendiente en memoria del proyecto).
export interface EvidenciaRecepcion {
  id_evidencia: string;
  solicitud: string;
  link_drive: string | null;
  fecha: string;
  hora: string;
  registrado_por: string;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listEvidenciasRecepcion(solicitud: string): Promise<EvidenciaRecepcion[]> {
  const params = new URLSearchParams({ solicitud });
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/evidencias-recepcion/?${params.toString()}`
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function createEvidenciaRecepcion(params: {
  solicitud: string;
  linkDrive?: string | null;
  fecha: string;
  hora: string;
  registradoPor: string;
  comentarios?: string | null;
}): Promise<EvidenciaRecepcion> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/evidencias-recepcion/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      solicitud: params.solicitud,
      link_drive: params.linkDrive || null,
      fecha: params.fecha,
      hora: params.hora,
      registrado_por: params.registradoPor,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

// Evidencia fotografica real (22/Sep/2026) - sube a Drive via
// drive-service, mismo patron que subirEvidenciaRecepcion en lib/compras.ts.
export async function subirEvidenciaFotoRecepcion(idEvidencia: string, archivo: File): Promise<EvidenciaRecepcion> {
  const formData = new FormData();
  formData.append("file", archivo);
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/evidencias-recepcion/${idEvidencia}/subir_evidencia/`,
    { method: "POST", body: formData }
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

// Presupuesto/ConceptoPresupuesto - CRUD ya existia en el backend
// (Fase 3), pero sin cliente en el frontend hasta que Requisicion los
// necesito (21/Ago/2026) para armar el documento por proyecto+etapa.
export interface Presupuesto {
  id_presupuesto: string;
  proyecto: string;
  obra: string | null;
  denominacion: string | null;
  estado: string;
  monto_total: string;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listPresupuestos(params?: { search?: string; obra?: string }): Promise<Presupuesto[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.obra) query.set("obra", params.obra);
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/presupuestos/?${query.toString()}`);
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

// Presupuesto por Obra (18/Sep/2026, ver obra-jerarquia-proyecto-obra-
// presupuesto en memoria del proyecto) - se crea al generar la Obra en
// /obra/obras, y de inmediato se le llena el snapshot en $0 vía
// generarPresupuestoDesdeCatalogo.
export async function createPresupuesto(params: {
  proyecto: string;
  obra: string;
  denominacion?: string | null;
}): Promise<Presupuesto> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/presupuestos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proyecto: params.proyecto, obra: params.obra, denominacion: params.denominacion || null }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function generarPresupuestoDesdeCatalogo(idPresupuesto: string): Promise<ConceptoPresupuesto[]> {
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/presupuestos/${idPresupuesto}/generar_desde_catalogo/`,
    { method: "POST" }
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export interface ConceptoPresupuesto {
  id_concepto: string;
  presupuesto: string;
  etapa_constructiva: string;
  concepto: string;
  material: string | null;
  material_nombre: string | null;
  mano_obra: string | null;
  mano_obra_descripcion: string | null;
  cantidad: string;
  precio_unitario: string;
  importe: string;
  comentarios: string | null;
}

export async function listConceptosPresupuesto(presupuesto: string): Promise<ConceptoPresupuesto[]> {
  const params = new URLSearchParams({ presupuesto });
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/conceptos-presupuesto/?${params.toString()}`
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

// Requisicion de materiales - documento formal por proyecto+etapa que
// jala los ConceptoPresupuesto ya presupuestados y ES la que dispara la
// compra, distinta de SolicitudMaterial/"Salida de almacen" (ver docstring
// del modelo en el backend). Las lineas se generan solas al crear
// (snapshot), no se mandan en el POST.
export type RequisicionEstado = "PENDIENTE" | "AUTORIZADA" | "RECHAZADA";

export interface RequisicionLinea {
  id_linea: string;
  requisicion: string;
  material: string;
  material_nombre: string;
  cantidad_total: string;
  precio_unitario: string;
  importe: string;
  proveedor_cotizacion: string | null;
}

export interface RequisicionObraIncluida {
  id_requisicion_obra: string;
  requisicion: string;
  obra: string;
}

export interface Requisicion {
  id_requisicion: string;
  folio: string;
  proyecto: string;
  obras_incluidas: RequisicionObraIncluida[];
  etapa_constructiva: string;
  empresa: string | null;
  responsable: string | null;
  presupuesto_asignado: string;
  estado: RequisicionEstado;
  estado_label: string;
  solicito_por: string | null;
  valido_por: string | null;
  autorizo_compra_por: string | null;
  id_solicitud_compra: string | null;
  comentarios: string | null;
  lineas: RequisicionLinea[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listRequisiciones(proyecto?: string): Promise<Requisicion[]> {
  const params = new URLSearchParams();
  if (proyecto) params.set("proyecto", proyecto);
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/requisiciones/?${params.toString()}`
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function createRequisicion(params: {
  proyecto: string;
  obras: string[];
  etapaConstructiva: string;
  empresa?: string | null;
  responsable?: string | null;
  comentarios?: string | null;
}): Promise<Requisicion> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/requisiciones/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyecto: params.proyecto,
      obras: params.obras,
      etapa_constructiva: params.etapaConstructiva,
      empresa: params.empresa || null,
      responsable: params.responsable || null,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function getRequisicion(idRequisicion: string): Promise<Requisicion> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/requisiciones/${idRequisicion}/`);
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

async function accionRequisicion(
  idRequisicion: string,
  accion: "validar" | "autorizar" | "rechazar"
): Promise<Requisicion> {
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/requisiciones/${idRequisicion}/${accion}/`,
    { method: "POST" }
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export const validarRequisicion = (id: string) => accionRequisicion(id, "validar");
export const autorizarRequisicion = (id: string) => accionRequisicion(id, "autorizar");
export const rechazarRequisicion = (id: string) => accionRequisicion(id, "rechazar");

// Exportar a Google Sheets (22/Sep/2026, "ya no se descargara un xlsx
// sino se mandara al drive") - mismo patron que exportarFlujosSheets en
// lib/tesoreria.ts.
export async function exportarRequisicionSheets(
  idRequisicion: string,
  carpetaId?: string
): Promise<ExportarSheetsResultado> {
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/requisiciones/${idRequisicion}/exportar_sheets/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carpeta_id: carpetaId }),
    }
  );
  if (!response.ok && response.status !== 409) {
    throw await friendlyApiError("MATERIALES", response);
  }
  return response.json();
}

// Contrato de Suministro (22/Sep/2026) - documento con un proveedor donde
// viene detallado que va a surtir y a que precio, distinto de
// TesoreriaContrato (contrato de flujo de pago). Guardar una linea de un
// contrato ACTIVO sincroniza de inmediato el precio_unitario/proveedor del
// MaterialCatalogo correspondiente (ver backend).
export type ContratoSuministroEstado = "ACTIVO" | "VENCIDO" | "CANCELADO";

export interface ContratoSuministroLinea {
  id_linea: string;
  contrato: string;
  material: string;
  material_nombre: string;
  precio_unitario: string;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface ContratoSuministroProyecto {
  id_contrato_suministro_proyecto: string;
  contrato: string;
  proyecto: string;
}

export interface ContratoSuministro {
  id_contrato_suministro: string;
  proveedor: string;
  proveedor_nombre: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: ContratoSuministroEstado;
  estado_label: string;
  link_documento: string | null;
  comentarios: string | null;
  // Asignación opcional a Proyectos (22/Sep/2026, "no está atado a un
  // proyecto pero se puede asignar a varios") - vacío = aplica en general.
  proyectos_asignados: ContratoSuministroProyecto[];
  lineas: ContratoSuministroLinea[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listContratosSuministro(search?: string): Promise<ContratoSuministro[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/contratos-suministro/?${params.toString()}`
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function createContratoSuministro(params: {
  proveedor: string;
  proveedorNombre?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  linkDocumento?: string | null;
  comentarios?: string | null;
  proyectos?: string[];
}): Promise<ContratoSuministro> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/contratos-suministro/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proveedor: params.proveedor,
      proveedor_nombre: params.proveedorNombre || null,
      fecha_inicio: params.fechaInicio,
      fecha_fin: params.fechaFin || null,
      link_documento: params.linkDocumento || null,
      comentarios: params.comentarios || null,
      proyectos: params.proyectos || [],
    }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function updateContratoSuministro(
  idContrato: string,
  params: Partial<{
    proveedor: string;
    proveedor_nombre: string | null;
    fecha_inicio: string;
    fecha_fin: string | null;
    estado: ContratoSuministroEstado;
    link_documento: string | null;
    comentarios: string | null;
    proyectos: string[];
  }>
): Promise<ContratoSuministro> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/contratos-suministro/${idContrato}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function deleteContratoSuministro(idContrato: string): Promise<void> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/contratos-suministro/${idContrato}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
}

export async function createContratoSuministroLinea(params: {
  contrato: string;
  material: string;
  precioUnitario: string;
  comentarios?: string | null;
}): Promise<ContratoSuministroLinea> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/contrato-suministro-lineas/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contrato: params.contrato,
      material: params.material,
      precio_unitario: params.precioUnitario,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
  return response.json();
}

export async function deleteContratoSuministroLinea(idLinea: string): Promise<void> {
  const response = await apiFetch(
    "MATERIALES",
    `${MATERIALES_API_BASE_URL}/api/contrato-suministro-lineas/${idLinea}/`,
    { method: "DELETE" }
  );
  if (!response.ok) throw await friendlyApiError("MATERIALES", response);
}
