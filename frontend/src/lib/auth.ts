// Sesion real via OIDC (Fase 1, Semana 4; docs/architecture/README.md sec.
// 6.1). Reemplaza la sesion simulada de localStorage - ahora la sesion
// vive en una cookie HttpOnly que pone iam-service (services/iam-service/
// iam/auth_views.py), esta libreria solo la consulta via /api/me.
import { apiFetch } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const IAM_API_BASE_URL = process.env.NEXT_PUBLIC_IAM_API_BASE_URL ?? `${GATEWAY_URL}/iam`;

export interface SessionUser {
  user_id: string;
  email: string;
  is_global: boolean;
  sociedad_rfcs: string[];
  proyecto_ids: string[];
  centro_ids: string[];
  contrato_ids: string[];
}

// null = no autenticado (cookie ausente/expirada) - nunca lanza, para que
// el guard de AppShell pueda usarlo directo sin try/catch propio.
export async function getSession(): Promise<SessionUser | null> {
  try {
    const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/api/me/`, { credentials: "include" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// SSO silencioso (decision de producto confirmada, ver memoria de sesion
// "oidc-sso-silencioso-sin-boton-login"): no hay pantalla propia de login,
// esto salta directo al backend, que a su vez salta directo a Google. Si
// el usuario ya tiene sesion activa de Google, todo el salto es
// invisible para el.
export function startGoogleLogin(): void {
  window.location.href = `${IAM_API_BASE_URL}/auth/google/start`;
}

export async function logout(): Promise<void> {
  await apiFetch("IAM", `${IAM_API_BASE_URL}/auth/logout`, { credentials: "include" });
}
