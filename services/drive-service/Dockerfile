# Build context es la raiz del repo (ver docker-compose.yml). Sin
# mysqlclient/build-essential: sin base de datos propia (proxy stateless
# hacia Drive, ver config/settings.py) - imagen mas liviana, mismo criterio
# que api-gateway.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY libs/cumbresbi-scope /libs/cumbresbi-scope
COPY services/drive-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/drive-service/ .

# Cloud Run inyecta su propia variable PORT (normalmente 8080) - gunicorn +
# $PORT funciona igual en Cloud Run y en Docker Compose local.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "gunicorn config.wsgi:application --bind 0.0.0.0:${PORT} --workers 2"]
