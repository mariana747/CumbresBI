import json

from django.conf import settings

from docint.contracts import DocumentAnalysisRequest, DocumentAnalysisResult
from docint.prompts import PROMPTS
from .base import DocumentIntelligenceProvider

# Codigos de la API de Gemini que son transitorios (saturacion, error del
# lado de Google) - se relanzan como RetryableProviderError para que
# processing.ejecutar_con_reintentos los reintente en vez de mostrarselos
# directo al usuario. Cualquier otro codigo (400 imagen invalida, 401/403
# credenciales, 404) no es reintentable - reintentar no lo arregla.
_CODIGOS_REINTENTABLES = {429, 500, 502, 503, 504}


class RetryableProviderError(Exception):
    """Fallo transitorio del proveedor (ver _CODIGOS_REINTENTABLES) - se deja
    subir para que ejecutar_con_reintentos decida si reintentar o no."""


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

        from google.genai import errors, types

        # Version fija, no el alias "gemini-flash-latest" (decision
        # 01/Sep/2026, confirmada con Mariana - ver memoria
        # "gemini-api-precios-y-version"). El alias resulto poco confiable
        # en la practica: durante una prueba end-to-end real devolvio 503
        # "high demand" de forma persistente, mientras que este modelo fijo
        # respondio bien de inmediato. Cuando Google libere una version
        # nueva hay que actualizar esto a mano, pero a cambio no se hereda
        # sorpresivamente un modelo saturado o con comportamiento distinto.
        try:
            response = self._client.models.generate_content(
                model="gemini-3.6-flash",
                contents=[
                    types.Part.from_bytes(data=document_bytes, mime_type=mime_type),
                    prompt,
                ],
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            if not response.text:
                finish_reason = None
                if response.candidates:
                    finish_reason = response.candidates[0].finish_reason
                raise ValueError(f"respuesta vacia del modelo (finish_reason={finish_reason})")
            payload = json.loads(response.text)
        except errors.APIError as exc:
            if exc.code in _CODIGOS_REINTENTABLES:
                raise RetryableProviderError(
                    "El servicio de analisis esta saturado o no disponible temporalmente "
                    f"(codigo {exc.code}). Se reintentara automaticamente."
                ) from exc
            return DocumentAnalysisResult(
                detected_document_type=None,
                matches_expected_type=False,
                confidence=0.0,
                extracted_data={},
                validation_errors=[f"No se pudo analizar el documento: {exc.message or exc.status or exc}"],
                warnings=[],
            )
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
