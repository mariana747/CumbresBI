# Build multi-etapa: la etapa "builder" instala TODAS las dependencias
# (incl. devDependencies, necesarias para "next build") y compila; la
# etapa final solo copia el resultado "standalone" (ver next.config.js) -
# imagen de produccion sin devDependencies ni codigo fuente sin compilar.
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# GATEWAY_INTERNAL_URL (server-to-server, ver next.config.js) es una env
# var de RUNTIME, no de build time - a diferencia del viejo
# NEXT_PUBLIC_GATEWAY_URL (15/Sep/2026, ver gatewayUrl.ts), ya no hace
# falta pasarla como build-arg aqui ni reconstruir la imagen si cambia.
#
# NEXT_PUBLIC_GOOGLE_CLIENT_ID / NEXT_PUBLIC_GOOGLE_PICKER_API_KEY (17/Sep/2026,
# ver googleFolderPicker.ts) SI son build-arg: Next.js las hornea en build
# time, no se pueden pasar como env var de runtime. Si faltan, el build
# sigue igual (quedan vacias, el Picker falla controlado, no tumba el sitio).
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=""
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=$NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
RUN npm run build

# ---- Etapa final: solo el output standalone, sin devDependencies ----
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
# Cloud Run inyecta su propia variable PORT (normalmente 8080) - el
# servidor standalone de Next.js ya respeta process.env.PORT solo, no hace
# falta pasarlo a mano en el CMD (a diferencia de los servicios Django/
# gunicorn, que si necesitan bind explicito).
ENV PORT=8080
EXPOSE 8080

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

CMD ["node", "server.js"]
