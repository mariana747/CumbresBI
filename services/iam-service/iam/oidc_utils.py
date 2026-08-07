import base64
import hashlib
import secrets
from urllib.parse import urlencode

import google.auth.transport.requests
import requests
from django.conf import settings
from google.oauth2 import id_token as google_id_token

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"


class OidcError(Exception):
    """Cualquier fallo del intercambio/validacion con Google - el callback
    lo captura y redirige a OIDC_FRONTEND_ERROR_URL, nunca deja pasar al
    usuario silenciosamente (ver README.md sec. 6.1, rama 'dominio no
    aprobado' -> HTTP 403 / sin sesion emitida)."""


def generar_pkce_pair() -> tuple[str, str]:
    """(code_verifier, code_challenge) - RFC 7636, metodo S256."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def generar_state() -> str:
    return secrets.token_urlsafe(32)


def build_authorization_url(code_challenge: str, state: str) -> str:
    params = {
        "client_id": settings.OIDC_CLIENT_ID,
        "redirect_uri": settings.OIDC_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        # prompt=select_account solo si el usuario pide explicitamente
        # cambiar de cuenta (ver /auth/google/start?prompt=select_account) -
        # el default (sin "prompt") es lo que habilita el SSO silencioso:
        # si ya hay una sesion de Google activa en el navegador, Google
        # regresa el code sin mostrar ninguna pantalla propia.
    }
    return f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


def exchange_code_for_tokens(code: str, code_verifier: str) -> dict:
    """POST a Google, intercambia el authorization code por tokens.
    Regresa el dict completo de la respuesta (incluye 'id_token')."""
    response = requests.post(
        GOOGLE_TOKEN_ENDPOINT,
        data={
            "code": code,
            "client_id": settings.OIDC_CLIENT_ID,
            "client_secret": settings.OIDC_CLIENT_SECRET,
            "redirect_uri": settings.OIDC_REDIRECT_URI,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier,
        },
        timeout=10,
    )
    if response.status_code != 200:
        raise OidcError(f"Google rechazo el intercambio de code: {response.status_code} {response.text}")
    return response.json()


def verify_google_id_token(raw_id_token: str) -> dict:
    """Valida firma (JWKS de Google, cacheado por la libreria) + audience.
    Regresa los claims (sub, email, email_verified, hd, name, picture)."""
    try:
        return google_id_token.verify_oauth2_token(
            raw_id_token,
            google.auth.transport.requests.Request(),
            audience=settings.OIDC_CLIENT_ID,
        )
    except ValueError as exc:
        raise OidcError(f"id_token invalido: {exc}") from exc


def dominio_aprobado(claims: dict) -> bool:
    hd = claims.get("hd")
    return bool(hd) and hd in settings.OIDC_APPROVED_DOMAINS
