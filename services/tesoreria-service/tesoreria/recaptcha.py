"""Verificacion server-side de reCAPTCHA v2 - mismo patron/codigo que
pld-service/pld/recaptcha.py (27/Ago/2026, ticket publico de proveedores).
Usado por TesoreriaTicketProveedorViewSet.subir_factura - el formulario
publico (tesoreria-ticket/[token]/page.tsx) manda el token que genera el
widget de Google, este modulo lo verifica contra la API de Google antes de
aceptar la subida.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


def verificar(recaptcha_token: str, remote_ip: str | None = None) -> bool:
    """True si el token es valido. Modo simulado (RECAPTCHA_SECRET_KEY
    vacio, default en dev): acepta cualquier token no vacio, para poder
    probar el formulario sin una cuenta real de reCAPTCHA - nunca falsea
    lo contrario (un token vacio siempre se rechaza, incluso en modo
    simulado)."""
    if not recaptcha_token:
        return False

    if not settings.RECAPTCHA_SECRET_KEY:
        logger.warning("RECAPTCHA_SECRET_KEY vacio - modo simulado, aceptando el token sin verificar contra Google")
        return True

    payload = {"secret": settings.RECAPTCHA_SECRET_KEY, "response": recaptcha_token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        respuesta = requests.post(_VERIFY_URL, data=payload, timeout=10)
        resultado = respuesta.json()
    except (requests.RequestException, ValueError):
        logger.warning("No se pudo verificar el token de reCAPTCHA contra Google", exc_info=True)
        return False

    return bool(resultado.get("success"))
