"""Clasificacion inicial por nombre de archivo (Fase 0, Semana 3, Actividad
14) - paso previo y barato a la validacion de contenido por Gemini API.

No reemplaza la clasificacion real (eso lo hace Gemini con el contenido, ver
providers/gemini_provider.py) - solo elige QUE PROMPT usar antes de gastar la
llamada, para que el mismo documento no dependa de que el usuario sepa el
nombre tecnico interno del tipo documental.

Regla: si el nombre del archivo no coincide con ninguna palabra clave
conocida, se usa el prompt "generic" (Gemini clasifica sin pista previa) -
nunca se inventa un tipo documental por adivinanza. El llamador (la vista)
debe poder distinguir "coincidio por nombre" de "cayo al generico" para no
presentar una clasificacion como mas segura de lo que es.
"""

import re
import unicodedata

# Palabras clave -> internal_prompt_key (ver prompts.py). Configurable: se
# agregan entradas aqui conforme un modulo consumidor defina nuevos tipos
# documentales, sin tocar la logica de clasificacion.
KEYWORD_TO_PROMPT_KEY = {
    "ine": "pld.ine",
    "ife": "pld.ine",
    "identificacion": "pld.ine",
    "credencialvotar": "pld.ine",
    "actanacimiento": "pld.acta_nacimiento",
    "actaconstitutiva": "pld.acta_constitutiva",
    "constitutiva": "pld.acta_constitutiva",
    "comprobantedomicilio": "pld.comprobante_domicilio",
    "domicilio": "pld.comprobante_domicilio",
    "cfe": "pld.comprobante_domicilio",
    "recibolu": "pld.comprobante_domicilio",  # "recibo_luz" normalizado
    "constanciafiscal": "pld.constancia_fiscal",
    "situacionfiscal": "pld.constancia_fiscal",
    "rfc": "pld.constancia_fiscal",
    "cotizacion": "compras.cotizacion",
    "factura": "compras.factura_proveedor",
    "cfdi": "compras.factura_proveedor",
    "presupuesto": "materiales.presupuesto",
}

FALLBACK_PROMPT_KEY = "generic"


def _normalize(filename: str) -> str:
    """minusculas, sin acentos, sin extension, sin separadores - para que
    'INE_Juan-Perez.PDF', 'ine juan perez.pdf' e 'ine.juan.perez.pdf' se
    traten igual."""
    name = filename.rsplit(".", 1)[0] if "." in filename else filename
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    name = name.lower()
    return re.sub(r"[^a-z0-9]", "", name)


def classify_by_filename(filename: str) -> tuple[str, bool]:
    """Devuelve (internal_prompt_key, matched_by_filename).

    matched_by_filename=False significa que se uso el prompt generico por no
    reconocer ninguna palabra clave en el nombre - el llamador debe tratar
    ese resultado como menos confiable, no como una clasificacion real.
    """
    normalized = _normalize(filename or "")
    for keyword, prompt_key in KEYWORD_TO_PROMPT_KEY.items():
        if keyword in normalized:
            return prompt_key, True
    return FALLBACK_PROMPT_KEY, False
