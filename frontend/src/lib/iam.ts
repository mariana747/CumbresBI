// Cliente de iam-service - directorio de usuarios (Fase 1).
// Contrato: services/iam-service/iam/views.py (GET /api/users/, GET /api/roles/).

export interface IamUser {
  user_id: string;
  primary_email: string;
  display_name: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  access_mode: "STANDARD" | "RESTRICTED";
  roles: string[];
  created_at: string;
  updated_at: string;
}

export interface IamRole {
  role_id: string;
  role_key: string;
  role_name: string;
  description: string | null;
}

const IAM_API_BASE_URL = process.env.NEXT_PUBLIC_IAM_API_BASE_URL ?? "http://localhost:8000";

export async function listUsers({
  search,
  status,
  role,
}: {
  search?: string;
  status?: string;
  role?: string;
} = {}): Promise<IamUser[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (role) params.set("role", role);

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
