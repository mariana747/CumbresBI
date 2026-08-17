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

// Superset del tipo minimo usado en admin/invitaciones/page.tsx (pestaña "Temporales") - mismo
// contrato de API, aqui se listan todos los campos que la tabla de
// expedientes necesita mostrar.
export interface PldContraparteKyc {
  id_kyc: string;
  id_contraparte: string;
  curp: string | null;
  nacionalidad: string | null;
  estado_cuenta: "ACTIVA" | "SOSPECHOSA" | "CONGELADA";
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
  created_by: string;
  updated_at: string;
  updated_by: string;
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

export async function getKyc(idKyc: string): Promise<PldContraparteKyc & PldDatosEditables> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/`);
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Expediente minimo/autonomo (17/Ago/2026, Opcion B - ver memoria de sesion
// "pld-crear-expediente-opcion-b"): el analista solo da de alta el
// contenedor vacio (opcionalmente ligado a una sociedad); id_contraparte se
// autogenera en el backend si no se manda. El resto de los datos del
// cliente los llena el cliente mismo despues via el link publico
// (pld-ticket/[token]/page.tsx, actualizarDatosPublico).
export async function createKyc(params: {
  createdBy: string;
  sociedadRfc?: string;
  idContraparte?: string;
}): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      created_by: params.createdBy,
      updated_by: params.createdBy,
      sociedad_rfc: params.sociedadRfc || undefined,
      id_contraparte: params.idContraparte || undefined,
    }),
  });
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

// Los campos editables por el cliente (mismo conjunto que
// PLD_CAMPOS_CONFIRMABLES) como tipo, para el formulario publico de
// pld-ticket/[token]/page.tsx - el serializer real regresa todos los
// campos del modelo, PldContraparteKyc arriba solo tiene el subconjunto
// que usan las pantallas internas.
export type PldDatosEditables = Partial<Record<(typeof PLD_CAMPOS_CONFIRMABLES)[number], string | null>>;

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

// Semaforo de estado_cuenta (17/Ago/2026, vista de detalle) - mismo peso de
// decision que aprobarKyc, mismo permiso (pld-compliance.aprobar).
async function cambiarEstadoCuenta(idKyc: string, accion: "marcar_sospechoso" | "congelar" | "reactivar_cuenta") {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/${accion}/`, { method: "POST" });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export const marcarSospechosoKyc = (idKyc: string) => cambiarEstadoCuenta(idKyc, "marcar_sospechoso");
export const congelarKyc = (idKyc: string) => cambiarEstadoCuenta(idKyc, "congelar");
export const reactivarCuentaKyc = (idKyc: string) => cambiarEstadoCuenta(idKyc, "reactivar_cuenta");

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
): Promise<{ ticket: PldTicketCliente; kyc?: PldContraparteKyc & PldDatosEditables }> {
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

// Formulario publico de KYC externo (docs/architecture/pld-fase2-alcance.md
// sec. 2): el cliente sube un documento sin sesion, canjeando el mismo
// token del link. No consume el "uso" del ticket (eso ya lo maneja
// validarTicketCliente, llamado al cargar la pagina) - ver
// services/pld-service/pld/views.py::subir_documento.
export type ResultadoSubidaDocumento =
  | ({ nombre_archivo: string; ok: true } & PldContraparteDoc)
  | { nombre_archivo: string; ok: false; detail?: string };

// Acepta uno o varios archivos en la misma petición - un solo reCAPTCHA
// cubre todo el lote (decision 17/Ago/2026, ver pld/views.py::subir_documento:
// un reCAPTCHA real de Google solo es valido una vez, pedirlo por archivo
// seria mala experiencia). La respuesta trae un resultado por archivo -
// algunos pueden fallar aunque otros si se hayan subido, no es atomico.
export async function subirDocumentosPublico(params: {
  token: string;
  recaptchaToken: string;
  files: File[];
  denominacion?: string;
}): Promise<ResultadoSubidaDocumento[]> {
  const formData = new FormData();
  formData.append("token", params.token);
  formData.append("recaptcha_token", params.recaptchaToken);
  params.files.forEach((file) => formData.append("file", file));
  if (params.denominacion) formData.append("denominacion", params.denominacion);

  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/ticket-cliente/subir_documento/`, {
    method: "POST",
    body: formData,
  });
  // 201 (todos ok) y 207 (parcial) traen el mismo shape - solo un error de
  // verdad (token/recaptcha invalidos, etc.) no trae "resultados".
  if (!response.ok && response.status !== 207) {
    throw await friendlyApiError("PLD", response);
  }
  const data = await response.json();
  return data.resultados;
}

// Formulario publico de datos del expediente (17/Ago/2026, mismo link que
// subirDocumentosPublico): el cliente escribe/corrige sus propios datos de
// KYC sin sesion. Solo campos en PLD_CAMPOS_CONFIRMABLES - el backend
// ignora silenciosamente cualquier otra llave (ver
// pld/views.py::actualizar_datos).
export async function actualizarDatosPublico(params: {
  token: string;
  campos: PldDatosEditables;
}): Promise<PldContraparteKyc & PldDatosEditables> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/ticket-cliente/actualizar_datos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: params.token, campos: params.campos }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
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
