import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings
from django.utils.html import escape

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 10

# Tokens de marca (ver frontend/src/theme/theme.ts, BRAND) - duplicados aqui
# a proposito, mismo criterio que iam-service/iam/mail_utils.py: los
# correos van por Gmail API, no por Next.js, y los clientes de correo
# (Gmail/Outlook/Apple Mail) ignoran <style> - todo va inline, asi que no
# hay forma de importar el theme real ni la plantilla de iam-service.
_AZUL = "#1C75BC"
_CHARCOAL = "#343741"
_INK_MUTED = "#6B7280"


def _renderizar_correo(
    *, kicker_texto: str, kicker_bg: str, kicker_color: str, titulo: str, cuerpo_html: str,
    cta_texto: str, cta_url: str, fineprint_texto: str,
) -> str:
    """Mismo molde que iam-service/iam/mail_utils.py::_renderizar_correo
    (diseño aprobado por Mariana 14/Ago/2026) - wordmark -> kicker de color
    -> titulo -> cuerpo -> boton -> nota al pie. Duplicado en vez de
    compartido: ver comentario de _AZUL/_CHARCOAL arriba."""
    return f"""
<div style="background:#F1F3F5;padding:32px 16px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:12px;
              border:1px solid #E1E4E9;padding:36px 34px 30px;">
    <div style="font-size:15px;font-weight:800;letter-spacing:-0.01em;color:{_CHARCOAL};
                margin-bottom:24px;">
      <span style="display:inline-block;width:22px;height:22px;border-radius:6px;
                    background:{_AZUL};color:#fff;font-size:12px;font-weight:800;
                    text-align:center;line-height:22px;margin-right:8px;">C</span>CumbresBI
    </div>
    <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.06em;
                  text-transform:uppercase;padding:4px 10px;border-radius:100px;
                  background:{kicker_bg};color:{kicker_color};margin-bottom:14px;">
      {escape(kicker_texto)}
    </span>
    <h1 style="font-size:20px;font-weight:700;color:#23252B;margin:0 0 14px;
               letter-spacing:-0.01em;">{escape(titulo)}</h1>
    <div style="color:#4B4F58;font-size:14.5px;line-height:1.65;margin:0 0 20px;">
      {cuerpo_html}
    </div>
    <a href="{cta_url}" style="display:inline-block;background:{_AZUL};color:#ffffff;
       text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;
       border-radius:7px;margin:0 0 22px;">{escape(cta_texto)}</a>
    <div style="font-size:12.5px;color:{_INK_MUTED};background:#F7F7F8;border-radius:7px;
                padding:10px 12px;">
      {escape(fineprint_texto)}
    </div>
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid #EEEFF1;
                font-size:11.5px;color:#9BA0AB;">
      Consultoría y Proyectos Cumbres · este correo se generó automáticamente, no respondas a él.
    </div>
  </div>
</div>
""".strip()


def enviar_correo_ticket_cliente(request, email: str, token: str) -> bool:
    """Envia el link del ticket de cliente (KYC externo) real por correo
    via mail-service (Gmail API) - decision de Mariana (13/Ago/2026): ya no
    basta con mostrarlo en pantalla, debe llegar de verdad a la bandeja del
    cliente. Mismo patron y diseño que iam-service/iam/mail_utils.py
    (17/Ago/2026: se le dio el mismo diseño que los correos de magic link).

    No propaga la excepcion si mail-service no responde - un fallo de
    envio no debe tumbar la creacion del ticket en si (el token se sigue
    regresando en la respuesta como respaldo, ver views.py)."""
    headers, cookies = forward_auth_headers(request)

    url_completa = f"{settings.FRONTEND_BASE_URL}/pld-ticket/{token}"
    html_body = _renderizar_correo(
        kicker_texto="Solicitud de documentos",
        kicker_bg="#FBF1DE",
        kicker_color="#9A6400",
        titulo="Tienes documentos pendientes de subir",
        cuerpo_html=(
            "<p style='margin:0;'>CumbresBI te pide subir uno o más documentos para tu "
            "expediente de KYC. Usa el siguiente enlace para hacerlo — es de uso limitado, "
            "así que solo compártelo si tú lo vas a usar.</p>"
        ),
        cta_texto="Subir mis documentos",
        cta_url=url_completa,
        fineprint_texto="Este enlace expira pronto y tiene un límite de usos. Si no esperabas este correo, ignóralo.",
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
