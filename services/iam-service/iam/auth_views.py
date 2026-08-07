"""Login OIDC real via Google Workspace (Fase 1, Semana 4;
docs/architecture/README.md sec. 6.1). Vistas Django simples (no
ViewSet/DRF): son parte de un flujo de redirects de navegador, no de una
API JSON convencional - /api/me es la unica que responde JSON.

SSO silencioso (decision de producto confirmada, ver memoria de sesion
"oidc-sso-silencioso-sin-boton-login"): esta vista NO decide eso, solo la
implementa - /auth/google/start no muestra ninguna pantalla propia, salta
directo a Google. El frontend es quien no debe mostrar un boton "Iniciar
sesion con Google" para usuarios internos (queda pendiente en frontend,
ver src/lib/auth.ts - sesion simulada, se retira cuando este flujo quede
probado de punta a punta).
"""

import logging

from django.conf import settings
from django.core import signing
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from .audit_utils import emitir_evento_auditoria
from .models import IamIdentity, IamUser
from .oidc_utils import (
    OidcError,
    build_authorization_url,
    dominio_aprobado,
    exchange_code_for_tokens,
    generar_pkce_pair,
    generar_state,
    verify_google_id_token,
)
from .session_utils import decode_session_jwt, issue_session_jwt

logger = logging.getLogger(__name__)

_PKCE_SALT = "oidc-pkce"


@require_GET
def google_start(request):
    code_verifier, code_challenge = generar_pkce_pair()
    state = generar_state()

    response = redirect(build_authorization_url(code_challenge, state))
    signed = signing.dumps({"state": state, "code_verifier": code_verifier}, salt=_PKCE_SALT)
    response.set_cookie(
        settings.OIDC_PKCE_COOKIE_NAME,
        signed,
        max_age=settings.OIDC_PKCE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="Lax",
    )
    return response


@require_GET
def google_callback(request):
    # El usuario cancelo el consentimiento, o Google regreso un error
    # propio (access_denied, etc.) - no hay code que intercambiar.
    if request.GET.get("error"):
        return redirect(settings.OIDC_FRONTEND_ERROR_URL)

    code = request.GET.get("code")
    state = request.GET.get("state")
    raw_cookie = request.COOKIES.get(settings.OIDC_PKCE_COOKIE_NAME)
    if not code or not state or not raw_cookie:
        return redirect(settings.OIDC_FRONTEND_ERROR_URL)

    try:
        pkce_data = signing.loads(raw_cookie, salt=_PKCE_SALT, max_age=settings.OIDC_PKCE_MAX_AGE_SECONDS)
    except signing.BadSignature:
        logger.warning("Cookie PKCE invalida o expirada en /auth/google/callback")
        return redirect(settings.OIDC_FRONTEND_ERROR_URL)

    if pkce_data.get("state") != state:
        logger.warning("state no coincide en /auth/google/callback (posible CSRF)")
        return redirect(settings.OIDC_FRONTEND_ERROR_URL)

    try:
        tokens = exchange_code_for_tokens(code, pkce_data["code_verifier"])
        claims = verify_google_id_token(tokens["id_token"])
        if not dominio_aprobado(claims):
            raise OidcError(f"Dominio no aprobado: {claims.get('hd')}")
    except OidcError:
        logger.warning("Login OIDC rechazado", exc_info=True)
        response = redirect(settings.OIDC_FRONTEND_ERROR_URL)
        response.delete_cookie(settings.OIDC_PKCE_COOKIE_NAME)
        return response

    user = _upsert_identity(claims)

    session_jwt = issue_session_jwt(user)
    response = redirect(settings.OIDC_FRONTEND_SUCCESS_URL)
    response.set_cookie(
        settings.SESSION_COOKIE_NAME_JWT,
        session_jwt,
        max_age=settings.SESSION_JWT_TTL_MINUTES * 60,
        httponly=True,
        samesite="Lax",
    )
    response.delete_cookie(settings.OIDC_PKCE_COOKIE_NAME)

    emitir_evento_auditoria(
        "iam_users.login",
        "iam_users",
        user.user_id,
        actor_user_id=user.user_id,
        valores_nuevos={"email": user.primary_email, "provider": "google"},
    )
    return response


def _upsert_identity(claims: dict) -> IamUser:
    """Crea/actualiza iam_identities + iam_users (README.md sec. 6.1, paso
    7). email_verified/hd/picture se refrescan en cada login - son datos
    de Google, no editables por el usuario dentro de CumbresBI."""
    email = claims["email"]
    now = timezone.now()

    user = IamUser.objects.filter(primary_email__iexact=email).first()
    if not user:
        user = IamUser.objects.create(primary_email=email, display_name=claims.get("name"))

    identity = IamIdentity.objects.filter(
        provider=IamIdentity.PROVIDER_GOOGLE, provider_subject=claims["sub"]
    ).first()
    if identity:
        identity.email = email
        identity.email_verified = bool(claims.get("email_verified"))
        identity.hosted_domain = claims.get("hd")
        identity.picture_url = claims.get("picture")
        identity.last_login_at = now
        identity.save()
    else:
        IamIdentity.objects.create(
            user=user,
            provider_subject=claims["sub"],
            email=email,
            email_verified=bool(claims.get("email_verified")),
            hosted_domain=claims.get("hd"),
            picture_url=claims.get("picture"),
            last_login_at=now,
        )
    return user


@require_GET
def logout(request):
    response = JsonResponse({"detail": "Sesion cerrada."})
    response.delete_cookie(settings.SESSION_COOKIE_NAME_JWT)
    return response


# csrf_exempt: esta vista solo LEE la cookie de sesion, no depende del
# CSRF token de Django (no hay formulario ni cambio de estado aqui).
@csrf_exempt
@require_GET
def me(request):
    token = request.COOKIES.get(settings.SESSION_COOKIE_NAME_JWT)
    if not token:
        return JsonResponse({"detail": "No autenticado."}, status=401)

    claims = decode_session_jwt(token)
    if not claims:
        return JsonResponse({"detail": "Sesion invalida o expirada."}, status=401)

    return JsonResponse(
        {
            "user_id": claims["sub"],
            "email": claims["email"],
            "is_global": claims["is_global"],
            "sociedad_rfcs": claims["sociedad_rfcs"],
            "proyecto_ids": claims["proyecto_ids"],
            "centro_ids": claims["centro_ids"],
            "contrato_ids": claims["contrato_ids"],
        }
    )
