// Vacio a proposito (15/Sep/2026): el navegador ya NO llama al Gateway
// directo - eso causaba un loop de login real en Cloud Run porque
// frontend-dev-*.run.app y api-gateway-dev-*.run.app son "sitios"
// distintos para el navegador (.run.app esta en la lista publica de
// sufijos), y las cookies de sesion no viajan entre sitios distintos aun
// con SameSite=None+Secure (bloqueo de cookies de terceros del propio
// Chrome). Ahora toda ruta relativa (/iam/..., /pld/..., etc.) la
// intercepta el Route Handler propio (ver
// src/app/[gateway]/[...path]/route.ts, GATEWAY_INTERNAL_URL) y la
// reenvia server-to-server al Gateway real - el navegador solo habla con
// el frontend, mismo origen siempre, sin restriccion de cookies.
export const GATEWAY_URL = "";

// Base fija, ya NO configurable por NEXT_PUBLIC_IAM_API_BASE_URL (15/Sep/2026,
// bug real encontrado: con GATEWAY_URL="" el fallback `${GATEWAY_URL}/iam`
// solo aplica si la env var es null/undefined, y en la practica se
// observaron llamadas reales a "/api/me" en vez de "/iam/api/me" -
// eliminado el nivel extra de configuracion opcional para que no haya
// ninguna otra fuente posible de un valor vacio).
export const IAM_API_BASE_URL = `${GATEWAY_URL}/iam`;
