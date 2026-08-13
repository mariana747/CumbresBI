import json

from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import drive
from .classifier import classify_by_filename
from .models import AnalysisJob
from .processing import ejecutar_con_reintentos
from .storage import upload_staging
from .tasks import encolar_analisis


class AnalyzeView(APIView):
    """POST /analyze - responde 202 de inmediato con {analysis_id, status}
    en vez de esperar el resultado (migracion a async con Cloud Tasks, ver
    plan): el archivo se persiste en staging (docint/storage.py) y el
    analisis se encola (docint.tasks.encolar_analisis corre en un hilo
    aparte incluso en dev, ver tasks.py). El cliente (frontend,
    MotorDocumentalDialog.tsx) hace polling a GET /analyze/<id>/status hasta
    ver COMPLETADO o ERROR.

    Decision de Mariana (12/Ago/2026, ver memoria de sesion
    "motor-documental-seleccion-archivos-drive"): ya NO se acepta un archivo
    subido directo del navegador - el analista sube el archivo el mismo en
    drive.google.com (a la carpeta correspondiente); esta vista solo pide
    una referencia (drive_file_id/carpeta) y lee los bytes reales de Drive
    (docint/drive.py::fetch_bytes) antes de meterlos al staging/encolado de
    arriba - streaming real Drive->staging->Gemini, tal como documentaba el
    diagrama de README.md sec. 10 desde el principio.

    Body (JSON): drive_file_id, carpeta (ej. "PLD/<id_contraparte>"),
    perm_key (el que el llamador ya necesita para leer esa carpeta, ej.
    "pld-compliance.crear" - drive-service es quien lo valida de verdad),
    nombre_archivo, mime_type, expected_document_type, servicio_solicitante,
    metadata (opcional), internal_prompt_key (opcional).
    """

    permission_classes = [require_permission("docint.crear")]

    def post(self, request, *args, **kwargs):
        drive_file_id = request.data.get("drive_file_id")
        carpeta = request.data.get("carpeta")
        perm_key = request.data.get("perm_key")
        if not drive_file_id or not carpeta or not perm_key:
            return Response(
                {"detail": "Se requieren 'drive_file_id', 'carpeta' y 'perm_key' (el archivo se lee desde Drive, no se sube aqui)."},
                status=400,
            )

        nombre_archivo = request.data.get("nombre_archivo", drive_file_id)
        mime_type = request.data.get("mime_type") or "application/octet-stream"
        expected_document_type = request.data.get("expected_document_type", "")
        servicio_solicitante = request.data.get("servicio_solicitante", "desconocido")
        try:
            metadata = json.loads(request.data.get("metadata", "{}"))
        except json.JSONDecodeError:
            metadata = {}

        headers = {}
        auth_header = request.META.get("HTTP_AUTHORIZATION")
        if auth_header:
            headers["Authorization"] = auth_header
        cookie_name = getattr(settings, "CUMBRESBI_SCOPE_SESSION_COOKIE_NAME", "cumbresbi_session")
        cookies = {}
        if request.COOKIES.get(cookie_name):
            cookies[cookie_name] = request.COOKIES[cookie_name]

        try:
            document_bytes = drive.fetch_bytes(
                file_id=drive_file_id,
                carpeta=carpeta,
                perm_key=perm_key,
                headers=headers,
                cookies=cookies,
            )
        except drive.DriveError as exc:
            return Response({"detail": str(exc)}, status=502)

        # Clasificacion por nombre de archivo (Actividad 14): el llamador
        # puede fijar internal_prompt_key explicitamente (gana siempre); si
        # no lo manda, se infiere del nombre del archivo. Si el nombre no
        # coincide con ninguna palabra clave conocida, se usa el prompt
        # "generic" y se marca matched_by_filename=False para no presentar
        # una adivinanza como una clasificacion confiable.
        internal_prompt_key = request.data.get("internal_prompt_key")
        matched_by_filename = None
        if not internal_prompt_key:
            internal_prompt_key, matched_by_filename = classify_by_filename(nombre_archivo)

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
