// Cliente de la pantalla PROVISIONAL "MiCumbres" (/mi-cumbres/tickets,
// 27/Ago/2026) - puente minimo para que un empleado pueda subir su ticket
// de reembolso mientras no existe el portal MiCumbres real ni rrhh-service
// tiene API (Fase 5, sin arrancar, ver memoria de sesion
// "rrhh-mi-cumbres-y-modulo-pendiente"). Vive en tesoreria-service porque
// ahi ya esta la infraestructura de Drive/Auditoria/Flujos que necesita -
// NO es el modelo final de RRHH.
// Contrato: services/tesoreria-service/tesoreria/views.py::TesoreriaTicketReembolsoViewSet.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const TESORERIA_API_BASE_URL = process.env.NEXT_PUBLIC_TESORERIA_API_BASE_URL ?? `${GATEWAY_URL}/tesoreria`;

// Flujo real (27/Ago/2026, pedido de Mariana): PENDIENTE -> Tesoreria
// revisa -> APROBADO o RECHAZADO. Solo un ticket APROBADO se puede
// facturar (subir_factura + vincular_factura) -> VINCULADO.
export type TesoreriaTicketEstado = "PENDIENTE" | "APROBADO" | "VINCULADO" | "RECHAZADO";

export interface TesoreriaTicketReembolso {
  id_ticket: string;
  id_empleado: string;
  descripcion: string;
  monto: string;
  fecha_gasto: string;
  estado: TesoreriaTicketEstado;
  link_ticket: string | null;
  drive_file_id_ticket: string | null;
  link_factura_pdf: string | null;
  drive_file_id_factura: string | null;
  factura: string | null;
  factura_folio: string | null;
  flujo: string | null;
  flujo_id: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// El empleado dueño solo ve los suyos; quien tiene tesoreria.editar ve
// todos (filtro real en el backend, ver get_queryset del ViewSet) - este
// cliente no necesita mandar ningun filtro de "es mio" aparte.
export async function listTicketsReembolso(search?: string): Promise<TesoreriaTicketReembolso[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/?${params.toString()}`
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Crea el registro del ticket (JSON, sin archivo todavia) - el empleado
// sube la foto/comprobante despues con subirFotoTicket(), mismo patron en
// dos pasos que TesoreriaFlujoViewSet (crear -> subir_comprobante).
export async function crearTicketReembolso(params: {
  descripcion: string;
  monto: string;
  fechaGasto: string;
}): Promise<TesoreriaTicketReembolso> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      descripcion: params.descripcion,
      monto: params.monto,
      fecha_gasto: params.fechaGasto,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Foto/comprobante del gasto - solo el empleado dueño del ticket puede
// llamarla (el backend ya filtra get_queryset a "sus propios tickets" si
// no tiene tesoreria.editar).
export async function subirFotoTicket(idTicket: string, archivo: File): Promise<TesoreriaTicketReembolso> {
  const formData = new FormData();
  formData.append("file", archivo);
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/subir_ticket/`,
    { method: "POST", body: formData }
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Tesoreria adjunta la factura real (PDF) - requiere tesoreria.editar. El
// Motor Documental corre despues sobre este mismo archivo desde el
// frontend (MotorDocumentalDialog, mismo componente que PLD/Facturas).
export async function subirFacturaTicket(idTicket: string, archivo: File): Promise<TesoreriaTicketReembolso> {
  const formData = new FormData();
  formData.append("file", archivo);
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/subir_factura/`,
    { method: "POST", body: formData }
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Liga el ticket a la factura formal ya creada (timbre_uuid) - solo si el
// ticket ya esta APROBADO (el backend lo valida). tesoreria.editar.
export async function vincularFacturaTicket(
  idTicket: string,
  timbreUuid: string,
  actorUserId?: string
): Promise<TesoreriaTicketReembolso> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/vincular_factura/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factura: timbreUuid, actor_user_id: actorUserId }),
    }
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Liga el ticket al pago real ya capturado en Flujos (tesoreria.editar).
export async function vincularFlujoTicket(
  idTicket: string,
  idFlujo: string,
  actorUserId?: string
): Promise<TesoreriaTicketReembolso> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/vincular_flujo/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flujo: idFlujo, actor_user_id: actorUserId }),
    }
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Primer paso de la revision: acepta el gasto como valido (todavia sin
// factura ni pago) - solo desde PENDIENTE. tesoreria.editar.
export async function aprobarTicket(
  idTicket: string,
  comentarios?: string,
  actorUserId?: string
): Promise<TesoreriaTicketReembolso> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/aprobar/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios, actor_user_id: actorUserId }),
    }
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Contraparte de aprobarTicket() - solo desde PENDIENTE. tesoreria.editar.
export async function rechazarTicket(
  idTicket: string,
  comentarios?: string,
  actorUserId?: string
): Promise<TesoreriaTicketReembolso> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/rechazar/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios, actor_user_id: actorUserId }),
    }
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}
