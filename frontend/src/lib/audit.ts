// Cliente de audit-service - visor de bitacora de auditoria (Fase 1, Semana 6)
// y confirmacion de envio a Drive (Motor Documental).
// Contrato: services/audit-service/auditoria/views.py (GET /api/bitacora/,
// POST /api/bitacora/confirmar_envio_drive/).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

export interface BitacoraEvento {
  event_id: string;
  servicio_origen: string;
  actor_user_id: string;
  accion: string;
  entidad: string;
  entidad_id: string;
  valores_previos: Record<string, unknown> | null;
  valores_nuevos: Record<string, unknown> | null;
  ocurrido_en: string;
  recibido_en: string;
}

const AUDIT_API_BASE_URL = process.env.NEXT_PUBLIC_AUDIT_API_BASE_URL ?? `${GATEWAY_URL}/audit`;

export async function listBitacora({
  search,
  servicioOrigen,
  entidad,
  desde,
  hasta,
}: {
  search?: string;
  servicioOrigen?: string;
  entidad?: string;
  desde?: string;
  hasta?: string;
} = {}): Promise<BitacoraEvento[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (servicioOrigen) params.set("servicio_origen", servicioOrigen);
  if (entidad) params.set("entidad", entidad);
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);

  const response = await apiFetch("AUDIT", `${AUDIT_API_BASE_URL}/api/bitacora/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("AUDIT", response);
  }
  return response.json();
}

// Boton de confirmacion de envio a Drive (Motor Documental) - NO sube nada
// real a Drive (ver services/document-intelligence-service/docint/drive.py,
// bloqueado por falta del proyecto GCP). Solo deja constancia en la
// bitacora de que el usuario confirmo la intencion, con formato y la fecha/
// hora en que se consulto el documento.
export async function confirmarEnvioDrive({
  entidadId,
  consultadoEn,
}: {
  entidadId: string;
  consultadoEn: string;
}): Promise<BitacoraEvento> {
  const response = await apiFetch("AUDIT", `${AUDIT_API_BASE_URL}/api/bitacora/confirmar_envio_drive/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entidad_id: entidadId,
      servicio_origen: "document-intelligence-service",
      entidad: "documento_analizado",
      consultado_en: consultadoEn,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("AUDIT", response);
  }
  return response.json();
}

export interface BitacoraCsvExportado {
  file_id: string;
  web_view_link: string;
  mime_type: string;
  tamano_bytes: number;
}

// Ya NO regresa una URL para <a href> de descarga local (decision de
// Mariana, 12/Ago/2026, ver memoria de sesion "csv-auditoria-a-drive"):
// arma el CSV en audit-service y lo sube a Drive
// (CumbresBI/Auditoria/Bitacora/) - esta funcion dispara esa subida y
// regresa la referencia de Drive (web_view_link) para que el frontend la
// abra en una pestaña nueva, sin bajar el archivo al navegador.
export async function exportarBitacoraCsvADrive(params: {
  search?: string;
  servicioOrigen?: string;
  entidad?: string;
  desde?: string;
  hasta?: string;
}): Promise<BitacoraCsvExportado> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.servicioOrigen) query.set("servicio_origen", params.servicioOrigen);
  if (params.entidad) query.set("entidad", params.entidad);
  if (params.desde) query.set("desde", params.desde);
  if (params.hasta) query.set("hasta", params.hasta);

  const response = await apiFetch(
    "AUDIT",
    `${AUDIT_API_BASE_URL}/api/bitacora/export_csv/?${query.toString()}`
  );
  if (!response.ok) {
    throw await friendlyApiError("AUDIT", response);
  }
  return response.json();
}

// Nombres amigables para mostrar en pantalla - solo cubren los servicios,
// entidades y verbos de accion conocidos hoy (ver services/*/README y
// docs/architecture/README.md sec. 1.1); un valor no listado se muestra tal
// cual, nunca se oculta informacion por no tener traduccion.
const SERVICE_LABELS: Record<string, string> = {
  "iam-service": "IAM (Usuarios y Roles)",
  "audit-service": "Auditoría",
  "pld-service": "PLD / Cumplimiento",
  "vivienda-service": "Ventas / Vivienda",
  "compras-tesoreria-service": "Compras",
  "tesoreria-service": "Tesorería",
  "rentas-service": "Rentas",
  "rrhh-service": "RRHH y Talento",
  "document-intelligence-service": "Motor Documental",
};

const ENTITY_LABELS: Record<string, string> = {
  iam_users: "Usuario",
  iam_user_roles: "Rol de usuario",
  iam_groups: "Empresa",
  iam_magic_links: "Magic Link",
  pld_contrapartes_kyc: "Expediente KYC",
  pld_contrapartes_docs: "Documento KYC",
  pld_ticket_cliente: "Ticket de cliente",
  documento_analizado: "Documento analizado (Motor Documental)",
};

const ACTION_VERB_LABELS: Record<string, string> = {
  grant: "Otorgó",
  revoke: "Revocó",
  approve: "Aprobó",
  reject: "Rechazó",
  create: "Creó",
  update: "Actualizó",
  delete: "Eliminó",
  login: "Inició sesión",
  use: "Usó",
  resend: "Reenvió",
};

// Acciones que ya son una frase completa por si solas - no se les concatena
// el nombre de la entidad (ver friendlyActionName).
const FULL_ACTION_LABELS: Record<string, string> = {};

export function friendlyServiceName(servicioOrigen: string): string {
  return SERVICE_LABELS[servicioOrigen] ?? servicioOrigen;
}

export function friendlyEntityName(entidad: string): string {
  return ENTITY_LABELS[entidad] ?? entidad;
}

// Opciones para los dropdowns de filtro - mismo catalogo que las funciones
// friendly* de arriba, para que la etiqueta mostrada y el valor filtrado
// sean siempre consistentes.
export const SERVICE_OPTIONS = Object.entries(SERVICE_LABELS).map(([value, label]) => ({ value, label }));
export const ENTITY_OPTIONS = Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }));

// "iam_user_roles.grant" -> "Otorgó Rol de usuario"
export function friendlyActionName(accion: string): string {
  if (FULL_ACTION_LABELS[accion]) return FULL_ACTION_LABELS[accion];
  const [entidad, verbo] = accion.split(".");
  if (!verbo) return accion;
  const verboLabel = ACTION_VERB_LABELS[verbo] ?? verbo;
  return `${verboLabel} ${friendlyEntityName(entidad)}`;
}
