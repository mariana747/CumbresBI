import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 10


def enviar_correo_magic_link(request, email: str, magic_link_url: str) -> bool:
    """Envia el Magic Link real por correo via mail-service (Gmail API) -
    decision de Mariana (13/Ago/2026): ya no basta con mostrar el link en
    pantalla (modo dev), debe llegar de verdad a la bandeja del invitado.

    Reenvia el JWT/cookie del analista que genero el link (mismo patron
    que PldContraparteDocViewSet.subir hacia drive-service) para que el
    permiso ("iam.crear") lo siga decidiendo mail-service.

    No propaga la excepcion si mail-service no responde - un fallo de
    envio no debe tumbar la creacion del magic link en si (el token/url
    se sigue regresando en la respuesta como respaldo, ver views.py). Solo
    regresa True/False para que el llamador pueda avisar en la respuesta
    si el correo se mando o no."""
    headers, cookies = forward_auth_headers(request)

    url_completa = f"{settings.FRONTEND_BASE_URL}{magic_link_url}"
    html_body = (
        f"<p>Hola,</p>"
        f"<p>Te compartimos un enlace de acceso a CumbresBI:</p>"
        f'<p><a href="{url_completa}">{url_completa}</a></p>'
        f"<p>Este enlace es de un solo uso y expira pronto.</p>"
    )

    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "iam.crear"},
            json={"to": email, "subject": "Tu enlace de acceso a CumbresBI", "html_body": html_body},
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al enviar el magic link a %s", email, exc_info=True)
        return False

    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo el envio del magic link a %s: %s", email, respuesta.text)
        return False
    return True
