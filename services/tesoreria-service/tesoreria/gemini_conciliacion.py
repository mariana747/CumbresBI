"""Respaldo por IA para desambiguar sugerencias de conciliacion bancaria
(28/Sep/2026, "el matching de movimientos...como podemos usar ia" - ver
memoria "tesoreria-conciliacion-bancaria-detalle"). El heuristico de
_sugerir_flujos_para_movimiento (monto+fecha) ya resuelve la mayoria de los
casos; esto SOLO entra cuando quedan 2+ candidatos empatados o cercanos
(ambiguo) y hay texto de la descripcion del banco que un humano si podria
usar para desempatar (ej. "PAGO PROV ACME SA" vs el nombre de la
contraparte de cada candidato). Nunca decide solo: regresa una sugerencia
con razon, el analista la confirma o la ignora en el mismo dialogo de
sugerencias que ya existia."""

import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_PROMPT = (
    "Un movimiento de un estado de cuenta bancario necesita ligarse al "
    "registro interno (Flujo) correcto. Te doy la descripcion cruda del "
    "banco y una lista de candidatos (ya filtrados por monto/fecha "
    "cercanos). Elige el id_flujo que MAS probablemente corresponde a este "
    "movimiento, comparando el nombre de la contraparte/concepto del "
    "candidato contra el texto de la descripcion bancaria. Si ninguno "
    "parece corresponder, o hay un empate genuino que no puedes resolver "
    "con el texto, responde null - nunca adivines al azar. Responde SOLO "
    'con JSON valido, sin texto adicional, con esta forma exacta: '
    '{"id_flujo_sugerido": str|null, "razon": str|null (una frase breve '
    "explicando por que, en español, o null si no elegiste ninguno)}.\n\n"
)


def desambiguar_candidatos_por_ia(descripcion_banco: str, candidatos: list[dict]) -> dict | None:
    """candidatos: lista de {id_flujo, concepto, contraparte_nombre,
    total_mxp}. Regresa {"id_flujo_sugerido", "razon"} o None si no hay API
    key, hubo un error, o el modelo no encontro nada - best-effort, nunca
    bloquea el flujo normal de sugerencias por heuristica."""
    if not settings.GEMINI_API_KEY or not candidatos:
        return None
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        contenido = (
            _PROMPT
            + f"Descripcion del banco: {descripcion_banco or '(sin descripcion)'}\n\n"
            + "Candidatos:\n"
            + json.dumps(candidatos, ensure_ascii=False, default=str)
        )
        # Mismo modelo fijo que gemini_deteccion_cuenta.py/docint (ver
        # memoria "gemini-api-precios-y-version").
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=contenido,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        if not response.text:
            return None
        payload = json.loads(response.text)
        if not payload.get("id_flujo_sugerido"):
            return None
        return {"id_flujo_sugerido": str(payload["id_flujo_sugerido"]), "razon": payload.get("razon")}
    except Exception:
        logger.warning("No se pudo desambiguar candidatos por IA (Gemini)", exc_info=True)
        return None
