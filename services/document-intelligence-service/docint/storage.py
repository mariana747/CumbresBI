"""Staging temporal del archivo a analizar (Fase 1 de la migracion a async,
ver plan). Antes de este cambio, AnalyzeView leia el archivo a bytes, lo
mandaba a Gemini y lo descartaba - si el analisis fallaba a medio camino no
habia nada que reintentar sin que el usuario volviera a subir el documento.

Este bucket es de PASO, no de archivo permanente: si el analista decide
archivar el documento como evidencia, eso sigue siendo un flujo aparte y
explicito (Drive, ver PldContraparteDocViewSet.subir en pld-service) - no se
debe confundir este staging con ese archivo oficial.

Dos backends, mismo patron que DOCINT_USE_VERTEX (flag de modo dev):
- "local": escribe a un directorio en disco (Docker Compose / dev sin GCP).
- "gcs": bucket real de Cloud Storage (Cloud Run / produccion).
"""

import os
import uuid

from django.conf import settings


def _local_dir() -> str:
    path = settings.DOCINT_STAGING_LOCAL_DIR
    os.makedirs(path, exist_ok=True)
    return path


def upload_staging(file_bytes: bytes, mime_type: str, analysis_id: str) -> str:
    """Guarda el archivo y regresa una URI opaca (gcs://... o local://...)
    que fetch_staging sabe interpretar despues. El nombre incluye un sufijo
    random ademas del analysis_id por si alguna vez se reintenta el upload
    con el mismo id (no deberia pasar, pero evita pisar un archivo a medias)."""
    key = f"{analysis_id}-{uuid.uuid4().hex[:8]}"

    if settings.DOCINT_STAGING_BACKEND == "gcs":
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(settings.DOCINT_STAGING_BUCKET)
        blob = bucket.blob(key)
        blob.upload_from_string(file_bytes, content_type=mime_type)
        return f"gcs://{settings.DOCINT_STAGING_BUCKET}/{key}"

    path = os.path.join(_local_dir(), key)
    with open(path, "wb") as fh:
        fh.write(file_bytes)
    return f"local://{path}"


def fetch_staging(gcs_uri: str) -> bytes:
    if gcs_uri.startswith("gcs://"):
        from google.cloud import storage

        _, _, rest = gcs_uri.partition("gcs://")
        bucket_name, _, key = rest.partition("/")
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(key)
        return blob.download_as_bytes()

    if gcs_uri.startswith("local://"):
        path = gcs_uri[len("local://"):]
        with open(path, "rb") as fh:
            return fh.read()

    raise ValueError(f"URI de staging no reconocida: {gcs_uri!r}")
