# Build context es la raiz del repo (ver docker-compose.yml). Sin
# mysqlclient/build-essential: el Gateway no tiene base de datos propia, solo
# reenvia requests (ver gateway/views.py) - imagen mas liviana que el resto.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/api-gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/api-gateway/ .


# Cloud Run inyecta su propia variable PORT (normalmente 8080) y espera que
# el contenedor escuche exactamente ahi - "runserver" con puerto fijo
# causaba "container failed to start and listen on the port defined by
# PORT=8080". gunicorn + $PORT funciona igual en Cloud Run y en Docker
# Compose local.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2"]
