// Gateway local de desarrollo (docs/architecture/README.md sec. 8) - unico
// origen que el frontend llama directo. Cada cliente de servicio (iam.ts,
// pld.ts, audit.ts, docint.ts) antepone su propio prefijo (ver
// services/api-gateway/config/settings.py, SERVICE_ROUTES) en vez de
// apuntar directo al puerto de cada microservicio.
export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";
