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

// Espejo completo de PldContraparteKycSerializer (pld/serializers.py) - antes
// solo traia el subconjunto que la tabla de /pld mostraba en columnas; se
// completo el 13/Ago/2026 para la vista de detalle (KycDetalleDialog.tsx),
// que si necesita todos los campos que el Motor Documental puede llenar.
export interface PldContraparteKyc {
  id_kyc: string;
  id_contraparte: string;
  fecha_nac_const: string | null;
  pais_nac_const: string | null;
  folio_mercantil: string | null;
  objeto_social: string | null;
  curp: string | null;
  nacionalidad: string | null;
  ocupacion_act_economica: string | null;
  dom_calle: string | null;
  dom_numero_ext: string | null;
  dom_numero_int: string | null;
  dom_colonia: string | null;
  dom_municipio_alcaldia: string | null;
  dom_estado: string | null;
  dom_cp: string | null;
  dom_pais: string | null;
  tipo_identificacion: string | null;
  autoridad_identificacion: string | null;
  numero_identificacion: string | null;
  dom_corresp_dom_calle: string | null;
  dom_corresp_dom_numero_ext: string | null;
  dom_corresp_dom_numero_int: string | null;
  dom_corresp_dom_colonia: string | null;
  dom_corresp_dom_municipio_alcaldia: string | null;
  dom_corresp_dom_estado: string | null;
  dom_corresp_dom_cp: string | null;
  dom_corresp_dom_pais: string | null;
  telefono_fijo: string | null;
  telefono_sms: string | null;
  estado_civil: string | null;
  ident_fideicomiso: string | null;
  link_carpeta: string | null;
  link_plantillas: string | null;
  link_documento_pld: string | null;
  estado_llenado: PldEstadoLlenado;
  // Workflow hibrido (pld/signals.py): true si el analista edito
  // estado_llenado a mano - a partir de ahi deja de recalcularse solo
  // segun el status de los documentos, hasta reactivarAutoEstadoKyc().
  estado_llenado_manual: boolean;
  aprobado_por: string | null;
  aprobado_en: string | null;
  comentarios: string | null;
  documentos: PldContraparteDoc[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
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

// Whitelist en espejo de PldContraparteKycViewSet.CAMPOS_CONFIRMABLES
// (views.py) - solo informativo aqui, el backend es quien realmente filtra;
// se usa para no ni intentar mandar llaves de extracted_data que el
// expediente no tiene columna para guardar (ej. "nombre_completo").
export const PLD_CAMPOS_CONFIRMABLES = [
  "fecha_nac_const",
  "pais_nac_const",
  "folio_mercantil",
  "objeto_social",
  "curp",
  "nacionalidad",
  "ocupacion_act_economica",
  "dom_calle",
  "dom_numero_ext",
  "dom_numero_int",
  "dom_colonia",
  "dom_municipio_alcaldia",
  "dom_estado",
  "dom_cp",
  "dom_pais",
  "tipo_identificacion",
  "autoridad_identificacion",
  "numero_identificacion",
  "dom_corresp_dom_calle",
  "dom_corresp_dom_numero_ext",
  "dom_corresp_dom_numero_int",
  "dom_corresp_dom_colonia",
  "dom_corresp_dom_municipio_alcaldia",
  "dom_corresp_dom_estado",
  "dom_corresp_dom_cp",
  "dom_corresp_dom_pais",
  "telefono_fijo",
  "telefono_sms",
  "estado_civil",
  "ident_fideicomiso",
  "comentarios",
] as const;

// Confirma en el expediente los datos ya revisados por el analista (Motor
// Documental -> docint/analyze -> correccion en pantalla -> este endpoint).
// Ver services/pld-service/pld/views.py::confirmar_extraccion.
export async function confirmarExtraccionKyc(
  idKyc: string,
  campos: Record<string, unknown>
): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/confirmar_extraccion/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campos }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Apaga estado_llenado_manual y recalcula de inmediato segun los
// documentos actuales del expediente. Ver
// services/pld-service/pld/views.py::reactivar_auto_estado.
export async function reactivarAutoEstadoKyc(idKyc: string): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/reactivar_auto_estado/`, {
    method: "POST",
  });
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
