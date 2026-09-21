import { NextRequest, NextResponse } from "next/server";

// Sin SSO silencioso: sin sesion valida, manda a /login (requiere clic real).
// Cookie de sesion puesta por iam-service via el Gateway/proxy, mismo origen.
const SESSION_COOKIE_NAME = "cumbresbi_session";

// Rutas que NO requieren sesion: acceso externo (proveedores/clientes KYC)
// que no pasa por Google en absoluto.
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/magic-link",
  "/pld-ticket",
  "/tesoreria-ticket",
  "/tesoreria-documento",
  "/pld-documento",
  "/privacidad",
  "/terminos",
];

// Prefijos del Gateway (proxeados por el Route Handler): nunca deben pasar
// por el gate de sesion de este middleware, o se produce un loop infinito.
const GATEWAY_PATH_PREFIXES = [
  "/iam",
  "/pld",
  "/audit",
  "/docint",
  "/vivienda",
  "/materiales",
  "/compras-tesoreria",
  "/rrhh",
  "/tesoreria",
  "/rentas",
  "/drive",
  "/mail",
  "/obra",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    GATEWAY_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  // No redirige directo a Google: un bounce 100% automatico dispara la
  // Bounce Tracking Mitigation de Chrome y borra la cookie de sesion.
  // Un clic real en /login cuenta como interaccion genuina y lo evita.
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Todo excepto assets estaticos de Next.js y el favicon - no tiene
  // sentido interceptar esas rutas.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
