import { NextRequest, NextResponse } from "next/server";

// Proxy manual hacia el Gateway (15/Sep/2026) - reemplaza dos intentos
// previos que fallaron:
//   1. rewrites() en next.config.js: se evalua en BUILD TIME, GATEWAY_INTERNAL_URL
//      nunca se leia de verdad en runtime.
//   2. NextResponse.rewrite() en middleware.ts hacia una URL externa: no
//      reenviaba el Set-Cookie de forma confiable en un server standalone
//      autoalojado (a diferencia de Vercel Edge) - el login quedaba en
//      loop porque la cookie de sesion nunca llegaba al navegador.
// Este Route Handler hace el fetch a mano y reconstruye la respuesta
// completa (status, body, TODOS los headers incluido cada Set-Cookie por
// separado) explicitamente, sin depender de mecanismos internos de Next.js
// que no garantizan reenviar cookies en un rewrite externo.

const GATEWAY_PREFIXES = [
  "iam",
  "pld",
  "audit",
  "docint",
  "vivienda",
  "materiales",
  "compras-tesoreria",
  "rrhh",
  "tesoreria",
  "rentas",
  "drive",
  "mail",
  "obra",
];

// Headers hop-by-hop (RFC 7230 sec. 6.1) - no se reenvian tal cual entre
// saltos, cada uno los maneja su propia capa de transporte.
const HOP_BY_HOP = new Set(["host", "connection", "content-length", "transfer-encoding"]);

async function proxy(request: NextRequest, params: { gateway: string; path: string[] }): Promise<NextResponse> {
  if (!GATEWAY_PREFIXES.includes(params.gateway)) {
    return NextResponse.json({ detail: `Ruta no reconocida: '/${params.gateway}'.` }, { status: 404 });
  }

  const gatewayBase = process.env.GATEWAY_INTERNAL_URL || "http://localhost:8080";
  // params.path (segmentos del catch-all de Next) NUNCA trae el "/" final -
  // reconstruirlo solo desde ahi se lo come siempre, sin importar
  // trailingSlash en next.config.js (bug real encontrado 16/Sep/2026: el
  // "/" final es justo lo que Django exige por convencion DRF - sin el,
  // Django responde su propio 301 APPEND_SLASH con un Location relativo sin
  // el prefijo /iam, /pld, etc., y el navegador termina pidiendo "/api/me/"
  // en vez de "/iam/api/me/" -> 404 real). Usar el pathname original, que
  // SI conserva el "/" final tal cual lo pidio el navegador.
  const trailingSlash = request.nextUrl.pathname.endsWith("/") ? "/" : "";
  const targetUrl = new URL(`/${params.gateway}/${params.path.join("/")}${trailingSlash}`, gatewayBase);
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const hasBody = !["GET", "HEAD"].includes(request.method);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });
  } catch {
    return NextResponse.json({ detail: "El servicio no respondio. Intenta de nuevo." }, { status: 502 });
  }

  const responseBody = await upstream.arrayBuffer();
  const response = new NextResponse(responseBody, { status: upstream.status });

  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") {
      response.headers.set(key, value);
    }
  });

  // getSetCookie() (Node 18+/undici) devuelve cada Set-Cookie por
  // separado - Headers.get("set-cookie") los uniria con comas y los
  // rompe (una cookie con Expires ya trae comas en su formato de fecha).
  for (const rawCookie of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", rawCookie);
  }

  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ gateway: string; path: string[] }> }) {
  return proxy(request, await context.params);
}
export async function POST(request: NextRequest, context: { params: Promise<{ gateway: string; path: string[] }> }) {
  return proxy(request, await context.params);
}
export async function PUT(request: NextRequest, context: { params: Promise<{ gateway: string; path: string[] }> }) {
  return proxy(request, await context.params);
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ gateway: string; path: string[] }> }) {
  return proxy(request, await context.params);
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ gateway: string; path: string[] }> }) {
  return proxy(request, await context.params);
}
