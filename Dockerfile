# Dockerfile de iam-service en la RAIZ del repo, temporal para el primer
# despliegue de prueba a Cloud Run (Fase 0, Actividad 1) - la UI de "Crear
# servicio"/activadores de Cloud Build no dejaba guardar de forma confiable
# un "Directorio de Dockerfile" distinto a la raiz (rama
# feature/cloud-run-deploy, no se fusiona a develop). Es identico a
# services/iam-service/Dockerfile - build context = raiz del repo en ambos
# casos, por eso el contenido no cambia, solo la ubicacion del archivo.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY libs/cumbresbi-scope /libs/cumbresbi-scope
COPY services/iam-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/iam-service/ .

# Cloud Run inyecta su propia variable PORT (normalmente 8080) y espera que
# el contenedor escuche exactamente ahi - "runserver" con puerto fijo 8000
# causaba "container failed to start and listen on the port defined by
# PORT=8080". gunicorn + $PORT funciona igual en Cloud Run y en Docker
# Compose local (ver docker-compose.yml, mapeo 8000:8080).
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2"]
