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
  role_keys: string[];
  perm_keys: string[];
  picture_url: string | null;
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

// Opcion A (ver memoria de sesion): reemite la cookie de sesion con los
// roles/permisos ACTUALES de BD, sin pedirle al usuario que vuelva a hacer
// login. AppShell.tsx la llama en un poll periodico para que un cambio de
// rol hecho por un admin se refleje solo, con el desfase del intervalo de
// poll (no instantaneo). true = se renovo, false = sesion invalida/
// expirada (igual que getSession(), nunca lanza).
export async function refreshSession(): Promise<boolean> {
  try {
    const response = await apiFetch("IAM", `${IAM_API_BASE_URL}/auth/refresh`, {
      method: "GET",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Helpers de "que puede hacer esta sesion" - un solo lugar para que el
// sidebar (AppShell.tsx) y cualquier pantalla que arme su propia vista
// por rol (ej. app/page.tsx) usen exactamente el mismo criterio, en vez
// de reimplementar la misma pregunta con reglas ligeramente distintas.

// Cualquier perm_key con alguno de estos prefijos de servicio (ej.
// "rrhh.leer", "rrhh.editar") cuenta como "tiene algo que hacer en este
// dominio" - no distingue L/C/E/A aqui, eso ya lo filtra el backend por
// accion especifica (require_permission por endpoint).
export function tieneAlgunPermiso(session: SessionUser | null, prefijosServicio: string[]): boolean {
  if (!session) return false;
  return session.perm_keys.some((key) => prefijosServicio.some((prefijo) => key.startsWith(`${prefijo}.`)));
}

// "Admin (IAM)" solo se muestra a quien puede escribir en iam (SUPER_ADMIN/
// IAM_ADMIN - matriz de permisos, roles-y-permisos.md sec. 3): casi todos
// los roles tienen "iam.leer" (para ver el directorio via API), pero eso
// no implica que deban administrar IAM - antes se mostraba a cualquiera
// con sesion (placeholder de Fase 0).
//
// AUDITOR NO cae aqui a proposito (bug corregido 11/Ago/2026: antes
// incluia role_keys.includes("AUDITOR"), lo que lo mandaba a este menu
// COMPLETO -Usuarios/Permisos/Organizacion- en vez de a su propio
// apartado "Auditar" solo con Bitacora, ver buildNavItems en
// AppShell.tsx). AUDITOR llega a Bitacora por su propia rama, no por
// esta.
export function puedeAdministrarIam(session: SessionUser | null): boolean {
  if (!session) return false;
  return session.perm_keys.includes("iam.crear") || session.perm_keys.includes("iam.editar");
}

// Cualquier perm_key de "iam" (incluye el "iam.leer" que casi todos los
// roles traen, ver matriz roles-y-permisos.md sec. 3) - a diferencia de
// puedeAdministrarIam (que exige escritura), esto solo dice "puede ENTRAR
// a ver el apartado", no que pueda tocar nada ahi (decision de producto
// 11/Ago/2026: antes iam.leer no respaldaba ninguna pantalla - se decidio
// reusar Admin(IAM) para ese caso, con todo deshabilitado, en vez de
// construir una pantalla de solo-lectura aparte).
export function tieneAccesoIam(session: SessionUser | null): boolean {
  return tieneAlgunPermiso(session, ["iam"]);
}

// PLD/Cumplimiento: a diferencia de Admin(IAM) (que exige escritura),
// aqui basta con "pld-compliance.leer" (AUDITOR solo tiene L, no debe
// perder el acceso de solo lectura al modulo por eso).
export function tieneAccesoPld(session: SessionUser | null): boolean {
  return tieneAlgunPermiso(session, ["pld-compliance"]);
}

// Bitacora de auditoria: mismo gate que el backend (audit-service,
// auditoria/views.py) - GLOBAL o rol AUDITOR, NO por perm_key (decision
// de sesion 10/Ago/2026, la bitacora no usa ScopedManager).
export function puedeVerBitacora(session: SessionUser | null): boolean {
  if (!session) return false;
  return session.is_global || session.role_keys.includes("AUDITOR");
}
