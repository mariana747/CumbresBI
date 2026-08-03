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
COPY services/tesoreria-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/tesoreria-service/ .

EXPOSE 8007

CMD ["python", "manage.py", "runserver", "0.0.0.0:8007"]
