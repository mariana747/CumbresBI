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

// Espejo de TesoreriaTicketReembolso.CATEGORIA_CHOICES (models.py,
// 31/Ago/2026 - hallazgo de la comparacion contra Tesoreria2.pdf; 4
// categorias agregadas despues en el backend - ADMINISTRACION,
// RECURSOSHUMANOS, LEGAL, EXTRAORDINARIOS - sin actualizar este espejo,
// por eso no aparecian en el dropdown; "OTRO" tampoco existe en el
// backend, se quita).
export type TesoreriaCategoriaGasto =
  | "VIATICOS"
  | "PAPELERIA"
  | "TRANSPORTE"
  | "ALIMENTOS"
  | "HOSPEDAJE"
  | "ADMINISTRACION"
  | "RECURSOSHUMANOS"
  | "LEGAL"
  | "EXTRAORDINARIOS";

export const CATEGORIA_GASTO_LABELS: Record<TesoreriaCategoriaGasto, string> = {
  VIATICOS: "Viáticos",
  PAPELERIA: "Papelería",
  TRANSPORTE: "Transporte",
  ALIMENTOS: "Alimentos",
  HOSPEDAJE: "Hospedaje",
  ADMINISTRACION: "Administración",
  RECURSOSHUMANOS: "Recursos Humanos",
  LEGAL: "Legal",
  EXTRAORDINARIOS: "Extraordinarios",
};

// `centro` (lista cerrada) se elimino 03/Sep/2026 - pedido explicito de
// Mariana en minuta ("centro de costos se elimina"), sin reemplazo aqui
// (division por proyecto es de Solicitud de Pago, no de Reembolso).

// Un gasto individual dentro del ticket (03/Sep/2026, minuta punto 1:
// "solicitar varios conceptos") - mismo patron que CotizacionLinea en
// compras. El ticket requiere al menos uno al crear.
export interface TesoreriaTicketReembolsoConcepto {
  id_concepto: string;
  descripcion: string;
  monto: string;
  categoria_gasto: TesoreriaCategoriaGasto | null;
}

export interface TesoreriaTicketReembolso {
  id_ticket: string;
  id_empleado: string;
  descripcion: string | null;
  conceptos: TesoreriaTicketReembolsoConcepto[];
  monto_total: string;
  moneda: string;
  sociedad: string | null;
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
  // Quien aprobo el ticket y cuando (03/Sep/2026, minuta: "se necesita
  // autorizar antes de pagar") - se llenan solo via la accion aprobar(),
  // nunca via PATCH libre.
  autorizado_por: string | null;
  fecha_autorizacion: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// Ventana de reembolso del mes en curso (03/Sep/2026, pedido de Mariana:
// "que se coloque el dia/mes/año de hasta cuando se aceptan"; campos
// reemplazados 04/Sep/2026 junto con la regla - ver
// reembolso_utils.validar_fecha_limite en el backend).
export interface TesoreriaFechaLimiteReembolso {
  // Los ultimos 2 dias habiles del mes, ascendente [penultimo, ultimo] -
  // unicos dias en que aplica la regla estricta de "mismo dia".
  dias_permitidos: string[];
  hoy_en_dias_permitidos: boolean;
  es_ultimo_dia_habil: boolean;
  ventana_cerrada_por_hora: boolean;
}

export async function getFechaLimiteReembolso(): Promise<TesoreriaFechaLimiteReembolso> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/fecha_limite/`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
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

// Preview embebido (04/Sep/2026, "usa lo mismo que en pld" - ver
// DocumentoPreviewDialog y pld.ts::urlVerDocumento) en vez de mandar al
// link crudo de Drive: sirve el archivo en streaming a traves de
// tesoreria-service, con el mismo control de acceso que list/retrieve.
export function urlVerTicket(idTicket: string): string {
  return `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/ver_ticket/`;
}

export function urlVerFactura(idTicket: string): string {
  return `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/${idTicket}/ver_factura/`;
}

// Crea el registro del ticket (JSON, sin archivo todavia) - el empleado
// sube la foto/comprobante despues con subirFotoTicket(), mismo patron en
// dos pasos que TesoreriaFlujoViewSet (crear -> subir_comprobante).
export async function crearTicketReembolso(params: {
  descripcion?: string;
  conceptos: Array<{ descripcion: string; monto: string; categoriaGasto?: TesoreriaCategoriaGasto }>;
  moneda?: string;
  fechaGasto: string;
  sociedad?: string;
}): Promise<TesoreriaTicketReembolso> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/tickets-reembolso/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      descripcion: params.descripcion || null,
      conceptos: params.conceptos.map((c) => ({
        descripcion: c.descripcion,
        monto: c.monto,
        categoria_gasto: c.categoriaGasto || null,
      })),
      moneda: params.moneda || "MXP",
      fecha_gasto: params.fechaGasto,
      sociedad: params.sociedad || null,
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
