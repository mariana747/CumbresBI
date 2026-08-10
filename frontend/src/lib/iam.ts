// Cliente de iam-service - directorio de usuarios (Fase 1).
// Contrato: services/iam-service/iam/views.py (GET /api/users/, GET /api/roles/).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

export interface IamUser {
  user_id: string;
  primary_email: string;
  display_name: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  access_mode: "STANDARD" | "RESTRICTED";
  roles: string[];
  empresas: { nombre: string }[];
  // Reporte de matriz de acceso (Fase 1, Semana 6): detalle de alcance por
  // asignacion activa (ver iam/serializers.py, IamUserSerializer.get_accesos).
  accesos: { role_key: string; role_name: string; scope_type: string; scope_id: string }[];
  created_at: string;
  updated_at: string;
}

export interface IamRole {
  role_id: string;
  role_key: string;
  role_name: string;
  description: string | null;
  // Claves de permiso otorgadas a este rol (ver iam/serializers.py,
  // IamRoleSerializer.get_permisos) - para la matriz de permisos.
  permisos: string[];
}

// Catalogo completo de permisos (Fase 1, Semana 5) - columnas de la matriz
// de permisos, se combina con el campo "permisos" de cada IamRole.
export interface IamPermission {
  permission_id: string;
  perm_key: string;
  description: string | null;
}

// Empresa (IamGroup) - alias es el nombre corto para mostrar en pantalla
// (ej. "CUMBRES" en vez de "CONSULTORÍA Y PROYECTOS CUMBRES"), si existe.
export interface IamGroup {
  group_id: string;
  nombre: string;
  alias: string | null;
}

const IAM_API_BASE_URL = process.env.NEXT_PUBLIC_IAM_API_BASE_URL ?? `${GATEWAY_URL}/iam`;

export async function listUsers({
  search,
  status,
  role,
  group,
  sinRol,
}: {
  search?: string;
  status?: string;
  role?: string;
  group?: string;
  // Decision de producto: acceso de empleados nuevos via login libre, no
  // invitacion formal - ver memoria de sesion "iam-invitacion-alcance-incierto".
  sinRol?: boolean;
} = {}): Promise<IamUser[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (role) params.set("role", role);
  if (group) params.set("group", group);
  if (sinRol) params.set("sin_rol", "true");

  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/users/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function listRoles(): Promise<IamRole[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/roles/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function listPermissions(): Promise<IamPermission[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/permissions/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function listGroups(): Promise<IamGroup[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/groups/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export interface IamUserRole {
  assignment_id: string;
  user: string;
  role: string;
  role_key: string;
  role_name: string;
  scope_type: string;
  scope_id: string;
  granted_at: string;
  revoked_at: string | null;
}

export async function listUserRoles(userId: string): Promise<IamUserRole[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-roles/?user=${userId}&active=true`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Reporte de historial de cambios de permisos (Fase 1, Semana 6): la lista
// completa de otorgamientos/revocaciones, mas recientes primero (ver
// iam/views.py, IamUserRoleViewSet - sin ?user= es exactamente este reporte,
// no hace falta un endpoint aparte).
export async function listRoleHistory(): Promise<IamUserRole[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-roles/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function grantRole(userId: string, roleId: string): Promise<IamUserRole> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-roles/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId, role: roleId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function revokeRole(assignmentId: string): Promise<IamUserRole> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-roles/${assignmentId}/revoke/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Magic Links (Fase 1, Semana 4). MODO DEV: sin envio de correo real
// todavia (ver iam/views.py, IamMagicLinkViewSet) - crear() regresa el
// token en claro y el link completo, algo que dejara de pasar en cuanto
// exista el envio real desde Workspace.
export interface IamMagicLink {
  magic_link_id: string;
  email: string;
  recurso_tipo: string | null;
  recurso_id: string | null;
  issued_at: string;
  issued_by: string | null;
  expires_at: string;
  max_uses: number;
  uses_count: number;
  first_used_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  token?: string;
  magic_link_url?: string;
}

export async function listMagicLinks(): Promise<IamMagicLink[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/magic-links/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function createMagicLink(params: {
  email: string;
  recursoTipo?: string;
  recursoId?: string;
}): Promise<IamMagicLink> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/magic-links/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      recurso_tipo: params.recursoTipo || null,
      recurso_id: params.recursoId || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export interface IamMagicLinkMasivoError {
  email: string;
  detail: string;
}

// Alta masiva de Magic Links (invitacion masiva por CSV) - el CSV se
// parsea aqui en el frontend (un correo por linea/columna), iam-service
// solo recibe la lista ya separada (ver iam/views.py, accion "masivo").
export async function createMagicLinksMasivo(params: {
  emails: string[];
  recursoTipo?: string;
  recursoId?: string;
}): Promise<{ creados: IamMagicLink[]; errores: IamMagicLinkMasivoError[] }> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/magic-links/masivo/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emails: params.emails,
      recurso_tipo: params.recursoTipo || null,
      recurso_id: params.recursoId || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function validateMagicLink(token: string): Promise<{ magic_link: IamMagicLink; jwt: string }> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/magic-links/validar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    // Esta funcion la consume tambien la pagina publica
    // (app/magic-link/[token]/page.tsx) - el mensaje de error se le muestra
    // directo a un usuario externo. friendlyApiError ya extrae "detail" del
    // backend cuando existe (ver iam/views.py, "Token invalido."/"Token
    // revocado."/etc.), que es justo el caso de uso aqui.
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function revokeMagicLink(magicLinkId: string): Promise<IamMagicLink> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/magic-links/${magicLinkId}/revocar/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}
