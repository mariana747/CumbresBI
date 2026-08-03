// Sesion simulada de Fase 0 - NO es autenticacion real. iam-service todavia
// no expone un endpoint OIDC (ver services/iam-service/iam/views.py, solo
// tiene un ReadOnlyModelViewSet de usuarios). Esto existe unicamente para
// poder construir y probar el flujo de navegacion (login -> panel, guard de
// rutas) mientras se conecta el backend real. Reemplazar por JWT +
// EffectiveScope de iam-service en Fase 1 - ver docs/architecture/
// roles-y-permisos.md.

const SESSION_KEY = "cumbresbi.devSession";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SESSION_KEY) === "true";
}

export function login(): void {
  window.localStorage.setItem(SESSION_KEY, "true");
}

export function logout(): void {
  window.localStorage.removeItem(SESSION_KEY);
}
