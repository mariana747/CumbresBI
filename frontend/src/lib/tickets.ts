// Cliente de tickets-service (Fase 1, 23/Sep/2026 - ver memoria
// tickets-modulo-jerarquia-sin-construir): solo los primeros 3 niveles de
// la jerarquia de 6 tablas - Centros -> Proyectos -> Participantes.
// Contrato: services/tickets-service/tickets/views.py.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const TICKETS_API_BASE_URL = `${GATEWAY_URL}/tickets`;

export interface TicketsPaginado<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface TicketsCentro {
  id_tickets_centro: string;
  denominacion: string;
  descripcion: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type TicketsProyectoEstado = "PLANEADO" | "EN CURSO" | "COMPLETADO" | "CANCELADO";

export interface TicketsProyecto {
  id_proyecto: string;
  denominacion: string;
  descripcion: string | null;
  centro: string;
  carpeta: string | null;
  responsable: string;
  estado: TicketsProyectoEstado;
  vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  progreso: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface TicketsProyectoParticipante {
  id_proyectos_part: string;
  id_proyecto: string;
  id_participante: string;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// --- Centros ---------------------------------------------------------------

export async function listCentros(search?: string): Promise<TicketsPaginado<TicketsCentro>> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/centros/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function createCentro(params: {
  denominacion: string;
  descripcion?: string;
  comentarios?: string;
}): Promise<TicketsCentro> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/centros/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function updateCentro(
  id: string,
  params: Partial<{ denominacion: string; descripcion: string; comentarios: string }>
): Promise<TicketsCentro> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/centros/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function deleteCentro(id: string): Promise<void> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/centros/${id}/`, { method: "DELETE" });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
}

// --- Proyectos ---------------------------------------------------------------

export async function listProyectos(params?: {
  centro?: string;
  search?: string;
}): Promise<TicketsPaginado<TicketsProyecto>> {
  const query = new URLSearchParams();
  if (params?.centro) query.set("centro", params.centro);
  if (params?.search) query.set("search", params.search);
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/proyectos/?${query.toString()}`);
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function createProyecto(params: {
  denominacion: string;
  descripcion?: string;
  centro: string;
  carpeta?: string;
  responsable: string;
  estado?: TicketsProyectoEstado;
  vencimiento?: string;
  fechaInicio?: string;
  fechaFin?: string;
  progreso?: string;
  comentarios?: string;
}): Promise<TicketsProyecto> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/proyectos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      denominacion: params.denominacion,
      descripcion: params.descripcion || null,
      centro: params.centro,
      carpeta: params.carpeta || null,
      responsable: params.responsable,
      estado: params.estado || "PLANEADO",
      vencimiento: params.vencimiento || null,
      fecha_inicio: params.fechaInicio || null,
      fecha_fin: params.fechaFin || null,
      progreso: params.progreso || null,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function updateProyecto(
  id: string,
  params: Partial<{
    denominacion: string;
    descripcion: string;
    carpeta: string;
    responsable: string;
    estado: TicketsProyectoEstado;
    vencimiento: string;
    fechaInicio: string;
    fechaFin: string;
    progreso: string;
    comentarios: string;
  }>
): Promise<TicketsProyecto> {
  const body: Record<string, unknown> = {};
  if (params.denominacion !== undefined) body.denominacion = params.denominacion;
  if (params.descripcion !== undefined) body.descripcion = params.descripcion || null;
  if (params.carpeta !== undefined) body.carpeta = params.carpeta || null;
  if (params.responsable !== undefined) body.responsable = params.responsable;
  if (params.estado !== undefined) body.estado = params.estado;
  if (params.vencimiento !== undefined) body.vencimiento = params.vencimiento || null;
  if (params.fechaInicio !== undefined) body.fecha_inicio = params.fechaInicio || null;
  if (params.fechaFin !== undefined) body.fecha_fin = params.fechaFin || null;
  if (params.progreso !== undefined) body.progreso = params.progreso || null;
  if (params.comentarios !== undefined) body.comentarios = params.comentarios || null;

  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/proyectos/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function deleteProyecto(id: string): Promise<void> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/proyectos/${id}/`, { method: "DELETE" });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
}

// --- Participantes -----------------------------------------------------------

export async function listParticipantes(idProyecto: string): Promise<TicketsPaginado<TicketsProyectoParticipante>> {
  const params = new URLSearchParams({ id_proyecto: idProyecto });
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/participantes/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function addParticipante(params: {
  idProyecto: string;
  idParticipante: string;
  comentarios?: string;
}): Promise<TicketsProyectoParticipante> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/participantes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_proyecto: params.idProyecto,
      id_participante: params.idParticipante,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function removeParticipante(id: string): Promise<void> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/participantes/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
}
