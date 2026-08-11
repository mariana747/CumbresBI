#!/usr/bin/env bash
# Setup de UNA SOLA VEZ para el pipeline de Cloud Run (.github/workflows/deploy.yml).
#
# Quien corre esto necesita gcloud autenticado con permisos de owner/editor
# sobre el proyecto real (cyp-cumbres-461220, ver docs/architecture/
# infraestructura-gcp/README.md) - hoy eso es Mariana o quien tenga acceso
# de Workspace aprobado. Este script NO se corre en CI - deploy.yml asume
# que todo esto ya existe.
#
# Seguro de re-correr: cada comando usa "|| true" / "--quiet" donde aplica
# para que si algo ya existe (ej. corriste el script a la mitad y se cayo
# la conexion), no truene por duplicado - revisa la salida igual, no es
# 100% idempotente en todos los pasos (ej. Workload Identity Pool si).
#
# Uso: bash scripts/gcp_setup.sh
set -euo pipefail

PROJECT_ID="cyp-cumbres-461220"
REGION="northamerica-south1"  # confirmado 11/Ago/2026 via "gcloud sql instances describe db-cypcumbres" - misma region que la instancia real.
SQL_INSTANCE="db-cypcumbres"  # instancia YA EXISTENTE, reutilizada (ver infraestructura-gcp/cloud-sql.md) - este script NO la crea.
AR_REPO="cumbresbi"
GITHUB_REPO="mariana747/CumbresBI"

echo "== Proyecto: $PROJECT_ID / Region: $REGION =="
gcloud config set project "$PROJECT_ID"

# ---------------------------------------------------------------------------
# 1. Habilitar APIs necesarias (idempotente - no truena si ya estan habilitadas)
# ---------------------------------------------------------------------------
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com

# ---------------------------------------------------------------------------
# 2. Artifact Registry - un solo repo Docker para las 11 imagenes
# ---------------------------------------------------------------------------
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Imagenes de CumbresBI (9 microservicios + api-gateway + frontend)" \
  || echo "Ya existe el repo $AR_REPO, seguimos."

# ---------------------------------------------------------------------------
# 3. Workload Identity Federation - GitHub Actions se autentica SIN llave
#    JSON estatica (mas seguro que descargar una llave de service account).
#    Ver: https://github.com/google-github-actions/auth#setting-up-workload-identity-federation
# ---------------------------------------------------------------------------
gcloud iam workload-identity-pools create "github-actions-pool" \
  --location="global" \
  --display-name="GitHub Actions" \
  || echo "El pool ya existe, seguimos."

gcloud iam workload-identity-pools providers create-oidc "github-actions-provider" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --display-name="GitHub Actions OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  || echo "El provider ya existe, seguimos."

WORKLOAD_IDENTITY_PROVIDER=$(gcloud iam workload-identity-pools providers describe "github-actions-provider" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --format="value(name)")

echo ">> GCP_WORKLOAD_IDENTITY_PROVIDER = $WORKLOAD_IDENTITY_PROVIDER"
echo "   (guardar como secret de GitHub, ver paso 6 abajo)"

# ---------------------------------------------------------------------------
# 4. Service account de despliegue (el que usa deploy.yml, distinto de las
#    cuentas de servicio que corren cada Cloud Run - ver paso 5)
# ---------------------------------------------------------------------------
DEPLOY_SA="cumbresbi-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "cumbresbi-deployer" \
  --display-name="CumbresBI - despliegue desde GitHub Actions" \
  || echo "La cuenta de despliegue ya existe, seguimos."

for role in roles/run.admin roles/iam.serviceAccountUser roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOY_SA}" \
    --role="$role" \
    --condition=None \
    --quiet
done

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_PROVIDER}/attribute.repository/${GITHUB_REPO}" \
  --quiet

echo ">> GCP_DEPLOY_SA_EMAIL = $DEPLOY_SA"

# ---------------------------------------------------------------------------
# 5. Cuentas de servicio por microservicio (least privilege - cada una solo
#    puede conectarse a Cloud SQL, nada mas). audit-service/iam-service ya
#    tienen la suya (ver infraestructura-gcp/*.md) - se listan aqui para
#    dejar el patron completo, "|| true" evita error si ya existen.
# ---------------------------------------------------------------------------
SERVICIOS=(iam-service audit-service pld-service vivienda-service compras-tesoreria-service rrhh-service tesoreria-service rentas-service document-intelligence-service api-gateway)

for svc in "${SERVICIOS[@]}"; do
  gcloud iam service-accounts create "${svc}" \
    --display-name="CumbresBI - ${svc}" \
    || echo "Cuenta de servicio de ${svc} ya existe, seguimos."

  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client" \
    --condition=None \
    --quiet
done

# api-gateway y frontend no tocan Cloud SQL directo - el rol de arriba no
# les hace daño (nunca lo usan) pero si prefieres evitarlo, quita esos dos
# del loop de arriba y comenta esta nota.

echo ""
echo "== Listo el setup base. Pendiente MANUAL (no automatizable de forma segura aqui): =="
echo "1. Crear los secrets de Secret Manager que falten (ver infraestructura-gcp/*.md,"
echo "   IAM_DB_PASSWORD/AUDIT_DB_PASSWORD/DOCINT_DB_PASSWORD ya pendientes de antes,"
echo "   mas uno por cada servicio nuevo: PLD_DB_PASSWORD, VIVIENDA_DB_PASSWORD, etc.)"
echo "2. Crear las bases de datos + usuarios nuevos en Cloud SQL para los servicios que"
echo "   todavia no los tienen (pld, vivienda, compras-tesoreria, rrhh, tesoreria, rentas)"
echo "   - mismo patron ya documentado en infraestructura-gcp/cloud-sql.md."
echo "3. Correr 'gcloud run deploy <servicio>-dev' UNA VEZ A MANO por cada servicio,"
echo "   con --add-cloudsql-instances, --service-account, --set-env-vars y"
echo "   --set-secrets ya resueltos (ver plantilla scripts/cloud_run_deploy_template.sh)"
echo "   - deploy.yml despues solo actualiza la IMAGEN de esos servicios ya creados."
echo "4. Guardar estos secrets en GitHub (Settings -> Secrets and variables -> Actions):"
echo "   GCP_PROJECT_ID=$PROJECT_ID"
echo "   GCP_REGION=$REGION"
echo "   GCP_WORKLOAD_IDENTITY_PROVIDER=$WORKLOAD_IDENTITY_PROVIDER"
echo "   GCP_DEPLOY_SA_EMAIL=$DEPLOY_SA"
echo "   GATEWAY_URL_DEV=<URL real de api-gateway-dev, despues del paso 3>"
