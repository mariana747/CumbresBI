// Cliente de tickets-service (ver memoria tickets-modulo-jerarquia-sin-
// construir): jerarquia completa de 6 tablas - Centros -> Proyectos ->
// Participantes/Subproyectos -> Tickets -> Dependencias/Log.
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

export interface TicketsSubproyecto {
  id_subproyecto: string;
  denominacion: string;
  descripcion: string | null;
  id_proyecto: string;
  sociedad: string;
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

export type TicketPrioridad = "BAJA" | "MEDIA" | "ALTA" | "URGENTE";
export type TicketEstado = "PENDIENTE" | "EN CURSO" | "EN REVISION" | "COMPLETADO" | "CANCELADO";

export interface Ticket {
  id_ticket: string;
  denominacion: string;
  descripcion: string | null;
  id_subproyecto: string;
  categoria: string | null;
  prioridad: TicketPrioridad;
  estado: TicketEstado;
  asignado_a: string | null;
  fecha_inicio_prog: string | null;
  fecha_fin_prog: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  estimacion_horas: string | null;
  carpeta: string | null;
  instrucciones_entrega: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// ESTRICTO/FLEXIBLE (calza exacto con el ERD, 20260727_Cumbres_ERD.sql:838-849).
export type TicketsDependenciaTipo = "ESTRICTO" | "FLEXIBLE";

export interface TicketsDependencia {
  id_dependencia: string;
  predecesora: string;
  sucesora: string;
  tipo: TicketsDependenciaTipo;
  ventaja_desfase_dias: number | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type TicketsLogAccion = "COMENTARIO" | "ACTUALIZACION" | "CARGA ARCHIVO" | "CAMBIO ASIGNACION" | "OTRO";

export interface TicketsLog {
  id_log: string;
  id_ticket: string;
  accion: TicketsLogAccion;
  comentario: string | null;
  progreso_nuevo: string | null;
  horas_incurridas: string | null;
  descripcion_archivo: string | null;
  url_archivo: string | null;
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

// --- Subproyectos --------------------------------------------------------

export async function listSubproyectos(params?: {
  idProyecto?: string;
  search?: string;
}): Promise<TicketsPaginado<TicketsSubproyecto>> {
  const query = new URLSearchParams();
  if (params?.idProyecto) query.set("id_proyecto", params.idProyecto);
  if (params?.search) query.set("search", params.search);
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/subproyectos/?${query.toString()}`);
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function createSubproyecto(params: {
  denominacion: string;
  descripcion?: string;
  idProyecto: string;
  sociedad: string;
  responsable: string;
  estado?: TicketsProyectoEstado;
  vencimiento?: string;
  fechaInicio?: string;
  fechaFin?: string;
  progreso?: string;
  comentarios?: string;
}): Promise<TicketsSubproyecto> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/subproyectos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      denominacion: params.denominacion,
      descripcion: params.descripcion || null,
      id_proyecto: params.idProyecto,
      sociedad: params.sociedad,
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

export async function updateSubproyecto(
  id: string,
  params: Partial<{
    denominacion: string;
    descripcion: string;
    sociedad: string;
    responsable: string;
    estado: TicketsProyectoEstado;
    vencimiento: string;
    fechaInicio: string;
    fechaFin: string;
    progreso: string;
    comentarios: string;
  }>
): Promise<TicketsSubproyecto> {
  const body: Record<string, unknown> = {};
  if (params.denominacion !== undefined) body.denominacion = params.denominacion;
  if (params.descripcion !== undefined) body.descripcion = params.descripcion || null;
  if (params.sociedad !== undefined) body.sociedad = params.sociedad;
  if (params.responsable !== undefined) body.responsable = params.responsable;
  if (params.estado !== undefined) body.estado = params.estado;
  if (params.vencimiento !== undefined) body.vencimiento = params.vencimiento || null;
  if (params.fechaInicio !== undefined) body.fecha_inicio = params.fechaInicio || null;
  if (params.fechaFin !== undefined) body.fecha_fin = params.fechaFin || null;
  if (params.progreso !== undefined) body.progreso = params.progreso || null;
  if (params.comentarios !== undefined) body.comentarios = params.comentarios || null;

  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/subproyectos/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function deleteSubproyecto(id: string): Promise<void> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/subproyectos/${id}/`, { method: "DELETE" });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
}

// --- Tickets ---------------------------------------------------------------

export async function listTickets(params?: {
  idSubproyecto?: string;
  estado?: TicketEstado;
  asignadoA?: string;
  search?: string;
}): Promise<TicketsPaginado<Ticket>> {
  const query = new URLSearchParams();
  if (params?.idSubproyecto) query.set("id_subproyecto", params.idSubproyecto);
  if (params?.estado) query.set("estado", params.estado);
  if (params?.asignadoA) query.set("asignado_a", params.asignadoA);
  if (params?.search) query.set("search", params.search);
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/tickets/?${query.toString()}`);
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function createTicket(params: {
  denominacion: string;
  descripcion?: string;
  idSubproyecto: string;
  categoria?: string;
  prioridad?: TicketPrioridad;
  estado?: TicketEstado;
  asignadoA?: string;
  fechaInicioProg?: string;
  fechaFinProg?: string;
  fechaInicioReal?: string;
  fechaFinReal?: string;
  estimacionHoras?: string;
  carpeta?: string;
  instruccionesEntrega?: string;
  comentarios?: string;
}): Promise<Ticket> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/tickets/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      denominacion: params.denominacion,
      descripcion: params.descripcion || null,
      id_subproyecto: params.idSubproyecto,
      categoria: params.categoria || null,
      prioridad: params.prioridad || "MEDIA",
      estado: params.estado || "PENDIENTE",
      asignado_a: params.asignadoA || null,
      fecha_inicio_prog: params.fechaInicioProg || null,
      fecha_fin_prog: params.fechaFinProg || null,
      fecha_inicio_real: params.fechaInicioReal || null,
      fecha_fin_real: params.fechaFinReal || null,
      estimacion_horas: params.estimacionHoras || null,
      carpeta: params.carpeta || null,
      instrucciones_entrega: params.instruccionesEntrega || null,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function updateTicket(
  id: string,
  params: Partial<{
    denominacion: string;
    descripcion: string;
    categoria: string;
    prioridad: TicketPrioridad;
    estado: TicketEstado;
    asignadoA: string;
    fechaInicioProg: string;
    fechaFinProg: string;
    fechaInicioReal: string;
    fechaFinReal: string;
    estimacionHoras: string;
    carpeta: string;
    instruccionesEntrega: string;
    comentarios: string;
  }>
): Promise<Ticket> {
  const body: Record<string, unknown> = {};
  if (params.denominacion !== undefined) body.denominacion = params.denominacion;
  if (params.descripcion !== undefined) body.descripcion = params.descripcion || null;
  if (params.categoria !== undefined) body.categoria = params.categoria || null;
  if (params.prioridad !== undefined) body.prioridad = params.prioridad;
  if (params.estado !== undefined) body.estado = params.estado;
  if (params.asignadoA !== undefined) body.asignado_a = params.asignadoA || null;
  if (params.fechaInicioProg !== undefined) body.fecha_inicio_prog = params.fechaInicioProg || null;
  if (params.fechaFinProg !== undefined) body.fecha_fin_prog = params.fechaFinProg || null;
  if (params.fechaInicioReal !== undefined) body.fecha_inicio_real = params.fechaInicioReal || null;
  if (params.fechaFinReal !== undefined) body.fecha_fin_real = params.fechaFinReal || null;
  if (params.estimacionHoras !== undefined) body.estimacion_horas = params.estimacionHoras || null;
  if (params.carpeta !== undefined) body.carpeta = params.carpeta || null;
  if (params.instruccionesEntrega !== undefined) body.instrucciones_entrega = params.instruccionesEntrega || null;
  if (params.comentarios !== undefined) body.comentarios = params.comentarios || null;

  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/tickets/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function deleteTicket(id: string): Promise<void> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/tickets/${id}/`, { method: "DELETE" });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
}

// --- Dependencias ------------------------------------------------------------

export async function listDependencias(idTicket: string): Promise<TicketsPaginado<TicketsDependencia>> {
  const params = new URLSearchParams({ id_ticket: idTicket });
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/dependencias/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function createDependencia(params: {
  predecesora: string;
  sucesora: string;
  tipo?: TicketsDependenciaTipo;
  ventajaDesfaseDias?: number;
  comentarios?: string;
}): Promise<TicketsDependencia> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/dependencias/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      predecesora: params.predecesora,
      sucesora: params.sucesora,
      tipo: params.tipo || "ESTRICTO",
      ventaja_desfase_dias: params.ventajaDesfaseDias ?? null,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function deleteDependencia(id: string): Promise<void> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/dependencias/${id}/`, { method: "DELETE" });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
}

// --- Log (bitacora append-only) -----------------------------------------------

export async function listLog(idTicket: string): Promise<TicketsPaginado<TicketsLog>> {
  const params = new URLSearchParams({ id_ticket: idTicket });
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/log/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}

export async function addLog(params: {
  idTicket: string;
  accion: TicketsLogAccion;
  comentario?: string;
  progresoNuevo?: string;
  horasIncurridas?: string;
  descripcionArchivo?: string;
  urlArchivo?: string;
}): Promise<TicketsLog> {
  const response = await apiFetch("TICKETS", `${TICKETS_API_BASE_URL}/api/log/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_ticket: params.idTicket,
      accion: params.accion,
      comentario: params.comentario || null,
      progreso_nuevo: params.progresoNuevo ?? null,
      horas_incurridas: params.horasIncurridas ?? null,
      descripcion_archivo: params.descripcionArchivo || null,
      url_archivo: params.urlArchivo || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("TICKETS", response);
  return response.json();
}
