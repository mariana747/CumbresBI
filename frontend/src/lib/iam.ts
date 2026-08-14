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
  accessMode,
  sinRol,
}: {
  search?: string;
  status?: string;
  role?: string;
  group?: string;
  // Interno (STANDARD, Workspace) vs externo (RESTRICTED, ver
  // IamExternalCollaboratorViewSet.create) - filtro del directorio.
  accessMode?: string;
  // Decision de producto: acceso de empleados nuevos via login libre, no
  // invitacion formal - ver memoria de sesion "iam-invitacion-alcance-incierto".
  sinRol?: boolean;
} = {}): Promise<IamUser[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (role) params.set("role", role);
  if (group) params.set("group", group);
  if (accessMode) params.set("access_mode", accessMode);
  if (sinRol) params.set("sin_rol", "true");

  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/users/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Borrado logico (14/Ago/2026, pedido explicito tras encontrar un usuario
// de prueba atorado en SUSPENDED sin forma de quitarlo del directorio -
// ver iam/views.py, IamUserViewSet.eliminar). NO borra la fila real
// (varias FKs con on_delete=PROTECT apuntan a IamUser) - pone
// status=DELETED y revoca sus roles activos. actorUserId es quien hace
// clic en "Eliminar", no el usuario a eliminar - el backend rechaza que
// alguien se elimine a si mismo.
export async function deleteUser(userId: string, actorUserId?: string): Promise<IamUser> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/users/${userId}/eliminar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Reactivar un usuario suspendido (14/Ago/2026, pedido explicito: al
// suspender se le desactivan sus funciones - login/canje rechazados en
// auth_views.py - hace falta un boton para revertirlo). Solo funciona
// desde SUSPENDED, no desde DELETED (ver iam/views.py, docstring de
// IamUserViewSet.reactivar).
export async function reactivateUser(userId: string, actorUserId?: string): Promise<IamUser> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/users/${userId}/reactivar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Suspender un usuario activo (14/Ago/2026, pedido explicito: a un
// colaborador Workspace ya aceptado no se le puede "revocar la
// invitación" - IamInvitationViewSet.revocar ya lo rechaza - asi que esta
// es la forma real de cortarle el acceso; reversible con reactivateUser().
export async function suspendUser(userId: string, actorUserId?: string): Promise<IamUser> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/users/${userId}/suspender/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actor_user_id: actorUserId }),
  });
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

// Matriz de permisos editable (Fase 1): otorgar/revocar un permiso a un rol.
// actorUserId viene de getSession() (src/lib/auth.ts) - primer lugar donde
// se usa el usuario real logueado como actor de auditoria, en vez de un
// placeholder "sin-auth".
export async function grantRolePermission(
  roleId: string,
  permissionId: string,
  actorUserId: string
): Promise<IamRole> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/roles/${roleId}/otorgar_permiso/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permission: permissionId, actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function revokeRolePermission(
  roleId: string,
  permissionId: string,
  actorUserId: string
): Promise<IamRole> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/roles/${roleId}/revocar_permiso/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permission: permissionId, actor_user_id: actorUserId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Catalogo real de sociedades (contrato: iam/views.py, GeneralSociedadViewSet)
// - CRUD real (pantalla /admin/organizacion, Gestion organizacional) ademas
// de alimentar el autocomplete de RFC en RoleAssignmentDialog. Centro y
// Proyecto NO tienen equivalente aqui a proposito - no son catalogos
// genericos reales (pertenecen a modulos que todavia no se construyen,
// Tickets/Vivienda - ver memoria de sesion, decision 10/Ago/2026).
export interface GeneralSociedad {
  rfc: string;
  razon_social: string | null;
  regimen_mercantil?: string | null;
  alias_sociedad: string | null;
  grupo?: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function listSociedades(search?: string): Promise<GeneralSociedad[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/sociedades/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function createSociedad(params: {
  rfc: string;
  razonSocial?: string;
  regimenMercantil?: string;
  aliasSociedad?: string;
}): Promise<GeneralSociedad> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/sociedades/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rfc: params.rfc,
      razon_social: params.razonSocial || null,
      regimen_mercantil: params.regimenMercantil || null,
      alias_sociedad: params.aliasSociedad || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function updateSociedad(
  rfc: string,
  params: { razonSocial?: string; regimenMercantil?: string; aliasSociedad?: string }
): Promise<GeneralSociedad> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/sociedades/${rfc}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      razon_social: params.razonSocial,
      regimen_mercantil: params.regimenMercantil,
      alias_sociedad: params.aliasSociedad,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function deleteSociedad(rfc: string): Promise<void> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/sociedades/${rfc}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
}

export async function listGroups(): Promise<IamGroup[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/groups/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Cambiar la empresa de un usuario desde el Directorio (icono de lapiz en
// la columna "Empresa") - contrato: iam/views.py, IamUserGroupViewSet.
export interface IamUserGroup {
  id: number;
  user: string;
  user_email: string;
  group: string;
  group_nombre: string;
  group_alias: string | null;
  created_at: string;
  removed_at: string | null;
}

export async function listUserGroups(userId: string): Promise<IamUserGroup[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-groups/?user=${userId}&active=true`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function assignGroup(userId: string, groupId: string): Promise<IamUserGroup> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-groups/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId, group: groupId }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function removeUserGroup(userGroupId: number): Promise<IamUserGroup> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-groups/${userGroupId}/quitar/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Nomenclatura de color por nivel de alcance (roles-y-permisos.md sec. 1)
// - se usa en cualquier tabla/chip que muestre scope_type, para que el
// nivel se reconozca de un vistazo sin leer el texto. Un solo lugar
// (aqui) para que no se desincronicen los colores entre pantallas
// (Directorio de usuarios, Reportes > Historial/Matriz de acceso).
// GRUPO NO esta aqui a proposito - decision revertida, se queda como los
// 4 niveles que marca el onboarding de Dylan (ver memoria de sesion
// "nivel-grupo-holding-confirmado").
export const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: "Global",
  SOCIEDAD: "Sociedad",
  PROYECTO: "Proyecto",
  CENTRO: "Centro",
  CONTRATO: "Contrato",
};

// Colores reales (hex) en src/theme/theme.ts (SCOPE_PALETTE) - aqui solo
// se mapea scope_type -> el nombre de color de la paleta del theme
// (scopeGlobal/scopeSociedad/...), nunca un hex suelto.
export type ScopeChipColor =
  | "scopeGlobal"
  | "scopeSociedad"
  | "scopeProyecto"
  | "scopeCentro"
  | "scopeContrato"
  | "default";

export const SCOPE_COLORS: Record<string, ScopeChipColor> = {
  GLOBAL: "scopeGlobal",
  SOCIEDAD: "scopeSociedad",
  PROYECTO: "scopeProyecto",
  CENTRO: "scopeCentro",
  CONTRATO: "scopeContrato",
};

export function scopeChipColor(scopeType: string): ScopeChipColor {
  return SCOPE_COLORS[scopeType] ?? "default";
}

export interface IamUserRole {
  assignment_id: string;
  user: string;
  user_email: string;
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

// scopeType/scopeId: GLOBAL (default, scope_id="*"), SOCIEDAD o PROYECTO -
// CENTRO/CONTRATO NO van aqui, son grants planos aparte (ver
// listCentroAccess/listContratoAccess abajo) - no son parte del enum real
// de iam_user_roles.scope_type (roles-y-permisos.md sec. 1).
export async function grantRole(
  userId: string,
  roleId: string,
  scopeType: "GLOBAL" | "SOCIEDAD" | "PROYECTO" = "GLOBAL",
  scopeId: string = "*"
): Promise<IamUserRole> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-roles/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId, role: roleId, scope_type: scopeType, scope_id: scopeId }),
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

// Invitacion formal de colaborador nuevo (gate hibrido 10/Ago/2026, ver
// iam/auth_views.py y memoria de sesion "iam-invitacion-alcance-incierto"):
// a diferencia de Magic Link (acceso puntual sin cuenta de Workspace),
// aqui no hay token que copiar/enviar - basta con que exista esta fila
// pendiente para que el correo pueda iniciar sesion con Google.
export interface IamInvitation {
  invitation_id: string;
  email: string;
  invited_by: string | null;
  invited_by_email: string | null;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  // Aviso "ya puedes entrar" (14/Ago/2026, ver iam/mail_utils.py
  // enviar_correo_invitacion_workspace) - solo viaja en la respuesta de
  // create(), no es un campo persistido del modelo.
  correo_enviado?: boolean;
}

export async function listInvitations(): Promise<IamInvitation[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/invitaciones/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function createInvitation(email: string): Promise<IamInvitation> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/invitaciones/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function revokeInvitation(invitationId: string): Promise<IamInvitation> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/invitaciones/${invitationId}/revocar/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// 3er tipo de acceso externo (14/Ago/2026, ver iam/models.py
// IamExternalCollaborator y memoria de sesion
// "tercer-tipo-invitacion-externo-sin-workspace"): a diferencia de Magic
// Link (accion puntual, vence en minutos) e IamInvitation (correo de
// Workspace, canjea iniciando sesion con Google), aqui el colaborador NO
// tiene Workspace - el link no vence por tiempo, solo se revoca a mano, y
// al canjearlo obtiene una sesion real (con sus roles/permisos
// asignados via /admin/directorio, no un JWT de alcance limitado).
export interface IamExternalCollaborator {
  external_access_id: string;
  user: string;
  email: string;
  invited_by: string | null;
  invited_by_email: string | null;
  invited_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  token?: string;
  acceso_url?: string;
  correo_enviado?: boolean;
}

export async function listExternalCollaborators(): Promise<IamExternalCollaborator[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/acceso-externo/`);
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function createExternalCollaborator(params: {
  email: string;
  displayName?: string;
}): Promise<IamExternalCollaborator> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/acceso-externo/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: params.email, display_name: params.displayName || null }),
  });
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function revokeExternalCollaborator(externalAccessId: string): Promise<IamExternalCollaborator> {
  const response = await apiFetch(
    "IAM",
    `${IAM_API_BASE_URL}/api/acceso-externo/${externalAccessId}/revocar/`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

export async function resendExternalCollaborator(externalAccessId: string): Promise<IamExternalCollaborator> {
  const response = await apiFetch(
    "IAM",
    `${IAM_API_BASE_URL}/api/acceso-externo/${externalAccessId}/reenviar/`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw await friendlyApiError("IAM", response);
  }
  return response.json();
}

// Grants planos CENTRO/CONTRATO (roles-y-permisos.md sec. 1) - NO son
// scope_type de iam_user_roles, son su propia tabla (contrato: iam/views.py,
// IamUserCentroAccessViewSet/IamUserContratoAccessViewSet). Ningun modulo
// de negocio los consume todavia (SCOPE_FIELD_CENTRO/CONTRATO sin declarar
// en ningun modelo aun) - se otorgan desde ya para no bloquear el dato
// cuando ese modulo exista.
export interface IamUserCentroAccess {
  id: number;
  user: string;
  user_email: string;
  centro_id: string;
  granted_by: string | null;
  granted_at: string | null;
  revoked_at: string | null;
}

export async function listCentroAccess(userId: string): Promise<IamUserCentroAccess[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-centro-access/?user=${userId}&active=true`);
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}

// Sin ?user= - lista TODOS los grants existentes (de cualquier usuario),
// solo para armar las sugerencias del autocomplete freeSolo de
// RoleAssignmentDialog (no hay catalogo real de centros/contratos
// todavia, ver pantalla /admin/organizacion - esto es "lo que ya se ha
// usado antes", no un catalogo formal).
export async function listAllCentroAccess(): Promise<IamUserCentroAccess[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-centro-access/`);
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}

export async function grantCentroAccess(userId: string, centroId: string): Promise<IamUserCentroAccess> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-centro-access/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId, centro_id: centroId }),
  });
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}

export async function revokeCentroAccess(id: number): Promise<IamUserCentroAccess> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-centro-access/${id}/revoke/`, {
    method: "POST",
  });
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}

export interface IamUserContratoAccess {
  id: number;
  user: string;
  user_email: string;
  id_contrato: string;
  granted_by: string | null;
  granted_at: string | null;
  revoked_at: string | null;
}

export async function listContratoAccess(userId: string): Promise<IamUserContratoAccess[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-contrato-access/?user=${userId}&active=true`);
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}

// Mismo criterio que listAllCentroAccess de arriba - sugerencias, no catalogo.
export async function listAllContratoAccess(): Promise<IamUserContratoAccess[]> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-contrato-access/`);
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}

export async function grantContratoAccess(userId: string, idContrato: string): Promise<IamUserContratoAccess> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-contrato-access/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId, id_contrato: idContrato }),
  });
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}

export async function revokeContratoAccess(id: number): Promise<IamUserContratoAccess> {
  const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/user-contrato-access/${id}/revoke/`, {
    method: "POST",
  });
  if (!response.ok) throw await friendlyApiError("IAM", response);
  return response.json();
}
