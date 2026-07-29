import json

from django.conf import settings
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .contracts import DocumentAnalysisRequest, DriveFileRef
from .models import AnalysisRequestLog
from .providers import get_provider


class AnalyzeView(APIView):
    """POST /analyze - invocacion sincrona (docs/architecture/README.md sec.
    2 y 10: la unica excepcion documentada a 'todo asincrono' ademas de las
    consultas de existencia contra contrapartes-service).

    Modo actual (dev, sin GCP): recibe el archivo directo en el body
    multipart (campo 'file') en vez de un DriveFileRef, porque la
    integracion con Drive API depende del proyecto GCP (Actividad 1,
    bloqueada) - ver docint/drive.py. SOLO usar con documentos ficticios
    mientras el provider sea AI Studio (ver settings.DOCINT_USE_VERTEX).
    """

    parser_classes = [MultiPartParser]

    def post(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"error": "campo 'file' requerido (modo dev sin Drive API)"}, status=400)

        expected_document_type = request.data.get("expected_document_type", "")
        internal_prompt_key = request.data.get("internal_prompt_key", "generic")
        servicio_solicitante = request.data.get("servicio_solicitante", "desconocido")
        try:
            metadata = json.loads(request.data.get("metadata", "{}"))
        except json.JSONDecodeError:
            metadata = {}

        analysis_request = DocumentAnalysisRequest(
            document_ref=DriveFileRef(file_id="dev-upload"),
            expected_document_type=expected_document_type,
            metadata=metadata,
            internal_prompt_key=internal_prompt_key,
        )

        provider = get_provider()
        result = provider.analyze(
            analysis_request,
            document_bytes=uploaded_file.read(),
            mime_type=uploaded_file.content_type or "application/octet-stream",
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
            }
        )
