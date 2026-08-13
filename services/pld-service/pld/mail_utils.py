import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 10


def enviar_correo_ticket_cliente(request, email: str, token: str) -> bool:
    """Envia el link del ticket de cliente (KYC externo) real por correo
    via mail-service (Gmail API) - decision de Mariana (13/Ago/2026): ya no
    basta con mostrarlo en pantalla, debe llegar de verdad a la bandeja del
    cliente. Mismo patron que iam-service/iam/mail_utils.py.

    No propaga la excepcion si mail-service no responde - un fallo de
    envio no debe tumbar la creacion del ticket en si (el token se sigue
    regresando en la respuesta como respaldo, ver views.py)."""
    headers, cookies = forward_auth_headers(request)

    url_completa = f"{settings.FRONTEND_BASE_URL}/pld-ticket/{token}"
    html_body = (
        f"<p>Hola,</p>"
        f"<p>Te compartimos un enlace para subir tus documentos de KYC a CumbresBI:</p>"
        f'<p><a href="{url_completa}">{url_completa}</a></p>'
        f"<p>Este enlace expira pronto y tiene un límite de usos.</p>"
    )

    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "pld-compliance.crear"},
            json={"to": email, "subject": "Enlace para subir tus documentos - CumbresBI", "html_body": html_body},
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al enviar el ticket de cliente a %s", email, exc_info=True)
        return False

    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo el envio del ticket de cliente a %s: %s", email, respuesta.text)
        return False
    return True
