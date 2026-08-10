// Cliente de pld-service. Contrato: services/pld-service/pld/views.py
// (GET/POST /api/kyc/, /api/kyc/{id}/aprobar/, /api/kyc-docs/).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

export type PldEstadoLlenado = "PENDIENTE" | "INCOMPLETO" | "ENTREGADO";
export type PldDocStatus = "PENDIENTE" | "INCOMPLETO" | "ENTREGADO" | "APROBADO";

export interface PldContraparteDoc {
  id_kyc_doc: string;
  kyc: string;
  denominacion: string | null;
  detalles_adicionales: string | null;
  status: PldDocStatus | null;
  link_documento: string | null;
  fecha_solicitud: string | null;
  fecha_limite: string | null;
  fecha_entrega: string | null;
  fecha_cierre: string | null;
  comentarios: string | null;
  created_at: string;
  updated_at: string;
}

// Superset del tipo minimo usado en admin/magic-links/page.tsx - mismo
// contrato de API, aqui se listan todos los campos que la tabla de
// expedientes necesita mostrar.
export interface PldContraparteKyc {
  id_kyc: string;
  id_contraparte: string;
  curp: string | null;
  nacionalidad: string | null;
  estado_llenado: PldEstadoLlenado;
  aprobado_por: string | null;
  aprobado_en: string | null;
  comentarios: string | null;
  documentos: PldContraparteDoc[];
  created_at: string;
  updated_at: string;
  fecha_vencimiento: string | null;
}

const PLD_API_BASE_URL = process.env.NEXT_PUBLIC_PLD_API_BASE_URL ?? `${GATEWAY_URL}/pld`;

export async function listKyc(params?: {
  estadoLlenado?: string;
  search?: string;
}): Promise<PldContraparteKyc[]> {
  const query = new URLSearchParams();
  if (params?.estadoLlenado) query.set("estado_llenado", params.estadoLlenado);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();

  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export async function aprobarKyc(idKyc: string, aprobadoPor: string): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/aprobar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aprobado_por: aprobadoPor }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Ticket de cliente externo para KYC (Fase 2, Semana 9) - mismo patron que
// IamMagicLink (iam-service, ver src/lib/iam.ts), pero sin JWT propio:
// pld-service no tiene llave privada, "validar" regresa el ticket + el
// expediente KYC anidado directamente. Contrato:
// services/pld-service/pld/views.py, PldTicketClienteViewSet.
export interface PldTicketCliente {
  id_pld_ticket: string;
  kyc: string | null;
  email: string;
  issued_at: string;
  issued_by: string;
  expires_at: string;
  max_uses: number;
  uses_count: number;
  first_used_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  // Solo presente en la respuesta de createTicketCliente() - el token en
  // claro se expone una unica vez, nunca se guarda (ver ticket_utils.py).
  token?: string;
}

export async function listTicketsCliente(kycId?: string): Promise<PldTicketCliente[]> {
  const params = new URLSearchParams();
  if (kycId) params.set("kyc", kycId);
  const qs = params.toString();
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/ticket-cliente/${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// A diferencia de IamMagicLink (que calcula expires_at server-side desde
// expires_in_minutes), el serializer de PldTicketCliente requiere
// expires_at/max_uses ya resueltos - se calculan aqui, mismo default (30
// min) que Magic Links para consistencia entre los dos flujos de acceso
// externo.
export async function createTicketCliente(params: {
  kycId?: string;
  email: string;
  issuedBy: string;
  expiresInMinutes?: number;
  maxUses?: number;
}): Promise<PldTicketCliente> {
  const expiresAt = new Date(Date.now() + (params.expiresInMinutes ?? 30) * 60_000).toISOString();
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/ticket-cliente/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kyc: params.kycId || null,
      email: params.email,
      issued_by: params.issuedBy,
      expires_at: expiresAt,
      max_uses: params.maxUses ?? 1,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// A diferencia de validateMagicLink (que regresa un jwt de alcance
// externo), pld-service no tiene llave privada - regresa el ticket y,
// si tiene expediente asociado, el KYC anidado directamente.
export async function validarTicketCliente(
  token: string
): Promise<{ ticket: PldTicketCliente; kyc?: PldContraparteKyc }> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/ticket-cliente/validar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    // Consumida tambien por la pagina publica (app/pld-ticket/[token]/page.tsx)
    // - el mensaje se le muestra directo a un usuario externo.
    throw await friendlyApiError("PLD", response);
  }
  const data = await response.json();
  const { kyc, ...ticket } = data;
  return { ticket, kyc };
}

export async function revocarTicketCliente(idPldTicket: string): Promise<PldTicketCliente> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/ticket-cliente/${idPldTicket}/revocar/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}
