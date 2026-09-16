import { NextRequest, NextResponse } from "next/server";

// Ya NO hay SSO silencioso automatico (15/Sep/2026 - ver el porque en el
// comentario mas abajo, junto al redirect real). Este middleware corre en
// el servidor de Next.js ANTES de renderizar cualquier pagina: sin sesion
// valida, manda a /login (que ahora SI requiere un clic real del usuario).
//
// La cookie de sesion la pone iam-service a traves del Gateway/proxy (ver
// src/app/[gateway]/[...path]/route.ts) - mismo origen que el frontend
// desde la perspectiva del navegador, asi que la cookie "host-only" (sin
// Domain explicito) SI se ve aqui.
const SESSION_COOKIE_NAME = "cumbresbi_session";

// Rutas que NO requieren sesion - /login (con el boton real, ver
// src/app/login/page.tsx), /magic-link, /pld-ticket, /tesoreria-ticket,
// /pld-documento y /tesoreria-documento son flujos de acceso externo
// (proveedores/clientes de KYC), no pasan por Google en absoluto - un
// cliente externo canjeando su ticket nunca tiene cuenta de Workspace.
// /tesoreria-documento y /pld-documento (04/Sep/2026, hallazgo real al
// construir el segundo: al primero tambien le faltaba estar aqui - sin
// esto el middleware redirige a /login antes de que la pagina publica
// siquiera cargue).
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/magic-link",
  "/pld-ticket",
  "/tesoreria-ticket",
  "/tesoreria-documento",
  "/pld-documento",
];

// Prefijos del Gateway (ver src/app/[gateway]/[...path]/route.ts, misma
// lista) - 15/Sep/2026: estas rutas las maneja el Route Handler (proxy
// manual hacia el Gateway), nunca deben pasar por el gate de sesion a
// nivel de pagina de este middleware (si no, redirigir a
// "/iam/auth/google/start" volveria a pasar por AQUI sin cookie todavia
// y se re-redirigiria a si mismo - loop infinito, visto real el mismo dia).
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

  // Ya NO se redirige directo a Google (15/Sep/2026, revierte "SSO
  // silencioso sin boton" - ver memoria de sesion
  // "oidc-sso-silencioso-sin-boton-login"): un redirect 100% automatico,
  // sin ninguna interaccion real de usuario, hacia un tercer dominio
  // (accounts.google.com) y de vuelta al mismo sitio, es exactamente el
  // patron que la "Bounce Tracking Mitigation" de Chrome detecta y borra
  // el estado (cookies) del sitio que orquesto el bounce - encontrado
  // real 15/Sep/2026, el login "funcionaba" (Set-Cookie de sesion si
  // llegaba) pero Chrome la purgaba poco despues, loop infinito. Un clic
  // real del usuario en /login cuenta como interaccion genuina y evita
  // esta proteccion - ver src/app/login/page.tsx.
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Todo excepto assets estaticos de Next.js y el favicon - no tiene
  // sentido interceptar esas rutas.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
