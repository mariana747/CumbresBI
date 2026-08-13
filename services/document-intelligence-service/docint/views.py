import json

from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .classifier import classify_by_filename
from .models import AnalysisJob
from .processing import ejecutar_con_reintentos
from .storage import upload_staging
from .tasks import encolar_analisis


class AnalyzeView(APIView):
    """POST /analyze - Fase 3 de la migracion a async con Cloud Tasks (ver
    plan): responde 202 de inmediato con {analysis_id, status} en vez de
    esperar el resultado - el archivo ya se persistio en staging (Fase 1) y
    el analisis se encola (Fase 2, docint.tasks.encolar_analisis corre en
    un hilo aparte incluso en dev, ver tasks.py). El cliente (frontend,
    MotorDocumentalDialog.tsx) hace polling a GET /analyze/<id>/status hasta
    ver COMPLETADO o ERROR.

    Modo actual (dev, sin GCP real via Drive API): recibe el archivo directo
    en el body multipart (campo 'file') en vez de un DriveFileRef, ver
    docint/drive.py (fetch_bytes sin implementar, bloqueado por Actividad 1).
    SOLO usar con documentos ficticios mientras el provider sea AI Studio
    (ver settings.DOCINT_USE_VERTEX).
    """

    parser_classes = [MultiPartParser]
    permission_classes = [require_permission("docint.crear")]

    def post(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"error": "campo 'file' requerido (modo dev sin Drive API)"}, status=400)

        expected_document_type = request.data.get("expected_document_type", "")
        servicio_solicitante = request.data.get("servicio_solicitante", "desconocido")
        try:
            metadata = json.loads(request.data.get("metadata", "{}"))
        except json.JSONDecodeError:
            metadata = {}

        # Clasificacion por nombre de archivo (Actividad 14): el llamador
        # puede fijar internal_prompt_key explicitamente (gana siempre); si
        # no lo manda, se infiere del nombre del archivo subido. Si el
        # nombre no coincide con ninguna palabra clave conocida, se usa el
        # prompt "generic" y se marca matched_by_filename=False para no
        # presentar una adivinanza como una clasificacion confiable.
        internal_prompt_key = request.data.get("internal_prompt_key")
        matched_by_filename = None
        if not internal_prompt_key:
            internal_prompt_key, matched_by_filename = classify_by_filename(uploaded_file.name)

        mime_type = uploaded_file.content_type or "application/octet-stream"
        document_bytes = uploaded_file.read()
        gcs_uri = upload_staging(document_bytes, mime_type, analysis_id="pending")

        job = AnalysisJob.objects.create(
            gcs_uri=gcs_uri,
            mime_type=mime_type,
            expected_document_type=expected_document_type,
            internal_prompt_key=internal_prompt_key,
            matched_by_filename=matched_by_filename,
            metadata=metadata,
            servicio_solicitante=servicio_solicitante,
            solicitado_por=getattr(getattr(request, "effective_scope", None), "identity_user_id", None),
            max_intentos=settings.DOCINT_MAX_INTENTOS_ANALISIS,
        )

        encolar_analisis(job.id)

        return Response({"analysis_id": job.id, "status": job.status}, status=202)


class AnalysisStatusView(APIView):
    """GET /analyze/<id>/status - polling del resultado (Fase 3, ver plan).
    El frontend consulta esto cada pocos segundos hasta ver COMPLETADO o
    ERROR (docint.ts::pollAnalysis)."""

    permission_classes = [require_permission("docint.leer")]

    def get(self, request, analysis_id, *args, **kwargs):
        try:
            job = AnalysisJob.objects.get(id=analysis_id)
        except AnalysisJob.DoesNotExist:
            return Response({"error": "analysis_id no encontrado"}, status=404)

        return Response(
            {
                "analysis_id": job.id,
                "status": job.status,
                "result": job.resultado,
                "error": job.error_mensaje or None,
            }
        )


class ProcesarAnalisisView(APIView):
    """POST /analyze/<id>/procesar - endpoint interno invocado SOLO por
    Cloud Tasks (Fase 2, ver plan seccion 4-5), nunca por el frontend/gateway.

    Autenticacion: cuando DOCINT_TASKS_ENABLED=True, Cloud Run debe estar
    configurado para exigir invocador autenticado (OIDC de
    DOCINT_CLOUD_TASKS_SERVICE_ACCOUNT) a nivel de infraestructura - este
    endpoint no revalida el token de negocio del usuario (ver plan seccion 5:
    el permiso ya se valido una vez en POST /analyze, este registro en
    AnalysisJob es el snapshot de esa autorizacion). En dev
    (DOCINT_TASKS_ENABLED=False) este endpoint no lo llama nadie - el modo
    dev ejecuta in-process (docint/tasks.py::_ejecutar_in_process) - se deja
    disponible para poder probarlo manualmente sin esperar a tener Cloud
    Tasks real.
    """

    permission_classes = [AllowAny]

    def post(self, request, analysis_id, *args, **kwargs):
        try:
            job = AnalysisJob.objects.get(id=analysis_id)
        except AnalysisJob.DoesNotExist:
            # 200, no 404: si Cloud Tasks reintentara un job que ya no
            # existe (borrado/limpiado), reintentar no arreglaria nada.
            return Response({"detail": "analysis_id no encontrado"}, status=200)

        if job.status == AnalysisJob.COMPLETADO:
            return Response({"detail": "ya estaba completado"}, status=200)

        puede_reintentar = ejecutar_con_reintentos(job)
        if not puede_reintentar:
            # False = todavia quedan intentos y este fallo fue de
            # infraestructura, no de negocio - 500 le indica a Cloud Tasks
            # que reintente segun el backoff configurado en la cola.
            return Response({"detail": "fallo transitorio, se reintentara"}, status=500)

        return Response({"detail": "procesado", "status": job.status}, status=200)
