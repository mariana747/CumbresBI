"""Respaldo por IA para detectar_cuenta (28/Sep/2026, "usemos la IA para la
deteccion de cuenta bancaria") - el regex de numeros de 8-20 digitos
(views.py::detectar_cuenta) ya cubre la mayoria de los extractos, pero
falla cuando el numero de cuenta viene mezclado con texto (ej. "No. Cta:
1234-5678-90") o en un formato que el regex no anticipo. Se llama SOLO
como respaldo, cuando el regex no encontro ningun numero que coincida con
el catalogo - no reemplaza el regex, evita que la deteccion falle en
silencio.

A diferencia del Motor Documental (docint), esto NO pasa por Drive ni es
async: el archivo ya esta en memoria (mismo `contenido` que ya se
decodifico para el regex), asi que se manda el texto crudo directo a
Gemini en la misma request sincrona."""

import json
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_PROMPT = (
    "El texto de abajo es el encabezado/metadata de un estado de cuenta "
    "bancario (puede venir en CSV, XML o texto plano). Busca el numero de "
    "cuenta o CLABE de la cuenta propia del titular (NO cuentas de "
    "contrapartes/beneficiarios de los movimientos individuales, solo la "
    "cuenta duena del extracto). Responde SOLO con JSON valido, sin texto "
    'adicional, con esta forma exacta: {"numero_cuenta": str|null}. Si no '
    "hay ningun numero de cuenta/CLABE identificable, usa null - nunca "
    "inventes un valor.\n\nTexto:\n"
)

# Gemini no necesita leer archivos completos de miles de filas para esto -
# el numero de cuenta siempre vive en el encabezado/metadata inicial.
_MAX_CARACTERES_TEXTO = 4000


def detectar_numero_cuenta_por_ia(texto: str) -> str | None:
    """Regresa el numero de cuenta/CLABE que Gemini identifico en el texto,
    o None si no configuro la API key, hubo un error, o el modelo no
    encontro nada. Nunca lanza - best-effort, mismo criterio que el resto
    de detectar_cuenta."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        # Mismo modelo fijo que docint/gemini_provider.py (ver memoria
        # "gemini-api-precios-y-version") - el alias "-latest" devolvio 503
        # de forma persistente en pruebas.
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=_PROMPT + texto[:_MAX_CARACTERES_TEXTO],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        if not response.text:
            return None
        numero = json.loads(response.text).get("numero_cuenta")
        return str(numero) if numero else None
    except Exception:
        logger.warning("No se pudo detectar la cuenta por IA (Gemini)", exc_info=True)
        return None
