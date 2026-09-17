import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings
from django.utils.html import escape

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 10

# Tokens de marca duplicados de theme.ts a proposito: los correos van por
# Gmail API y los clientes de correo ignoran <style>, todo debe ir inline.
_AZUL = "#1C75BC"
_CHARCOAL = "#343741"
_INK_MUTED = "#6B7280"


def _renderizar_correo(
    *, kicker_texto: str, kicker_bg: str, kicker_color: str, titulo: str, cuerpo_html: str,
    cta_texto: str, cta_url: str, fineprint_texto: str,
) -> str:
    """Molde compartido de los 3 correos de mail-service; solo cambia el color/texto
    del kicker segun urgencia. Estilos 100% inline por compatibilidad con clientes de correo."""
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


def enviar_correo_magic_link(request, email: str, magic_link_url: str) -> bool:
    """Envia el Magic Link por correo via mail-service (Gmail API), reenviando el
    JWT/cookie del analista para que el permiso lo siga validando mail-service.
    No propaga excepciones: un fallo de envio no debe tumbar la creacion del link."""
    headers, cookies = forward_auth_headers(request)

    url_completa = f"{settings.FRONTEND_BASE_URL}{magic_link_url}"
    html_body = _renderizar_correo(
        kicker_texto="Acceso de un solo uso",
        kicker_bg="#FBF1DE",
        kicker_color="#9A6400",
        titulo="Tienes un enlace de acceso pendiente",
        cuerpo_html=(
            "<p style='margin:0;'>Un administrador te compartió un enlace para acceder a "
            "CumbresBI. Es de un solo uso — en cuanto lo abras y hagas lo que necesitas, "
            "dejará de funcionar.</p>"
        ),
        cta_texto="Abrir mi enlace",
        cta_url=url_completa,
        fineprint_texto="Expira en 30 minutos y solo puede usarse una vez. Si no esperabas este correo, ignóralo.",
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


def enviar_correo_acceso_externo(request, email: str, acceso_url: str) -> bool:
    """Igual que enviar_correo_magic_link pero para colaborador externo sin Workspace
    (IamExternalCollaborator): el link no vence por tiempo, solo se revoca a mano."""
    headers, cookies = forward_auth_headers(request)

    url_completa = f"{settings.FRONTEND_BASE_URL}{acceso_url}"
    html_body = _renderizar_correo(
        kicker_texto="Acceso de colaborador",
        kicker_bg="#EAF3FB",
        kicker_color="#135685",
        titulo="Ya tienes acceso a CumbresBI",
        cuerpo_html=(
            "<p style='margin:0;'>Te dieron acceso como colaborador externo. Usa el "
            "siguiente enlace cada vez que quieras entrar — es tuyo, no vence, y puedes "
            "guardarlo.</p>"
        ),
        cta_texto="Entrar a CumbresBI",
        cta_url=url_completa,
        fineprint_texto="Este enlace no expira, pero un administrador puede revocarlo en cualquier momento. No lo compartas.",
    )

    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "iam.crear"},
            json={"to": email, "subject": "Tu acceso a CumbresBI", "html_body": html_body},
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al enviar el acceso externo a %s", email, exc_info=True)
        return False

    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo el envio del acceso externo a %s: %s", email, respuesta.text)
        return False
    return True


def enviar_correo_invitacion_workspace(request, email: str) -> bool:
    """Avisa por correo al colaborador Workspace invitado. A diferencia de Magic
    Link/acceso externo no hay link ni token: el canje real es iniciar sesion con Google."""
    headers, cookies = forward_auth_headers(request)

    html_body = _renderizar_correo(
        kicker_texto="Colaborador Workspace",
        kicker_bg="#E8F5EE",
        kicker_color="#1E7B4D",
        titulo="Ya puedes entrar a CumbresBI",
        cuerpo_html=(
            "<p style='margin:0;'>Un administrador te dio acceso a CumbresBI. No "
            "necesitas ningún enlace ni contraseña nueva — solo entra con tu cuenta de "
            f"Google de siempre (<strong>{escape(email)}</strong>).</p>"
        ),
        cta_texto="Ir a CumbresBI",
        cta_url=settings.FRONTEND_BASE_URL,
        fineprint_texto="Tu acceso ya está activo — este correo es solo un aviso, no hace falta hacer nada más para que funcione.",
    )

    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "iam.crear"},
            json={"to": email, "subject": "Ya tienes acceso a CumbresBI", "html_body": html_body},
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al enviar el aviso de invitacion a %s", email, exc_info=True)
        return False

    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo el envio del aviso de invitacion a %s: %s", email, respuesta.text)
        return False
    return True
