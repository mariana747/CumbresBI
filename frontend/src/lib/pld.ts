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
  drive_file_id: string | null;
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
  // Snapshot de solo lectura (25/Ago/2026) - ver
  // services/pld-service/pld/models.py::sociedad_nombre.
  sociedad_nombre: string | null;
  nombre_completo: string | null;
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

// URL del boton "Ver documento" (25/Ago/2026, hallazgo real: el link crudo
// de Drive (doc.link_documento) requiere que el usuario tenga acceso
// directo a la Unidad compartida de Google - un analista con permiso real
// en CumbresBI pero sin membresia en ese grupo se topaba con "No tienes
// acceso" de Google). Sirve el archivo a traves de pld-service
// (PldContraparteDocViewSet.ver), que reenvia la sesion del usuario a
// drive-service y este valida el mismo permiso contra su rol real de
// CumbresBI - el acceso ya no depende de la cuenta personal de Google de
// quien mira. No es un fetch (es una URL para <a href>/window.open) - la
// cookie de sesion viaja sola en la navegacion normal del navegador.
export function urlVerDocumento(idKycDoc: string): string {
  return `${PLD_API_BASE_URL}/api/kyc-docs/${idKycDoc}/ver/`;
}

// Solicitud de eliminacion de documento (25/Ago/2026, requerimiento real
// del cliente) - desde que gestionar archivos quedo exclusivo de Admin, el
// analista (pld-compliance.editar) ya no puede borrar un documento directo;
// pide su eliminacion con una razon breve, solo Admin (pld-documentos.editar)
// la aprueba (borra de verdad) o la rechaza. Ver
// services/pld-service/pld/views.py::PldSolicitudEliminacionDocViewSet.
export type PldSolicitudEstado = "PENDIENTE" | "APROBADA" | "RECHAZADA";

export interface PldSolicitudEliminacionDoc {
  id_solicitud: string;
  documento: string | null;
  documento_kyc: string | null;
  denominacion_doc: string | null;
  razon: string;
  estado: PldSolicitudEstado;
  solicitado_por: string;
  solicitado_en: string;
  resuelto_por: string | null;
  resuelto_en: string | null;
  comentario_resolucion: string | null;
}

// Sin ?kyc= propio en el backend (el endpoint no conoce el expediente,
// solo el documento) - el llamador filtra el resultado contra los
// id_kyc_doc del expediente que le interesa (ver
// app/pld/[idKyc]/page.tsx).
export async function listSolicitudesEliminacion(params?: {
  estado?: PldSolicitudEstado;
}): Promise<PldSolicitudEliminacionDoc[]> {
  const query = new URLSearchParams();
  if (params?.estado) query.set("estado", params.estado);
  const qs = query.toString();
  const response = await apiFetch(
    "PLD",
    `${PLD_API_BASE_URL}/api/solicitudes-eliminacion-doc/${qs ? `?${qs}` : ""}`
  );
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export async function crearSolicitudEliminacion(params: {
  idKycDoc: string;
  razon: string;
  solicitadoPor: string;
}): Promise<PldSolicitudEliminacionDoc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/solicitudes-eliminacion-doc/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documento: params.idKycDoc,
      razon: params.razon,
      solicitado_por: params.solicitadoPor,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

async function _resolverSolicitud(
  idSolicitud: string,
  accion: "aprobar" | "rechazar",
  actorUserId?: string | null,
  comentarioResolucion?: string
): Promise<PldSolicitudEliminacionDoc> {
  const response = await apiFetch(
    "PLD",
    `${PLD_API_BASE_URL}/api/solicitudes-eliminacion-doc/${idSolicitud}/${accion}/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_user_id: actorUserId, comentario_resolucion: comentarioResolucion }),
    }
  );
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export const aprobarSolicitudEliminacion = (
  idSolicitud: string,
  actorUserId?: string | null,
  comentarioResolucion?: string
) => _resolverSolicitud(idSolicitud, "aprobar", actorUserId, comentarioResolucion);

export const rechazarSolicitudEliminacion = (
  idSolicitud: string,
  actorUserId?: string | null,
  comentarioResolucion?: string
) => _resolverSolicitud(idSolicitud, "rechazar", actorUserId, comentarioResolucion);

export async function listKyc(params?: {
  estadoLlenado?: string;
  search?: string;
  // 31/Ago/2026 (pedido de Mariana: "de ahi debe tener filtro para poder
  // ver unicamente los de una sociedad o la otra") - un analista con
  // acceso a varias sociedades las ve todas mezcladas por default; este
  // filtro acota la vista sin tocar el scope real de la sesion.
  sociedadRfc?: string;
  proyecto?: string;
}): Promise<PldContraparteKyc[]> {
  const query = new URLSearchParams();
  if (params?.estadoLlenado) query.set("estado_llenado", params.estadoLlenado);
  if (params?.search) query.set("search", params.search);
  if (params?.sociedadRfc) query.set("sociedad", params.sociedadRfc);
  if (params?.proyecto) query.set("proyecto", params.proyecto);
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
  // 25/Ago/2026 (requerimiento real del cliente) - obligatorio, elegido de
  // un dropdown real (lib/iam.ts::listSociedades) - el backend tambien lo
  // exige y valida contra iam-service, ver pld/views.py::
  // PldContraparteKycViewSet.create.
  sociedadRfc: string;
  idContraparte?: string;
  // 31/Ago/2026 (pedido de Mariana: "hay que hacer ese filtro por
  // sociedad y proyecto" - caso real de un colaborador externo acotado a
  // un solo proyecto, ej. abogada externa) - opcional, a diferencia de
  // sociedadRfc; sin catalogo real todavia (mismo criterio que
  // TesoreriaContrato.proyecto), texto libre.
  proyecto?: string;
}): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      created_by: params.createdBy,
      updated_by: params.createdBy,
      sociedad_rfc: params.sociedadRfc,
      proyecto: params.proyecto || undefined,
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
// expediente no tiene columna para guardar. "nombre_completo" (18/Ago/2026)
// tambien recibe "razon_social"/"razon_social_o_nombre" de la extraccion -
// ver ALIAS_CAMPOS en pld/views.py, el backend hace la traduccion real.
export const PLD_CAMPOS_CONFIRMABLES = [
  "nombre_completo",
  // Alias que el backend traduce a "nombre_completo" antes de guardar (ver
  // ALIAS_CAMPOS en pld/views.py) - deben seguir en esta lista para que el
  // filtro de MotorDocumentalDialog.tsx no los descarte antes de mandarlos.
  "razon_social",
  "razon_social_o_nombre",
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
  campos: Record<string, unknown>,
  actorUserId?: string | null
): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/confirmar_extraccion/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campos, actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Edicion manual del expediente por el analista (18/Ago/2026) - PATCH
// generico, ya auditado en el backend (ver
// services/pld-service/pld/views.py::PldContraparteKycViewSet.update):
// emite pld_contrapartes_kyc.editar con el diff real, actor resuelto de
// "updated_by" (mismo campo que ya se manda aqui, no un actor_user_id
// aparte). Requiere pld-compliance.editar - mismo permiso que
// confirmar_extraccion.
export async function editarKyc(
  idKyc: string,
  campos: PldDatosEditables,
  updatedBy?: string | null
): Promise<PldContraparteKyc & PldDatosEditables> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...campos, updated_by: updatedBy }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Solo BORRA los documentos cuyo archivo ya no existe en Drive
// (hallazgo real, 18/Ago/2026: si alguien borra un archivo directo en
// drive.google.com, la app se quedaba mostrandolo como si siguiera ahi).
// 25/Ago/2026 (requerimiento real del cliente: "nadie modifica en Drive,
// todo desde CumbresBI") - ya NO agrega documentos por archivos subidos
// directo en Drive, eso legitimaba justo la edicion manual ahora
// prohibida (revierte la decision "Drive-first a proposito" del 18/Ago).
// Ver services/pld-service/pld/views.py::verificar_documentos.
export async function verificarDocumentosKyc(
  idKyc: string,
  actorUserId?: string | null
): Promise<PldContraparteKyc & { documentos_eliminados: DocumentoEliminadoResumen[] }> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/verificar_documentos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Uploader interno del analista (25/Ago/2026 - unico camino real para
// agregar un archivo al expediente, junto con el link publico del
// cliente). Dos pasos, mismo criterio que el backend: 1) crea el registro
// de metadata (denominacion = nombre del archivo), 2) sube el archivo real
// a Drive con subirArchivoDocumento. Requiere pld-documentos.crear - ver
// services/pld-service/pld/views.py::PldContraparteDocViewSet.
export async function crearDocumentoKyc(
  idKyc: string,
  denominacion: string,
  createdBy?: string | null
): Promise<PldContraparteDoc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc-docs/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kyc: idKyc,
      denominacion,
      created_by: createdBy,
      updated_by: createdBy,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Sube el archivo real a Drive para un documento ya creado (ver
// crearDocumentoKyc arriba). Ver
// services/pld-service/pld/views.py::PldContraparteDocViewSet.subir.
export async function subirArchivoDocumento(
  idKycDoc: string,
  archivo: File,
  actorUserId?: string | null
): Promise<PldContraparteDoc> {
  const formData = new FormData();
  formData.append("file", archivo);
  if (actorUserId) formData.append("actor_user_id", actorUserId);

  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc-docs/${idKycDoc}/subir/`, {
    method: "POST",
    body: formData,
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

// Borrado manual de un documento (18/Ago/2026, decision de Mariana: los
// duplicados se borran a mano, no automatico - "Verificar en Drive" solo
// borra lo que ya no existe en Drive). Requiere pld-compliance.editar - ver
// services/pld-service/pld/views.py::PldContraparteDocViewSet.get_permissions.
export async function eliminarDocumentoKyc(idKycDoc: string, actorUserId?: string | null): Promise<void> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc-docs/${idKycDoc}/`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
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
async function cambiarEstadoCuenta(
  idKyc: string,
  accion: "marcar_sospechoso" | "congelar" | "reactivar_cuenta",
  actorUserId?: string | null
) {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/${accion}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export const marcarSospechosoKyc = (idKyc: string, actorUserId?: string | null) =>
  cambiarEstadoCuenta(idKyc, "marcar_sospechoso", actorUserId);
export const congelarKyc = (idKyc: string, actorUserId?: string | null) =>
  cambiarEstadoCuenta(idKyc, "congelar", actorUserId);
export const reactivarCuentaKyc = (idKyc: string, actorUserId?: string | null) =>
  cambiarEstadoCuenta(idKyc, "reactivar_cuenta", actorUserId);

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

// 31/Ago/2026 (pedido de Mariana: "igual en tickets debe tener filtro") -
// sociedadRfc acota la vista sin cambiar el scope real de la sesion,
// mismo criterio que listKyc().
export async function listTicketsCliente(kycId?: string, sociedadRfc?: string): Promise<PldTicketCliente[]> {
  const params = new URLSearchParams();
  if (kycId) params.set("kyc", kycId);
  if (sociedadRfc) params.set("sociedad", sociedadRfc);
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

// Resumen de un documento que "validar" borro de la base de datos porque
// ya no existe en Drive (18/Ago/2026, ver pld/views.py::
// _limpiar_documentos_borrados_en_drive) - solo lo minimo para avisar en
// pantalla que documento hay que volver a subir.
export interface DocumentoEliminadoResumen {
  id_kyc_doc: string;
  denominacion: string | null;
}

// A diferencia de validateMagicLink (que regresa un jwt de alcance
// externo), pld-service no tiene llave privada - regresa el ticket y,
// si tiene expediente asociado, el KYC anidado directamente.
//
// Cada llamada tambien limpia contra Drive real los documentos del
// expediente (ver docstring de validar() en pld/views.py) - "kyc.documentos"
// ya viene sin los que se detectaron borrados; documentosEliminados trae el
// resumen de lo que se quito, para poder avisarle al cliente que vuelva a
// subirlos.
export async function validarTicketCliente(
  token: string
): Promise<{
  ticket: PldTicketCliente;
  kyc?: PldContraparteKyc & PldDatosEditables;
  documentosEliminados: DocumentoEliminadoResumen[];
}> {
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
  const { kyc, documentos_eliminados, ...ticket } = data;
  return { ticket, kyc, documentosEliminados: documentos_eliminados ?? [] };
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
//
// aceptaPoliticas/declaraVeracidad (25/Ago/2026, requerimiento real del
// cliente) - obligatorios, el backend los rechaza con 400 si falta
// cualquiera de los dos. Quedan guardados en el expediente
// (politicas_aceptadas_en/veracidad_declarada_en) como evidencia real del
// consentimiento, no solo validados en pantalla.
export async function actualizarDatosPublico(params: {
  token: string;
  campos: PldDatosEditables;
  aceptaPoliticas: boolean;
  declaraVeracidad: boolean;
}): Promise<PldContraparteKyc & PldDatosEditables> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/ticket-cliente/actualizar_datos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: params.token,
      campos: params.campos,
      acepta_politicas: params.aceptaPoliticas,
      declara_veracidad: params.declaraVeracidad,
    }),
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
