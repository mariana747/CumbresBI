/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "standalone" empaqueta solo lo que el server necesita en runtime
  // (node_modules resueltos, sin devDependencies) - imagen de produccion
  // mucho mas chica, y es el formato que espera el Dockerfile de Cloud Run
  // (server.js generado en .next/standalone, ver Dockerfile).
  output: "standalone",
};

module.exports = nextConfig;
