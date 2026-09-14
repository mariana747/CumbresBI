# Build multi-etapa: la etapa "builder" instala TODAS las dependencias
# (incl. devDependencies, necesarias para "next build") y compila; la
# etapa final solo copia el resultado "standalone" (ver next.config.js) -
# imagen de produccion sin devDependencies ni codigo fuente sin compilar.
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# NEXT_PUBLIC_* se hornean en el bundle en build time (no en runtime, a
# diferencia de las variables de un backend) - se reciben como build args
# desde el pipeline de CI/CD, con el mismo default de desarrollo local para
# que "docker build" sin argumentos siga funcionando igual que antes.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

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
