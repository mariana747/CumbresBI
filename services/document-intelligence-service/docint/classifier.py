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
    "recibo": "pld.comprobante_domicilio",
    "luz": "pld.comprobante_domicilio",
    "agua": "pld.comprobante_domicilio",
    "telmex": "pld.comprobante_domicilio",
    "izzi": "pld.comprobante_domicilio",
    "totalplay": "pld.comprobante_domicilio",
    "constanciafiscal": "pld.constancia_fiscal",
    "situacionfiscal": "pld.constancia_fiscal",
    "rfc": "pld.constancia_fiscal",
    "curp": "pld.curp",
    "cotizacion": "compras.cotizacion",
    "factura": "compras.factura_proveedor",
    "cfdi": "compras.factura_proveedor",
    "presupuesto": "materiales.presupuesto",
}

FALLBACK_PROMPT_KEY = "generic"


def _tokens(filename: str) -> list[str]:
    """minusculas, sin acentos, sin extension, partido en tokens por
    separadores (_, -, espacio, punto...) - para que 'INE_Juan-Perez.PDF',
    'ine juan perez.pdf' e 'ine.juan.perez.pdf' se traten igual, sin perder
    la frontera entre palabras (ver _matches)."""
    name = filename.rsplit(".", 1)[0] if "." in filename else filename
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    name = name.lower()
    return [t for t in re.split(r"[^a-z0-9]+", name) if t]


def _matches(keyword: str, tokens: list[str]) -> bool:
    """Una palabra clave coincide solo (a) como substring dentro de un mismo
    token, o (b) como concatenacion exacta de una racha de tokens completos
    consecutivos (para palabras clave compuestas como 'actanacimiento').

    Nunca cruza a ciegas la frontera entre dos tokens con un match parcial:
    'izzi_febrero.pdf' -> tokens ['izzi', 'febrero'] no debe coincidir con la
    palabra clave 'ife' solo porque 'izz-IFE-brero' la contiene por
    casualidad al concatenar todo el nombre sin limites."""
    if any(keyword in token for token in tokens):
        return True
    for i in range(len(tokens)):
        acc = ""
        for j in range(i, len(tokens)):
            acc += tokens[j]
            if acc == keyword:
                return True
    return False


def classify_by_filename(filename: str) -> tuple[str, bool]:
    """Devuelve (internal_prompt_key, matched_by_filename).

    matched_by_filename=False significa que se uso el prompt generico por no
    reconocer ninguna palabra clave en el nombre - el llamador debe tratar
    ese resultado como menos confiable, no como una clasificacion real.
    """
    tokens = _tokens(filename or "")
    for keyword, prompt_key in KEYWORD_TO_PROMPT_KEY.items():
        if _matches(keyword, tokens):
            return prompt_key, True
    return FALLBACK_PROMPT_KEY, False
