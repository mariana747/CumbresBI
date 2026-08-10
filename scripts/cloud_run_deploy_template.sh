#!/usr/bin/env bash
# Plantilla del "gcloud run deploy" inicial de cada servicio - se corre A
# MANO, UNA VEZ por servicio, DESPUES de scripts/gcp_setup.sh. deploy.yml
# (CI/CD) NO corre esto - solo actualiza la imagen de un servicio que ya
# existe (gcloud run deploy conserva env vars/secrets/Cloud SQL si no se
# le pasan esas flags de nuevo).
#
# Copia este bloque una vez por cada servicio (9 microservicios +
# api-gateway + frontend), ajustando las variables de arriba - no corras
# el archivo tal cual, es una plantilla con un solo ejemplo real (pld-service-dev).
set -euo pipefail

PROJECT_ID="cyp-cumbres-461220"
REGION="us-central1"  # mismo valor que scripts/gcp_setup.sh
SQL_INSTANCE_CONNECTION="${PROJECT_ID}:${REGION}:db-cypcumbres"
AR_REPO="cumbresbi"

# ============ EJEMPLO: pld-service, ambiente dev ============
SERVICE="pld-service"
ENV_SUFFIX="dev"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE}:latest"  # el pipeline real usa el SHA del commit, no "latest"

gcloud run deploy "${SERVICE}-${ENV_SUFFIX}" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --platform managed \
  --service-account "${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --add-cloudsql-instances "$SQL_INSTANCE_CONNECTION" \
  --no-allow-unauthenticated \
  `# Solo api-gateway y frontend deberian llevar --allow-unauthenticated` \
  --set-env-vars "PLD_DB_NAME=cumbresbi_pld_service,PLD_DB_USER=pld_app,PLD_DB_SOCKET_DIR=/cloudsql/${SQL_INSTANCE_CONNECTION},DJANGO_DEBUG=False,DJANGO_ALLOWED_HOSTS=*" \
  --set-secrets "PLD_DB_PASSWORD=PLD_DB_PASSWORD:latest" \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi

# ============ Notas para replicar en los demas servicios ============
# - Cambiar SERVICE y el prefijo de las env vars (PLD_ -> AUDIT_, IAM_, etc.)
# - api-gateway: sin *_DB_* (no tiene BD propia) ni --add-cloudsql-instances;
#   SI necesita GATEWAY_ROUTE_* apuntando a la URL real de cada Cloud Run
#   (ya NO "http://pld-service:8080" del docker-compose local, sino algo
#   como "https://pld-service-dev-xxxxx.a.run.app") y
#   --allow-unauthenticated (es el unico punto de entrada publico real).
# - frontend: sin BD, sin Cloud SQL; NEXT_PUBLIC_API_BASE_URL se hornea en
#   BUILD TIME (build-arg, ver frontend/Dockerfile), no aqui en runtime -
#   si cambia la URL del gateway hay que reconstruir la imagen, no solo
#   redeploy; SI necesita --allow-unauthenticated.
# - document-intelligence-service: agregar tambien GEMINI_API_KEY como
#   --set-secrets (ya existe en Secret Manager, ver infraestructura-gcp/
#   document-intelligence-service.md).
