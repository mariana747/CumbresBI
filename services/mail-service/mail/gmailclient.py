"""Cliente de Gmail API - unico lugar del proyecto que envia correo real
(mismo criterio que drive-service/drive/driveclient.py para Drive: un solo
servicio con la credencial real, todo lo demas le pide el envio via HTTP).

Autenticacion: cuenta de servicio con domain-wide delegation, impersonando
a settings.GMAIL_SENDER_SUBJECT (una cuenta de servicio no tiene bandeja
propia - "actua como" ese usuario real del Workspace de Cumbres, que
tambien es el remitente que ve quien recibe el correo).

Modo simulado (settings.GMAIL_SERVICE_ACCOUNT_JSON vacio, default en dev):
en vez de mandar el correo de verdad, solo lo registra en el log - permite
probar todo el resto del flujo (Magic Links, tickets de cliente) sin la
cuenta de servicio real todavia. Cuando llegue la credencial, dejar de
estar vacio GMAIL_SERVICE_ACCOUNT_JSON activa el modo real sin tocar
ningun consumidor (iam-service, pld-service) - la interfaz (send_email) es
identica en ambos modos.
"""

import base64
import logging
from email.mime.text import MIMEText

from django.conf import settings

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


class MailError(Exception):
    """Cualquier falla al mandar el correo (real o simulado) - los views la
    traducen a un 502, nunca dejan pasar la excepcion cruda de
    googleapiclient al cliente."""


def _modo_real() -> bool:
    return bool(settings.GMAIL_SERVICE_ACCOUNT_JSON)


def _servicio_real():
    """Construye el cliente de googleapiclient - import perezoso a proposito
    (google-api-python-client/google-auth solo hacen falta en modo real; el
    modo simulado no debe requerir que esten instalados, ej. en pruebas
    unitarias rapidas)."""
    import json

    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    info = json.loads(settings.GMAIL_SERVICE_ACCOUNT_JSON)
    credentials = service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
    if settings.GMAIL_SENDER_SUBJECT:
        credentials = credentials.with_subject(settings.GMAIL_SENDER_SUBJECT)
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def send_email(to: str, subject: str, html_body: str) -> dict:
    """Manda un correo HTML simple (sin adjuntos - no hace falta todavia,
    Magic Links/tickets de cliente solo mandan un link). Regresa
    {"message_id": ...} (real o simulado)."""
    if not _modo_real():
        logger.warning(
            "GMAIL_SERVICE_ACCOUNT_JSON vacio - modo simulado, correo NO enviado de verdad: "
            "to=%s subject=%s",
            to,
            subject,
        )
        return {"message_id": "sim-no-enviado"}

    mensaje = MIMEText(html_body, "html", "utf-8")
    mensaje["to"] = to
    mensaje["subject"] = subject
    if settings.GMAIL_SENDER_SUBJECT:
        mensaje["from"] = settings.GMAIL_SENDER_SUBJECT
    raw = base64.urlsafe_b64encode(mensaje.as_bytes()).decode("ascii")

    servicio = _servicio_real()
    try:
        resultado = servicio.users().messages().send(userId="me", body={"raw": raw}).execute()
    except Exception as exc:  # noqa: BLE001 - cualquier error de googleapiclient
        raise MailError(f"No se pudo enviar el correo a '{to}': {exc}") from exc

    return {"message_id": resultado.get("id", "")}
