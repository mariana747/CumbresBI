import { NextRequest, NextResponse } from "next/server";
import { GATEWAY_URL } from "./lib/gatewayUrl";

// SSO silencioso real (Fase 1, Semana 4; decision de producto confirmada,
// ver memoria de sesion "oidc-sso-silencioso-sin-boton-login"): "sin
// pantalla intermedia" significa literal - ni un spinner propio. Este
// middleware corre en el servidor de Next.js ANTES de renderizar
// cualquier pagina, asi que un usuario sin sesion nunca ve nada de
// CumbresBI: el 302 lo manda directo a Google.
//
// La cookie de sesion la pone iam-service a traves del Gateway (otro
// origen, localhost:8080), pero al ser "host-only" para el host "localhost"
// (sin atributo Domain explicito), el navegador la adjunta en cualquier
// request a "localhost" sin importar el puerto - por eso el middleware de
// localhost:3000 SI puede leerla. En produccion, con subdominios reales
// (app./api.<dominio>) esto se resuelve igual via un dominio raiz
// compartido (ver README.md, "Supuestos y puntos abiertos").
const SESSION_COOKIE_NAME = "cumbresbi_session";

// Rutas que NO requieren sesion - /login existe solo como fallback para el
// caso de error (?error=oidc) o una cookie invalida detectada del lado del
// cliente (ver AppShell.tsx); /magic-link es el flujo de acceso externo,
// no pasa por Google en absoluto.
const PUBLIC_PATH_PREFIXES = ["/login", "/magic-link"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const iamBaseUrl = process.env.NEXT_PUBLIC_IAM_API_BASE_URL ?? `${GATEWAY_URL}/iam`;
  return NextResponse.redirect(new URL(`${iamBaseUrl}/auth/google/start`));
}

export const config = {
  // Todo excepto assets estaticos de Next.js y el favicon - no tiene
  // sentido interceptar esas rutas.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
