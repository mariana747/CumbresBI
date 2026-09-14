// Cliente de obra-service (scaffold 21/Ago/2026).
// Contrato: services/obra-service/obra/views.py.
//
// La vista/nomenclatura reusa a proposito el Excel legado "PORCENTAJE
// AVANCE_015631.xlsx" - Etapa -> Concepto -> Lote,
// con captura diaria (ObraEstimacion) y un corte semanal (viernes) que
// requiere validacion manual del Supervisor de Obra antes de considerarse
// cerrado (ObraCorteSemanal.aprobar).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const OBRA_API_BASE_URL = process.env.NEXT_PUBLIC_OBRA_API_BASE_URL ?? `${GATEWAY_URL}/obra`;

export interface ObraEtapa {
  id_etapa: string;
  numero: string;
  nombre: string;
  orden: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listEtapas(search?: string): Promise<ObraEtapa[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/etapas/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export async function createEtapa(params: { numero: string; nombre: string; orden?: number }): Promise<ObraEtapa> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/etapas/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numero: params.numero, nombre: params.nombre, orden: params.orden ?? 0 }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export async function updateEtapa(
  idEtapa: string,
  params: Partial<{ numero: string; nombre: string; orden: number }>
): Promise<ObraEtapa> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/etapas/${idEtapa}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export async function deleteEtapa(idEtapa: string): Promise<void> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/etapas/${idEtapa}/`, { method: "DELETE" });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
}

export interface ObraConcepto {
  id_concepto: string;
  etapa: string;
  etapa_nombre: string;
  numero: string;
  descripcion: string;
  maestro: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listConceptos(search?: string): Promise<ObraConcepto[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/conceptos/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export async function createConcepto(params: {
  etapa: string;
  numero: string;
  descripcion: string;
  maestro?: string | null;
}): Promise<ObraConcepto> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/conceptos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      etapa: params.etapa,
      numero: params.numero,
      descripcion: params.descripcion,
      maestro: params.maestro || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export async function updateConcepto(
  idConcepto: string,
  params: Partial<{ etapa: string; numero: string; descripcion: string; maestro: string | null }>
): Promise<ObraConcepto> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/conceptos/${idConcepto}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export async function deleteConcepto(idConcepto: string): Promise<void> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/conceptos/${idConcepto}/`, { method: "DELETE" });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
}

export interface ObraLote {
  id_lote: string;
  proyecto: string;
  obra: string | null;
  lugar: string | null;
  ciudad: string | null;
  manzana: string | null;
  numero_lote: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listLotes(search?: string): Promise<ObraLote[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/lotes/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export interface ObraEstimacion {
  id_estimacion: string;
  concepto: string;
  concepto_descripcion: string;
  lote: string;
  lote_numero: string;
  numero_estimacion: number;
  porcentaje: string;
  fecha_captura: string;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listEstimaciones(search?: string): Promise<ObraEstimacion[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/estimaciones/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

// numero_estimacion NO se manda - lo calcula el backend (siguiente
// consecutivo 1-4 dentro del concepto+lote, ver views.py::perform_create).
export async function createEstimacion(params: {
  concepto: string;
  lote: string;
  porcentaje: string;
  fechaCaptura: string;
  comentarios?: string | null;
}): Promise<ObraEstimacion> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/estimaciones/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concepto: params.concepto,
      lote: params.lote,
      porcentaje: params.porcentaje,
      fecha_captura: params.fechaCaptura,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

// Edita una estimacion ya capturada (numero_estimacion NO se toca, solo
// el % y/o la fecha/comentarios) - permiso obra.editar, distinto de
// obra.crear que usa createEstimacion arriba.
export async function updateEstimacion(
  idEstimacion: string,
  params: Partial<{ porcentaje: string; fechaCaptura: string; comentarios: string | null }>
): Promise<ObraEstimacion> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/estimaciones/${idEstimacion}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      porcentaje: params.porcentaje,
      fecha_captura: params.fechaCaptura,
      comentarios: params.comentarios,
    }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

// Borra una estimacion capturada por error (ej. un % que nunca fue real) -
// permiso obra.editar, mismo criterio que updateEstimacion.
export async function deleteEstimacion(idEstimacion: string): Promise<void> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/estimaciones/${idEstimacion}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
}

// Foto de evidencia por concepto+lote (minuta_reunion-1.md sec. 1 y 2:
// "Toma de Evidencia") - va a vivir en Google Drive, pero todavia no
// existe la Unidad compartida para Obra (21/Ago/2026, ver
// obra-evidencia-fotos-drive-pendiente en memoria del proyecto). Mientras
// tanto `link_drive` se captura a mano (URL pegada), no hay subida real.
export interface ObraEvidencia {
  id_evidencia: string;
  concepto: string;
  concepto_descripcion: string;
  lote: string;
  lote_numero: string;
  link_drive: string | null;
  fecha_captura: string;
  revisado: boolean;
  revisado_por: string | null;
  revisado_en: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listEvidencias(params: { concepto?: string; lote?: string } = {}): Promise<ObraEvidencia[]> {
  const query = new URLSearchParams();
  if (params.concepto) query.set("search", params.concepto);
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/evidencias/?${query.toString()}`);
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  const evidencias: ObraEvidencia[] = await response.json();
  return params.lote ? evidencias.filter((e) => e.lote === params.lote) : evidencias;
}

export async function createEvidencia(params: {
  concepto: string;
  lote: string;
  linkDrive?: string | null;
  fechaCaptura: string;
  comentarios?: string | null;
}): Promise<ObraEvidencia> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/evidencias/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concepto: params.concepto,
      lote: params.lote,
      link_drive: params.linkDrive || null,
      fecha_captura: params.fechaCaptura,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

// revisadoPor: user_id de quien revisa (Supervisor de Obra) - mismo
// criterio que aprobarCorte, se manda en el body por ahora.
export async function revisarEvidencia(idEvidencia: string, revisadoPor: string): Promise<ObraEvidencia> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/evidencias/${idEvidencia}/revisar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revisado_por: revisadoPor }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export type ObraCorteEstado = "BORRADOR" | "EN_REVISION" | "APROBADO";

// El corte semanal es un snapshot del viernes - se actualiza a diario en
// vivo via ObraEstimacion, pero pasar a APROBADO SIEMPRE requiere la
// accion aprobar() con validacion manual del Supervisor de Obra, nunca es
// automatico por fecha/cron.
export interface ObraCorteSemanal {
  id_corte: string;
  proyecto: string;
  fecha_corte: string;
  semana_de_fase: number;
  estado: ObraCorteEstado;
  aprobado_por: string | null;
  aprobado_en: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listCortes(search?: string): Promise<ObraCorteSemanal[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/cortes/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

export async function createCorte(params: {
  proyecto: string;
  fechaCorte: string;
  semanaDeFase: number;
  comentarios?: string | null;
}): Promise<ObraCorteSemanal> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/cortes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyecto: params.proyecto,
      fecha_corte: params.fechaCorte,
      semana_de_fase: params.semanaDeFase,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

// aprobadoPor: user_id de quien cierra el corte (Supervisor de Obra) - se
// manda en el body porque todavia no hay JWT real que lo resuelva del
// request (mismo criterio que PldContraparteKycViewSet.aprobar).
export async function aprobarCorte(idCorte: string, aprobadoPor: string): Promise<ObraCorteSemanal> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/cortes/${idCorte}/aprobar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aprobado_por: aprobadoPor }),
  });
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}

// Snapshot congelado al aprobar (ObraCorteSemanalDetalle) - vacio si el
// corte sigue en BORRADOR/EN_REVISION, solo existe despues de aprobar().
export interface ObraCorteSemanalDetalle {
  id_detalle: string;
  corte: string;
  concepto: string;
  concepto_numero: string;
  concepto_descripcion: string;
  lote: string;
  lote_numero: string;
  porcentaje_acumulado: string;
  created_at: string;
}

export async function listDetalleCorte(idCorte: string): Promise<ObraCorteSemanalDetalle[]> {
  const response = await apiFetch("OBRA", `${OBRA_API_BASE_URL}/api/cortes/${idCorte}/detalle/`);
  if (!response.ok) throw await friendlyApiError("OBRA", response);
  return response.json();
}
