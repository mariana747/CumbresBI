#!/usr/bin/env bash
# Pendiente del setup de Cloud Run que requiere permisos de administrador
# de IAM sobre el proyecto (roles/resourcemanager.projectIamAdmin,
# roles/iam.workloadIdentityPoolAdmin, roles/iam.serviceAccountAdmin -
# otorgados 11/Ago/2026). Todo lo que SI se pudo crear sin esos permisos
# (Artifact Registry, las 10 cuentas de servicio, la cuenta
# cumbresbi-deployer) ya esta hecho - esto es solo lo que faltaba.
#
# Uso: bash scripts/gcp_setup_pendiente_iam_admin.sh
set -euo pipefail

PROJECT_ID="cyp-cumbres-461220"
GITHUB_REPO="mariana747/CumbresBI"
DEPLOY_SA="cumbresbi-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

echo "== Proyecto: $PROJECT_ID =="
gcloud config set project "$PROJECT_ID"

# ---------------------------------------------------------------------------
# 1. Workload Identity Federation - GitHub Actions se autentica sin llave
#    JSON estatica.
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
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  || echo "El provider ya existe, seguimos."

WORKLOAD_IDENTITY_PROVIDER=$(gcloud iam workload-identity-pools providers describe "github-actions-provider" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --format="value(name)")

echo ">> GCP_WORKLOAD_IDENTITY_PROVIDER = $WORKLOAD_IDENTITY_PROVIDER"

# ---------------------------------------------------------------------------
# 2. Roles de la cuenta de despliegue (cumbresbi-deployer, ya creada)
# ---------------------------------------------------------------------------
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
# 3. roles/cloudsql.client para las 10 cuentas de servicio por microservicio
#    (las cuentas ya existen, solo falta el binding de rol)
# ---------------------------------------------------------------------------
SERVICIOS=(iam-service audit-service pld-service vivienda-service compras-tesoreria-service rrhh-service tesoreria-service rentas-service document-intelligence-service api-gateway)

for svc in "${SERVICIOS[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${svc}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client" \
    --condition=None \
    --quiet
done

echo ""
echo "== Listo. Guardar estos secrets en GitHub (Settings -> Secrets and variables -> Actions): =="
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_REGION=northamerica-south1"
echo "GCP_WORKLOAD_IDENTITY_PROVIDER=$WORKLOAD_IDENTITY_PROVIDER"
echo "GCP_DEPLOY_SA_EMAIL=$DEPLOY_SA"
