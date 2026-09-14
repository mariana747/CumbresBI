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
COPY services/materiales-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/materiales-service/ .

# Cloud Run inyecta su propia variable PORT (normalmente 8080) y espera que
# el contenedor escuche exactamente ahi - "runserver" con puerto fijo
# causaba "container failed to start and listen on the port defined by
# PORT=8080". gunicorn + $PORT funciona igual en Cloud Run y en Docker
# Compose local (ver docker-compose.yml).
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2"]
