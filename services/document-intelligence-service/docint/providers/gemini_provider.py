import json

from django.conf import settings

from docint.contracts import DocumentAnalysisRequest, DocumentAnalysisResult
from docint.prompts import PROMPTS
from .base import DocumentIntelligenceProvider


class GeminiProvider(DocumentIntelligenceProvider):
    """Un solo provider para AI Studio (dev, documentos ficticios) y Vertex AI
    (produccion, documentos reales) - el SDK google-genai usa el mismo cliente
    para ambos, solo cambia como se inicializa (ver _build_client). Migrar de
    uno a otro es un cambio de configuracion (DOCINT_USE_VERTEX), no de
    codigo."""

    def __init__(self):
        self._client = None  # lazy - no llamar a Google en import time

    def _build_client(self):
        from google import genai

        if settings.DOCINT_USE_VERTEX:
            if not settings.VERTEX_PROJECT_ID:
                raise RuntimeError("VERTEX_PROJECT_ID no configurado (DOCINT_USE_VERTEX=True)")
            return genai.Client(
                vertexai=True,
                project=settings.VERTEX_PROJECT_ID,
                location=settings.VERTEX_LOCATION,
            )
        if not settings.GEMINI_API_KEY:
            raise RuntimeError(
                "GEMINI_API_KEY no configurado. Consigue una clave gratuita en "
                "https://aistudio.google.com/ - SOLO usar con documentos "
                "ficticios, nunca datos reales de PLD/KYC (ver settings.py)."
            )
        return genai.Client(api_key=settings.GEMINI_API_KEY)

    def analyze(self, request: DocumentAnalysisRequest, document_bytes: bytes, mime_type: str) -> DocumentAnalysisResult:
        if self._client is None:
            self._client = self._build_client()

        prompt = PROMPTS.get(request.internal_prompt_key, PROMPTS["generic"])
        prompt += f"\nTipo de documento esperado: {request.expected_document_type}"

        try:
            response = self._client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    {"mime_type": mime_type, "data": document_bytes},
                    prompt,
                ],
            )
            payload = json.loads(response.text)
        except (json.JSONDecodeError, KeyError, ValueError) as exc:
            return DocumentAnalysisResult(
                detected_document_type=None,
                matches_expected_type=False,
                confidence=0.0,
                extracted_data={},
                validation_errors=[f"Respuesta del modelo no parseable: {exc}"],
                warnings=[],
            )

        detected = payload.get("detected_document_type")
        return DocumentAnalysisResult(
            detected_document_type=detected,
            matches_expected_type=(detected == request.expected_document_type),
            confidence=float(payload.get("confidence", 0.0)),
            extracted_data=payload.get("extracted_data", {}),
            validation_errors=payload.get("validation_errors", []),
            warnings=payload.get("warnings", []),
        )
