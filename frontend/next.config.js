/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 16/Sep/2026: NO usar trailingSlash:true - normaliza PAREJO todas las
  // rutas, y las de auth (auth/google/start, auth/logout, etc. en
  // config/urls.py de iam-service) estan definidas SIN "/" final (no son
  // DRF), a diferencia de /api/* que SI lo exige - forzar slash en todas
  // rompe esas. skipTrailingSlashRedirect apaga por completo el redirect
  // 308 automatico de Next (que si no, se dispara ANTES de que la vea el
  // Route Handler del proxy, sin importar si la ruta pedida trae "/" o no)
  // - asi la URL le llega intacta, tal cual la mando el navegador, a
  // src/app/[gateway]/[...path]/route.ts, que ya la reenvia preservando el
  // "/" final exacto (o su ausencia) hacia el Gateway/iam-service.
  skipTrailingSlashRedirect: true,
  // "standalone" empaqueta solo lo que el server necesita en runtime
  // (node_modules resueltos, sin devDependencies) - imagen de produccion
  // mucho mas chica, y es el formato que espera el Dockerfile de Cloud Run
  // (server.js generado en .next/standalone, ver Dockerfile).
  output: "standalone",

  // El proxy hacia el Gateway (15/Sep/2026) vive en
  // src/app/[gateway]/[...path]/route.ts (Route Handler manual, controla
  // cada header/cookie de la respuesta explicitamente) - NO en rewrites()
  // aqui (se evalua en BUILD TIME, GATEWAY_INTERNAL_URL nunca se leeria de
  // verdad en runtime) ni en NextResponse.rewrite() del middleware (no
  // reenviaba Set-Cookie de forma confiable en un server standalone
  // autoalojado) - ambos intentados y descartados el mismo dia.
};

module.exports = nextConfig;
