// Cliente de materiales-service (CRUD real, 21/Ago/2026 - antes solo
// tenia modelos/migracion, sin serializers/views, ver services/
// materiales-service/materiales/views.py).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const MATERIALES_API_BASE_URL = process.env.NEXT_PUBLIC_MATERIALES_API_BASE_URL ?? `${GATEWAY_URL}/materiales`;

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

// Flujo de 3 estados, sin paso intermedio de aprobacion (decision de
// Mariana 21/Ago/2026): SOLICITADO -> ENTREGADO o SOLICITADO -> RECHAZADO.
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

// Presupuesto/ConceptoPresupuesto - CRUD ya existia en el backend
// (Fase 3), pero sin cliente en el frontend hasta que Requisicion los
// necesito (21/Ago/2026) para armar el documento por proyecto+etapa.
export interface Presupuesto {
  id_presupuesto: string;
  proyecto: string;
  denominacion: string | null;
  estado: string;
  monto_total: string;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listPresupuestos(search?: string): Promise<Presupuesto[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/presupuestos/?${params.toString()}`);
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
// compra (decision de Mariana 21/Ago/2026, distinta de SolicitudMaterial/
// "Salida de almacen" - ver docstring del modelo en el backend). Las
// lineas se generan solas al crear (snapshot), no se mandan en el POST.
export type RequisicionEstado = "PENDIENTE" | "AUTORIZADA" | "RECHAZADA";

export interface RequisicionLinea {
  id_linea: string;
  requisicion: string;
  concepto: string | null;
  concepto_nombre: string;
  material: string | null;
  material_nombre: string | null;
  cantidad_por_vivienda: string;
  cantidad_total: string;
  precio_unitario: string;
  importe: string;
  proveedor_cotizacion: string | null;
}

export interface Requisicion {
  id_requisicion: string;
  folio: string;
  proyecto: string;
  presupuesto: string;
  etapa_constructiva: string;
  empresa: string | null;
  responsable: string | null;
  num_viviendas: number;
  presupuesto_asignado: string;
  estado: RequisicionEstado;
  estado_label: string;
  solicito_por: string | null;
  valido_por: string | null;
  autorizo_compra_por: string | null;
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
  presupuesto: string;
  etapaConstructiva: string;
  empresa?: string | null;
  responsable?: string | null;
  numViviendas: number;
  comentarios?: string | null;
}): Promise<Requisicion> {
  const response = await apiFetch("MATERIALES", `${MATERIALES_API_BASE_URL}/api/requisiciones/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyecto: params.proyecto,
      presupuesto: params.presupuesto,
      etapa_constructiva: params.etapaConstructiva,
      empresa: params.empresa || null,
      responsable: params.responsable || null,
      num_viviendas: params.numViviendas,
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
