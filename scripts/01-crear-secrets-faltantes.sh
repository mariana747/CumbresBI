#!/usr/bin/env bash
# Secrets de Django SECRET_KEY que faltan (14/Sep/2026, confirmado con
# `gcloud secrets list` - no existian) para los 5 servicios que siguen en
# la Fase 4 de despliegue. Cada uno genera su propio valor aleatorio al
# vuelo, nadie necesita inventar/pegar nada.
#
# Uso: bash 01-crear-secrets-faltantes.sh
set -euo pipefail

PROJECT_ID="cyp-cumbres-461220"

for SECRET in PLD_DJANGO_SECRET_KEY VIVIENDA_DJANGO_SECRET_KEY COMPRAS_TESORERIA_DJANGO_SECRET_KEY RRHH_DJANGO_SECRET_KEY RENTAS_DJANGO_SECRET_KEY; do
  python3 -c "import secrets; print(secrets.token_urlsafe(50))" | \
    gcloud secrets create "$SECRET" --data-file=- --project="$PROJECT_ID" \
    || echo "Ya existe $SECRET, seguimos."
done

echo "Listo. Verifica con: gcloud secrets list --project=$PROJECT_ID --format='value(name)' | sort"
