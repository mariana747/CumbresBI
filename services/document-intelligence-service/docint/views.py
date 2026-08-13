import json

from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from . import drive
from .classifier import classify_by_filename
from .contracts import DocumentAnalysisRequest, DriveFileRef
from .models import AnalysisRequestLog
from .providers import get_provider


class AnalyzeView(APIView):
    """POST /analyze - invocacion sincrona (docs/architecture/README.md sec.
    2 y 10: la unica excepcion documentada a 'todo asincrono' ademas de las
    consultas de existencia contra contrapartes-service).

    Decision de Mariana (12/Ago/2026, ver memoria de sesion
    "motor-documental-seleccion-archivos-drive"): ya NO se acepta un archivo
    subido directo del navegador - el analista sube el archivo el mismo en
    drive.google.com (a la carpeta correspondiente); esta vista solo pide
    una referencia (drive_file_id/carpeta), nunca bytes del cliente.
    Streaming real Drive->Gemini, tal como documentaba el diagrama de
    README.md sec. 10 desde el principio.

    Body (JSON): drive_file_id, carpeta (ej. "PLD/<id_contraparte>"),
    perm_key (el que el llamador ya necesita para leer esa carpeta, ej.
    "pld-compliance.crear" - drive-service es quien lo valida de verdad),
    nombre_archivo, mime_type, expected_document_type, servicio_solicitante,
    metadata (opcional), internal_prompt_key (opcional).
    """

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

        analysis_request = DocumentAnalysisRequest(
            document_ref=DriveFileRef(file_id=drive_file_id),
            expected_document_type=expected_document_type,
            metadata=metadata,
            internal_prompt_key=internal_prompt_key,
        )

        provider = get_provider()
        result = provider.analyze(
            analysis_request,
            document_bytes=document_bytes,
            mime_type=mime_type,
        )
        if matched_by_filename is False:
            result.warnings.append(
                "No se reconocio el tipo de documento por el nombre del archivo; "
                "se uso clasificacion generica (menos confiable)."
            )

        AnalysisRequestLog.objects.create(
            servicio_solicitante=servicio_solicitante,
            tipo_documento_esperado=expected_document_type,
            tipo_documento_detectado=result.detected_document_type,
            coincide_tipo_esperado=result.matches_expected_type,
            confianza=result.confidence,
            proveedor_usado="vertex-ai" if settings.DOCINT_USE_VERTEX else "ai-studio",
            errores_validacion=result.validation_errors,
            advertencias=result.warnings,
        )

        return Response(
            {
                "detected_document_type": result.detected_document_type,
                "matches_expected_type": result.matches_expected_type,
                "confidence": result.confidence,
                "extracted_data": result.extracted_data,
                "validation_errors": result.validation_errors,
                "warnings": result.warnings,
                "internal_prompt_key_used": internal_prompt_key,
                "matched_by_filename": matched_by_filename,
            }
        )
