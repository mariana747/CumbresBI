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

EXPOSE 8080

CMD ["python", "manage.py", "runserver", "0.0.0.0:8080"]
