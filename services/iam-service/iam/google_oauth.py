"""OAuth personal de Google (14/Sep/2026, "exportar a Google Sheets...se
guardara en su drive personal") - un usuario autoriza con SU PROPIA cuenta
de Google (via el flujo "authorization code" estandar) para que otros
servicios (hoy tesoreria-service) puedan crear/escribir hojas de calculo
que queden en el Drive personal de ESE usuario, no en la Unidad compartida
corporativa (esa sigue siendo drive-service, domain-wide delegation, ver
services/drive-service/drive/driveclient.py).

Implementado a mano con `requests` en vez de google-auth-oauthlib (libreria
nueva) - el intercambio de codigo/refresh es un POST simple a
oauth2.googleapis.com/token, no vale la pena la dependencia extra.

App en estado "Prueba" en GCP (sin verificar todavia) - solo los correos
agregados como "Test user" en OAuth consent screen > Audience pueden
completar el consentimiento."""

import requests
from django.conf import settings
from django.core import signing

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
# drive.file (14/Sep/2026, "dejar que ellos puedan escoger donde
# guardar") - alcance minimo para poder MOVER el Sheet ya creado a la
# carpeta que el usuario elija con el Google Picker (solo archivos que
# esta app creo, no todo su Drive - ese navegar de carpetas lo hace el
# Picker con su propio token efimero de drive.readonly, ver
# frontend/src/lib/googleFolderPicker.ts, no con este refresh_token).
_SCOPE = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file"
_TIMEOUT_SEGUNDOS = 15
_SALT = "iam.google_oauth.state"
_STATE_MAX_AGE_SEGUNDOS = 600


def configurado() -> bool:
    return bool(
        settings.GOOGLE_PERSONAL_OAUTH_CLIENT_ID
        and settings.GOOGLE_PERSONAL_OAUTH_CLIENT_SECRET
        and settings.GOOGLE_PERSONAL_OAUTH_REDIRECT_URI
    )


def firmar_state(identity_user_id: str) -> str:
    """El `state` viaja por la URL (navegador -> Google -> de vuelta a
    nuestro callback publico, sin JWT que reenviar) - firmado para que
    nadie pueda mandar un callback fabricado con el user_id de otra
    persona (ver signing.dumps, usa SECRET_KEY del servicio)."""
    return signing.dumps({"identity_user_id": identity_user_id}, salt=_SALT)


def leer_state(state: str) -> str | None:
    try:
        datos = signing.loads(state, salt=_SALT, max_age=_STATE_MAX_AGE_SEGUNDOS)
    except signing.BadSignature:
        return None
    return datos.get("identity_user_id")


def url_autorizacion(identity_user_id: str) -> str:
    params = {
        "client_id": settings.GOOGLE_PERSONAL_OAUTH_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_PERSONAL_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": _SCOPE,
        # access_type=offline + prompt=consent (14/Sep/2026) - sin esto
        # Google no siempre regresa refresh_token (solo la primera vez que
        # un usuario autoriza esta app); prompt=consent lo fuerza cada vez,
        # necesario porque queremos poder refrescar el access_token despues
        # sin volver a pedirle que inicie sesion cada vez que exporte.
        "access_type": "offline",
        "prompt": "consent",
        "state": firmar_state(identity_user_id),
    }
    return f"{_AUTH_URL}?{requests.compat.urlencode(params)}"


def intercambiar_code(code: str) -> dict:
    """POST a Google, code -> {access_token, refresh_token, ...}. Puede
    fallar (code expirado/ya usado, redirect_uri no coincide) - el
    llamador decide como mostrarlo (ver views.py)."""
    respuesta = requests.post(
        _TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.GOOGLE_PERSONAL_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_PERSONAL_OAUTH_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_PERSONAL_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=_TIMEOUT_SEGUNDOS,
    )
    respuesta.raise_for_status()
    return respuesta.json()


def refrescar_access_token(refresh_token: str) -> dict:
    """refresh_token -> {access_token, expires_in, ...} nuevo. Un
    refresh_token puede haber sido revocado por el usuario desde su cuenta
    de Google - el llamador debe tratar un error aqui como "hay que
    reconectar" (ver views.py::GooglePersonalAccessTokenView)."""
    respuesta = requests.post(
        _TOKEN_URL,
        data={
            "refresh_token": refresh_token,
            "client_id": settings.GOOGLE_PERSONAL_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_PERSONAL_OAUTH_CLIENT_SECRET,
            "grant_type": "refresh_token",
        },
        timeout=_TIMEOUT_SEGUNDOS,
    )
    respuesta.raise_for_status()
    return respuesta.json()


def obtener_email(access_token: str) -> str | None:
    """Solo para mostrar "conectado como <email>" en pantalla - nunca
    obligatorio para el flujo en si (si falla, se guarda sin email)."""
    try:
        respuesta = requests.get(
            _USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=_TIMEOUT_SEGUNDOS
        )
        respuesta.raise_for_status()
        return respuesta.json().get("email")
    except requests.RequestException:
        return None
