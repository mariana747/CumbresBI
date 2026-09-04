// Cliente de pld-service. Contrato: services/pld-service/pld/views.py
// (GET/POST /api/kyc/, /api/kyc/{id}/aprobar/, /api/kyc-docs/).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

export type PldEstadoLlenado = "PENDIENTE" | "INCOMPLETO" | "ENTREGADO";
export type PldDocStatus = "PENDIENTE" | "INCOMPLETO" | "ENTREGADO" | "APROBADO";

// Catalogo cerrado completo (04/Sep/2026, checklist de proveedores):
// identidad + especifico de cumplimiento - se duplica a proposito contra
// el catalogo por contrato de tesoreria-service ("no importa si se piden
// lo mismo", Mariana). Espejo de PldContraparteDoc.TIPO_DOCUMENTO_CHOICES
// (pld-service/pld/models.py).
export type PldTipoDocumento =
  | "IDENTIFICACION_OFICIAL"
  | "ACTA_CONSTITUTIVA"
  | "CONSTANCIA_SITUACION_FISCAL"
  | "INSCRIPCION_RPC"
  | "INFO_BANCARIA"
  | "VALIDACION_TITULARIDAD_CUENTA"
  | "OPINION_CUMPLIMIENTO"
  | "COMPROBANTE_DOMICILIO"
  | "CUESTIONARIO_RIESGO"
  | "DECLARACION_ORIGEN_FONDOS"
  | "EVIDENCIA_PEP"
  | "ORGANIGRAMA_ACCIONARIO";

export const TIPO_DOCUMENTO_PLD_LABELS: Record<PldTipoDocumento, string> = {
  IDENTIFICACION_OFICIAL: "Identificación oficial",
  ACTA_CONSTITUTIVA: "Acta constitutiva",
  CONSTANCIA_SITUACION_FISCAL: "Constancia de Situación Fiscal",
  INSCRIPCION_RPC: "Inscripción en el Registro Público de Comercio",
  INFO_BANCARIA: "Carátula / información bancaria",
  VALIDACION_TITULARIDAD_CUENTA: "Validación de titularidad de la cuenta",
  OPINION_CUMPLIMIENTO: "Opinión de Cumplimiento (SAT)",
  COMPROBANTE_DOMICILIO: "Comprobante de domicilio",
  CUESTIONARIO_RIESGO: "Cuestionario de riesgo",
  DECLARACION_ORIGEN_FONDOS: "Declaración de origen de fondos",
  EVIDENCIA_PEP: "Evidencia de análisis PEP",
  ORGANIGRAMA_ACCIONARIO: "Organigrama accionario (KYB)",
};

// Que opciones se ofrecen segun la categoria del expediente (04/Sep,
// pedido explicito: "que se muestre para los C unicamente los que
// necesite y la B solo las que necesite") - espejo de
// PldContraparteDoc.TIPOS_DOCUMENTO_POR_CATEGORIA en el backend. Sin
// entrada para PENDIENTE_REVISION a proposito - un expediente sin
// clasificar todavia ve el catalogo completo (union de KYC+KYB), no se le
// puede ocultar nada hasta saber si es fisica o moral.
export const TIPOS_DOCUMENTO_POR_CATEGORIA: Record<"KYC" | "KYB", PldTipoDocumento[]> = {
  KYC: [
    "IDENTIFICACION_OFICIAL",
    "CONSTANCIA_SITUACION_FISCAL",
    "INFO_BANCARIA",
    "VALIDACION_TITULARIDAD_CUENTA",
    "OPINION_CUMPLIMIENTO",
    "COMPROBANTE_DOMICILIO",
    "CUESTIONARIO_RIESGO",
    "DECLARACION_ORIGEN_FONDOS",
    "EVIDENCIA_PEP",
  ],
  KYB: [
    "ACTA_CONSTITUTIVA",
    "CONSTANCIA_SITUACION_FISCAL",
    "INSCRIPCION_RPC",
    "INFO_BANCARIA",
    "VALIDACION_TITULARIDAD_CUENTA",
    "OPINION_CUMPLIMIENTO",
    "COMPROBANTE_DOMICILIO",
    "CUESTIONARIO_RIESGO",
    "DECLARACION_ORIGEN_FONDOS",
    "EVIDENCIA_PEP",
    "ORGANIGRAMA_ACCIONARIO",
  ],
};

// Opciones a mostrar en el Select segun la categoria del expediente - las
// dos listas de arriba si es KYC/KYB, la union completa (sin duplicados)
// si todavia esta PENDIENTE_REVISION o sin clasificar.
export function tiposDocumentoDisponibles(
  categoria: PldCategoriaCumplimiento | null
): PldTipoDocumento[] {
  if (categoria === "KYC" || categoria === "KYB") {
    return TIPOS_DOCUMENTO_POR_CATEGORIA[categoria];
  }
  return Array.from(new Set([...TIPOS_DOCUMENTO_POR_CATEGORIA.KYC, ...TIPOS_DOCUMENTO_POR_CATEGORIA.KYB]));
}

export interface PldContraparteDoc {
  id_kyc_doc: string;
  kyc: string;
  tipo_documento: PldTipoDocumento | null;
  denominacion: string | null;
  detalles_adicionales: string | null;
  status: PldDocStatus | null;
  // obligatorio/vigencia_meses (04/Sep/2026, pendiente desde la peticion
  // del 18/Ago) - fecha_vencimiento_documento/vencido son de solo lectura,
  // calculados en el backend a partir de fecha_entrega + vigencia_meses.
  obligatorio: boolean;
  vigencia_meses: number | null;
  fecha_vencimiento_documento: string | null;
  vencido: boolean;
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

// KYC/KYB (04/Sep/2026, decision de Mariana: "vamos a tener KYC y KYB") -
// se deriva sola de tipo_persona salvo override manual, mismo patron
// hibrido que estado_llenado_manual. PENDIENTE_REVISION es el "caso raro"
// (fideicomiso, tipo_persona vacio) que un analista debe clasificar a mano.
export type PldCategoriaCumplimiento = "KYC" | "KYB" | "PENDIENTE_REVISION";

export const CATEGORIA_CUMPLIMIENTO_LABELS: Record<PldCategoriaCumplimiento, string> = {
  KYC: "KYC",
  KYB: "KYB",
  PENDIENTE_REVISION: "Pendiente de revisión",
};

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
  categoria_cumplimiento: PldCategoriaCumplimiento | null;
  categoria_cumplimiento_manual: boolean;
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
  // categoria_cumplimiento (04/Sep/2026, pedido de Mariana: "en pld hay
  // que tener tabs de KYC y KYB") - filtra la lista por KYC/KYB/
  // PENDIENTE_REVISION, mismo criterio que los demas filtros de arriba.
  categoriaCumplimiento?: PldCategoriaCumplimiento;
}): Promise<(PldContraparteKyc & PldDatosEditables)[]> {
  const query = new URLSearchParams();
  if (params?.estadoLlenado) query.set("estado_llenado", params.estadoLlenado);
  if (params?.search) query.set("search", params.search);
  if (params?.sociedadRfc) query.set("sociedad", params.sociedadRfc);
  if (params?.proyecto) query.set("proyecto", params.proyecto);
  if (params?.categoriaCumplimiento) query.set("categoria_cumplimiento", params.categoriaCumplimiento);
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
  // tipo_persona (02/Sep/2026, pedido explicito: filtrar el catalogo UIF
  // de ocupacion/actividad economica segun fisica/moral) - solo lo edita
  // el analista via /pld/[idKyc] (PATCH normal, ver update() en
  // pld-service/pld/views.py), NO se agrego al whitelist real del backend
  // para el formulario publico/Motor Documental (CAMPOS_CONFIRMABLES en
  // views.py) - esta en esta lista de TypeScript solo porque
  // PldDatosEditables/GRUPOS_CAMPOS_GENERAL en el detalle del expediente
  // se tipan contra ella, no porque el cliente externo pueda tocarlo.
  "tipo_persona",
  // nombre/apellido_paterno/apellido_materno (02/Sep/2026, pedido
  // explicito: dividir el nombre en 3 campos SOLO para persona fisica) -
  // el analista via /pld/[idKyc] y el cliente via pld-ticket/[token] los
  // editan (ya estan en CAMPOS_CONFIRMABLES en pld-service/pld/views.py).
  "nombre",
  "apellido_paterno",
  "apellido_materno",
  // rfc (02/Sep/2026, pedido explicito: "Requerir de forma obligatoria el
  // RFC con homoclave") - no existia como campo propio del expediente
  // hasta ahora (TesoreriaContraparte.rfc, en tesoreria-service, es un
  // registro distinto). Tambien en CAMPOS_CONFIRMABLES del backend.
  "rfc",
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
  "email",
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

// Reclasificar KYC/KYB a mano (04/Sep/2026) - solo tiene caso de uso real
// para los "casos raros" que quedan en PENDIENTE_REVISION (fideicomiso,
// tipo_persona vacio); el backend prende categoria_cumplimiento_manual
// solo al detectar este campo en el PATCH (ver
// PldContraparteKycSerializer.update), a partir de ahi deja de
// recalcularse solo si tipo_persona cambia despues.
export async function reclasificarCategoriaCumplimiento(
  idKyc: string,
  categoria: PldCategoriaCumplimiento,
  updatedBy?: string | null
): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoria_cumplimiento: categoria, updated_by: updatedBy }),
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

// Checklist de documentos requeridos (04/Sep/2026, 3 estados: vacío/
// solicitado/recibido) - crea el renglón SIN archivo todavía ("Solicitar"),
// a diferencia de crearDocumentoKyc (que siempre acompaña un archivo real
// en el mismo flujo). Queda en status PENDIENTE hasta que alguien suba el
// archivo con subirArchivoDocumento sobre este mismo id_kyc_doc.
export async function solicitarDocumentoKyc(
  idKyc: string,
  tipoDocumento: PldTipoDocumento,
  createdBy?: string | null
): Promise<PldContraparteDoc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc-docs/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kyc: idKyc,
      tipo_documento: tipoDocumento,
      denominacion: TIPO_DOCUMENTO_PLD_LABELS[tipoDocumento],
      status: "PENDIENTE",
      created_by: createdBy,
      updated_by: createdBy,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Clasificar un documento ya subido (04/Sep/2026: tipo_documento del
// catalogo cerrado, obligatorio, vigencia_meses) - el uploader sigue
// creando el documento con solo el nombre del archivo (ver
// handleSubirDocumento en la pantalla), esto se llena despues inline en la
// tabla. Requiere pld-compliance.editar (mismo permiso que editarKyc).
export async function editarDocumentoKyc(
  idKycDoc: string,
  campos: Partial<Pick<PldContraparteDoc, "tipo_documento" | "obligatorio" | "vigencia_meses">>,
  updatedBy?: string | null
): Promise<PldContraparteDoc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc-docs/${idKycDoc}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...campos, updated_by: updatedBy }),
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

// Representante legal / apoderado de una contraparte Moral (02/Sep/2026,
// ver PldRepresentanteLegal en pld-service/pld/models.py).
export type PldRepresentanteLegalTipo = "REPRESENTANTE_LEGAL" | "APODERADO";
export type PldRepresentanteLegalFacultades =
  | "PLEITOS_COBRANZAS"
  | "ACTOS_ADMINISTRACION"
  | "ACTOS_DOMINIO"
  | "PLEITOS_Y_ADMINISTRACION"
  | "OTRAS";

export interface PldRepresentanteLegal {
  id_representante: string;
  kyc: string;
  tipo: PldRepresentanteLegalTipo;
  es_principal_del_tramite: boolean;
  es_beneficiario_controlador: boolean;
  porcentaje_participacion: string | null;
  nombre_completo: string;
  rfc: string | null;
  curp: string | null;
  tipo_identificacion: string | null;
  numero_identificacion: string | null;
  autoridad_identificacion: string | null;
  poder_numero_escritura: string | null;
  poder_notario_nombre: string | null;
  poder_notario_numero: string | null;
  poder_fecha_escritura: string | null;
  poder_facultades: PldRepresentanteLegalFacultades | null;
  poder_vigente: boolean;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listRepresentantesLegales(idKyc: string): Promise<PldRepresentanteLegal[]> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/representantes-legales/?kyc=${idKyc}`);
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export async function crearRepresentanteLegal(
  idKyc: string,
  params: Partial<Omit<PldRepresentanteLegal, "id_representante" | "kyc" | "created_at" | "updated_at">>,
  actorUserId?: string | null
): Promise<PldRepresentanteLegal> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/representantes-legales/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, kyc: idKyc, created_by: actorUserId, updated_by: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export async function editarRepresentanteLegal(
  idRepresentante: string,
  params: Partial<Omit<PldRepresentanteLegal, "id_representante" | "kyc" | "created_at" | "updated_at">>,
  actorUserId?: string | null
): Promise<PldRepresentanteLegal> {
  const response = await apiFetch(
    "PLD",
    `${PLD_API_BASE_URL}/api/representantes-legales/${idRepresentante}/`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, updated_by: actorUserId }),
    }
  );
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export async function eliminarRepresentanteLegal(idRepresentante: string): Promise<void> {
  const response = await apiFetch(
    "PLD",
    `${PLD_API_BASE_URL}/api/representantes-legales/${idRepresentante}/`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
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

// "Se debe poner en auto" (Mariana, 04/Sep/2026) - apaga
// categoria_cumplimiento_manual y recalcula de inmediato segun
// tipo_persona, mismo patron que reactivarAutoEstadoKyc arriba.
export async function reactivarAutoCategoriaKyc(idKyc: string): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/reactivar_auto_categoria/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

// Enviar recordatorio de documentos faltantes (04/Sep/2026, "hay que
// unificar la solicitud de documento como en contratos" - mismo patron
// exacto que enviarRecordatorioDocumentos en lib/tesoreria.ts): UN correo
// por cada documento seleccionado, con un magic link propio
// (PldDocumentoTicket) para que el cliente lo suba directo, sin tener que
// elegir tipo_documento el mismo. Requiere que el expediente ya tenga
// email capturado.
export async function enviarRecordatorioDocumentosKyc(
  idKyc: string,
  documentoIds: string[],
  actorUserId?: string | null
): Promise<{ enviados: string[]; total_seleccionados: number }> {
  const response = await apiFetch(
    "PLD",
    `${PLD_API_BASE_URL}/api/kyc/${idKyc}/enviar_recordatorio_documentos/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documento_ids: documentoIds, actor_user_id: actorUserId }),
    }
  );
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export interface PldDocumentoTicketValidado {
  nombre_documento: string;
  id_contraparte: string;
}

// Consumidos por la pagina publica /pld-documento/[token] (sin sesion) -
// mismo patron que validarTicketDocumento/subirDocumentoTicket en
// lib/tesoreria.ts.
export async function validarTicketDocumentoPld(token: string): Promise<PldDocumentoTicketValidado> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/documento-tickets/validar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export async function subirDocumentoTicketPld(params: {
  token: string;
  recaptchaToken: string;
  file: File;
}): Promise<{ detail: string }> {
  const formData = new FormData();
  formData.append("token", params.token);
  formData.append("recaptcha_token", params.recaptchaToken);
  formData.append("file", params.file);
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/documento-tickets/subir/`, {
    method: "POST",
    body: formData,
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

// Catalogo de ocupaciones/actividades economicas (02/Sep/2026, pedido
// explicito, codigos de 7 digitos "extraidos del listado oficial de la
// UIF"). AVISO DE PRECISION: estos codigos se copiaron tal cual del
// listado que compartio el usuario (citando fuentes de terceros -
// Studocu, Heru - no el catalogo oficial descargado directo de
// sppld.sat.gob.mx) - no se verificaron aqui contra el documento oficial
// de la UIF. Antes de usarse en un reporte real a la UIF, alguien con
// acceso al catalogo oficial debe confirmar que estos codigos y
// etiquetas son exactos.
//
// Separado en 2 listas (fisica vs moral, ver PldContraparteKyc.tipo_persona
// en el backend) porque la UIF NO distingue esto en el codigo mismo - es
// el software el que debe controlar que catalogo mostrar segun el tipo de
// persona (evita que a una persona moral se le puedan asignar codigos de
// "Estudiante"/"Labores del hogar", etc.). Vive aqui (no en
// app/pld/[idKyc]/page.tsx) porque tanto la pantalla del analista como el
// formulario publico (pld-ticket/[token]/page.tsx) lo usan.
export const UIF_OCUPACIONES_PERSONA_FISICA: Record<string, string> = {
  "7110100": "Directores, Gerentes y Administradores",
  "7130100": "Contadores, Auditores y Especialistas en Finanzas",
  "7140100": "Auxiliares Administrativos, Archivistas y Oficinistas",
  "7140200": "Cajeros, Cobradores y Recepcionistas",
  "7120100": "Abogados, Notarios y Profesionales del Derecho",
  "7120300": "Médicos, Enfermeros y Especialistas de la Salud",
  "7120400": "Ingenieros, Arquitectos y Diseñadores Industriales",
  "7120600": "Profesores, Maestros y Personal Docente",
  "7120700": "Consultores, Asesores y Analistas de Negocios",
  "7150100": "Comerciantes, Vendedores y Distribuidores Minoristas",
  "7150500": "Choferes, Taxistas y Operadores de Transporte",
  "7210100": "Mecánicos, Electricistas y Técnicos en Mantenimiento",
  "1000000": "No Aplica / Sin Actividad Económica Organizada",
  "7160100": "Estudiantes",
  "7160200": "Personas dedicadas a las labores del hogar",
  "7160300": "Jubilados, Pensionados y Retirados",
  "7160400": "Desempleados",
};

export const UIF_SECTORES_PERSONA_MORAL: Record<string, string> = {
  "1110000": "Agricultura, Silvicultura y Actividades del Campo",
  "1220000": "Ganadería y Crianza de Animales",
  "1330000": "Pesca, Acuacultura y Actividades Marítimas",
  "2130000": "Minería, Extracción de Minerales y Petróleo",
  "3110000": "Industria Manufacturera (Fábricas, Maquiladoras, Producción de Bienes)",
  "4110000": "Construcción, Desarrollo Inmobiliario e Infraestructura",
  "5110000": "Comercio al por Mayor (Distribuidoras masivas y Proveedores)",
  "6110000": "Comercio al por Menor (Tiendas, Retail, Venta al consumidor final)",
  "8110000": "Transportes, Almacenamiento y Logística de Carga",
  "9110000": "Servicios Financieros y de Seguros (Bancos, SOFOMES, Fintech)",
  "9210000": "Servicios Inmobiliarios y de Alquiler de Bienes",
  "9310000": "Servicios Profesionales, Científicos y Técnicos Corporativos",
};

export function catalogoOcupacionPorTipoPersona(tipoPersona: string | null | undefined): Record<string, string> {
  // fisica -> catalogo ocupacional; moral/fideicomiso -> catalogo por
  // sector. Fideicomiso se trata como moral (es una entidad, no una
  // persona con ocupacion individual).
  if (tipoPersona === "fisica") {
    return UIF_OCUPACIONES_PERSONA_FISICA;
  }
  return UIF_SECTORES_PERSONA_MORAL;
}

// Campos del expediente KYC que solo aplican a un tipo de persona
// especifico (02/Sep/2026, pedido explicito del checklist de
// cumplimiento: "Al seleccionar 'Física', el sistema debe ocultar
// dinamicamente los campos Folio Mercantil, Objeto Social e
// Identificacion de Fideicomiso" / "Mostrar unicamente cuando se
// seleccione [Fideicomiso] los campos..."). Comparten esta lista las 2
// pantallas que editan el expediente (analista en /pld/[idKyc] y el
// formulario publico en pld-ticket/[token]).
const CAMPOS_SOLO_MORAL: ReadonlyArray<keyof PldDatosEditables> = ["folio_mercantil", "objeto_social"];
const CAMPOS_SOLO_FIDEICOMISO: ReadonlyArray<keyof PldDatosEditables> = ["ident_fideicomiso"];
// nombre/apellido_paterno/apellido_materno (02/Sep/2026, pedido explicito:
// "Dividir el campo único... en tres campos... para Persona Física") -
// solo tienen sentido para Fisica; nombre_completo (Denominación o Razón
// Social) se queda como el campo real para Moral/Fideicomiso.
const CAMPOS_SOLO_FISICA: ReadonlyArray<keyof PldDatosEditables> = ["nombre", "apellido_paterno", "apellido_materno"];

export function esCampoVisibleParaTipoPersona(
  campo: keyof PldDatosEditables,
  tipoPersona: string | null | undefined
): boolean {
  if (CAMPOS_SOLO_FISICA.includes(campo)) return tipoPersona === "fisica";
  // nombre_completo se oculta SOLO cuando ya se eligio Fisica (ahi lo
  // reemplazan nombre/apellidos) - para Moral/Fideicomiso/sin elegir
  // todavia sigue siendo el campo real a llenar.
  if (campo === "nombre_completo") return tipoPersona !== "fisica";
  // Sin tipo de persona elegido todavia, el resto se muestra todo - no
  // tiene sentido esconder un campo antes de que el analista/cliente haya
  // decidido cual aplica (evita que algo "desaparezca" antes de elegir).
  if (!tipoPersona) return true;
  if (CAMPOS_SOLO_MORAL.includes(campo)) return tipoPersona === "moral";
  if (CAMPOS_SOLO_FIDEICOMISO.includes(campo)) return tipoPersona === "fideicomiso";
  return true;
}

// Etiqueta de "nombre_completo" segun tipo de persona (02/Sep/2026,
// pedido explicito del checklist de cumplimiento: "Cambiar el texto del
// campo por 'Denominación o Razón Social'" para Moral) - el campo real
// sigue siendo el mismo (nombre_completo en el modelo), solo cambia lo
// que ve el analista/cliente. Fisica/Fideicomiso/sin elegir se quedan con
// la etiqueta combinada de siempre (el checklist solo pidio el cambio
// para Moral).
export function etiquetaNombreParaTipoPersona(tipoPersona: string | null | undefined): string {
  return tipoPersona === "moral" ? "Denominación o Razón Social" : "Nombre completo / Razón social";
}

// Nombre real a mostrar de un expediente (02/Sep/2026, tras dividir el
// nombre en 3 campos para Fisica): para Fisica, junta
// nombre/apellido_paterno/apellido_materno (nombre_completo queda vacio,
// ver esCampoVisibleParaTipoPersona); para Moral/Fideicomiso/sin elegir
// todavia, sigue siendo nombre_completo tal cual. Un solo lugar para no
// repetir esta logica en cada pantalla que muestra el nombre (avatar,
// titulo, tabla de expedientes).
export function nombreParaMostrar(
  kyc: Partial<
    Pick<
      PldContraparteKyc & PldDatosEditables,
      "tipo_persona" | "nombre_completo" | "nombre" | "apellido_paterno" | "apellido_materno"
    >
  >
): string {
  if (kyc.tipo_persona === "fisica") {
    const partes = [kyc.nombre, kyc.apellido_paterno, kyc.apellido_materno].filter(Boolean);
    if (partes.length > 0) return partes.join(" ");
  }
  return kyc.nombre_completo || "";
}

// Catalogo real de identificaciones oficiales mexicanas y su autoridad
// emisora (02/Sep/2026, pedido explicito: "en autoridad que emitio la
// identificacion... se debe llenar en automaticamente") - antes
// "Tipo de identificación" era texto libre sin ninguna relacion con
// "Autoridad emisora" (tambien texto libre). Compartido entre la pantalla
// del analista (/pld/[idKyc]) y el formulario público (pld-ticket/[token])
// - las llaves DEBEN coincidir exactamente con
// lib/paises.ts::TIPOS_IDENTIFICACION (el catalogo real de opciones que
// ve el usuario en ambas pantallas), reconciliado el 02/Sep/2026 (antes
// cada pantalla tenia su propia lista con etiquetas ligeramente
// distintas). Sigue siendo un CharField de texto en el modelo
// (tipo_identificacion/autoridad_identificacion, ver
// pld-service/pld/models.py) - este catalogo vive solo aqui, en el
// frontend, no es una migracion de esquema.
export const AUTORIDAD_POR_TIPO_IDENTIFICACION: Record<string, string> = {
  "INE / Credencial para votar": "Instituto Nacional Electoral (INE)",
  "Pasaporte": "Secretaría de Relaciones Exteriores (SRE)",
  "Cédula profesional": "Secretaría de Educación Pública (SEP)",
  "Cartilla del Servicio Militar Nacional": "Secretaría de la Defensa Nacional (SEDENA)",
  "Matrícula consular": "Secretaría de Relaciones Exteriores (SRE)",
  "Forma migratoria (FM2/FM3)": "Instituto Nacional de Migración (INM)",
  "Licencia de conducir": "Secretaría/Instituto de Movilidad de la entidad (varía por estado)",
};
