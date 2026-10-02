"""Respaldo por IA para sugerir facturas/complementos sin candidatos por
heuristica (monto+contraparte). Entra solo cuando la busqueda normal no
encontro ningun match - igual que desambiguar_candidatos_por_ia en
gemini_conciliacion.py pero para el lado CFDI: dado un flujo (concepto,
contraparte, monto, fecha), elige la factura o complemento sin ligar que
mas probablemente corresponde. Nunca decide solo: regresa una sugerencia
con razon, el analista confirma en pantalla."""

import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_MAX_CANDIDATOS_IA = 30

_PROMPT = (
    "Un registro de pago interno (Flujo) necesita ligarse a su factura o "
    "complemento de pago (CFDI) correcto. Te doy los datos del Flujo y una "
    "lista de comprobantes sin ligar. Elige el timbre_uuid que MAS "
    "probablemente corresponde, comparando concepto/contraparte del Flujo "
    "contra emisor/folio/descripcion del comprobante. Si ninguno parece "
    "corresponder, responde null. Responde SOLO con JSON valido, sin texto "
    "adicional, con esta forma exacta: "
    '{"timbre_uuid_sugerido": str|null, "tipo": "factura"|"complemento"|null, '
    '"razon": str|null (una frase breve en español)}.\n\n'
)


def sugerir_cfdi_por_ia(
    concepto: str | None,
    contraparte_nombre: str | None,
    monto,
    fecha_efectiva,
    candidatos_factura: list[dict],
    candidatos_complemento: list[dict],
) -> dict | None:
    """candidatos_factura/complemento: lista de {timbre_uuid, folio, emisor,
    total}. Regresa {"timbre_uuid_sugerido", "tipo", "razon"} o None si no
    hay API key, error, o el modelo no encontro nada. Best-effort."""
    if not settings.GEMINI_API_KEY:
        return None
    todos = (
        [{"tipo": "factura", **c} for c in candidatos_factura[:_MAX_CANDIDATOS_IA]]
        + [{"tipo": "complemento", **c} for c in candidatos_complemento[:_MAX_CANDIDATOS_IA]]
    )
    if not todos:
        return None
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        flujo_txt = (
            f"Concepto: {concepto or '(sin concepto)'}\n"
            f"Contraparte: {contraparte_nombre or '(desconocida)'}\n"
            f"Monto: {monto}\n"
            f"Fecha efectiva: {fecha_efectiva or '(sin fecha)'}"
        )
        contenido = (
            _PROMPT
            + f"Flujo:\n{flujo_txt}\n\n"
            + "Comprobantes sin ligar:\n"
            + json.dumps(todos, ensure_ascii=False, default=str)
        )
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=contenido,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        if not response.text:
            return None
        payload = json.loads(response.text)
        if not payload.get("timbre_uuid_sugerido"):
            return None
        return {
            "timbre_uuid_sugerido": str(payload["timbre_uuid_sugerido"]),
            "tipo": payload.get("tipo"),
            "razon": payload.get("razon"),
        }
    except Exception:
        logger.warning("No se pudo sugerir CFDI por IA (Gemini)", exc_info=True)
        return None
