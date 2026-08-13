# Build context is the repo root (see docker-compose.yml) so this Dockerfile
# can install the shared libs/cumbresbi-scope package - all paths below are
# relative to the repo root, not to this service's folder.
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
COPY services/document-intelligence-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/document-intelligence-service/ .

# Cloud Run inyecta su propia variable PORT (normalmente 8080) y espera que
# el contenedor escuche exactamente ahi - "runserver" con puerto fijo 8006
# causaba "container failed to start and listen on the port defined by
# PORT=8080". gunicorn + $PORT funciona igual en Cloud Run y en Docker
# Compose local (ver docker-compose.yml, mapeo 8006:8080).
ENV PORT=8080
EXPOSE 8080


# --timeout 120: default de gunicorn es 30s, insuficiente para un analisis
# real con Gemini sobre un documento grande - sin esto, gunicorn mata al
# worker a medio analisis (SystemExit, conexion cortada sin respuesta al
# cliente). Parche temporal mientras la Fase 3 (async con Cloud Tasks, ver
# plan) deja de correr el analisis dentro del ciclo de vida del worker HTTP.
CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2 --timeout 120"]
