// Cliente de iam-service - directorio de usuarios (Fase 1).
// Contrato: services/iam-service/iam/views.py (GET /api/users/, GET /api/roles/).

export interface IamUser {
  user_id: string;
  primary_email: string;
  display_name: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  access_mode: "STANDARD" | "RESTRICTED";
  roles: string[];
  empresas: { nombre: string }[];
  created_at: string;
  updated_at: string;
}

export interface IamRole {
  role_id: string;
  role_key: string;
  role_name: string;
  description: string | null;
}

// Empresa (IamGroup) - alias es el nombre corto para mostrar en pantalla
// (ej. "CUMBRES" en vez de "CONSULTORÍA Y PROYECTOS CUMBRES"), si existe.
export interface IamGroup {
  group_id: string;
  nombre: string;
  alias: string | null;
}

const IAM_API_BASE_URL = process.env.NEXT_PUBLIC_IAM_API_BASE_URL ?? "http://localhost:8000";

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

  const response = await fetch(`${IAM_API_BASE_URL}/api/users/?${params.toString()}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error de iam-service (${response.status}): ${body}`);
  }
  return response.json();
}

export async function listRoles(): Promise<IamRole[]> {
  const response = await fetch(`${IAM_API_BASE_URL}/api/roles/`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error de iam-service (${response.status}): ${body}`);
  }
  return response.json();
}

export async function listGroups(): Promise<IamGroup[]> {
  const response = await fetch(`${IAM_API_BASE_URL}/api/groups/`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error de iam-service (${response.status}): ${body}`);
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
  const response = await fetch(`${IAM_API_BASE_URL}/api/user-roles/?user=${userId}&active=true`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error de iam-service (${response.status}): ${body}`);
  }
  return response.json();
}

export async function grantRole(userId: string, roleId: string): Promise<IamUserRole> {
  const response = await fetch(`${IAM_API_BASE_URL}/api/user-roles/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId, role: roleId }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error de iam-service (${response.status}): ${body}`);
  }
  return response.json();
}

export async function revokeRole(assignmentId: string): Promise<IamUserRole> {
  const response = await fetch(`${IAM_API_BASE_URL}/api/user-roles/${assignmentId}/revoke/`, {
    method: "POST",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error de iam-service (${response.status}): ${body}`);
  }
  return response.json();
}
