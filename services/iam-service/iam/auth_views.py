"""Login OIDC real via Google Workspace (Fase 1, Semana 4;
docs/architecture/README.md sec. 6.1). Vistas Django simples (no
ViewSet/DRF): son parte de un flujo de redirects de navegador, no de una
API JSON convencional - /api/me es la unica que responde JSON.

SSO silencioso (decision de producto confirmada, ver memoria de sesion
"oidc-sso-silencioso-sin-boton-login"): esta vista NO decide eso, solo la
implementa - /auth/google/start no muestra ninguna pantalla propia, salta
directo a Google. El frontend ya no muestra el boton "Iniciar sesion con
Google" para usuarios internos (ver src/app/login/page.tsx - redirige
directo, solo cae a un boton "Reintentar" si /auth/google/callback regreso
con ?error=oidc).
"""

import logging
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.core import signing
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from .audit_utils import emitir_evento_auditoria
from .magic_link_utils import hash_token
from .models import IamExternalCollaborator, IamIdentity, IamInvitation, IamUser
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


class LoginRechazadoSinInvitacion(Exception):
    """El correo no tiene IamUser existente ni invitacion pendiente -
    decision hibrida 10/Ago/2026 (ver memoria de sesion
    "iam-invitacion-alcance-incierto"): un usuario ya registrado entra con
    login libre, uno nuevo de la organizacion necesita que un IAM Admin lo
    invite primero."""


def _agregar_error_a_redirect(url: str, error_code: str) -> str:
    """Reescribe el ?error=... de OIDC_FRONTEND_ERROR_URL sin asumir que
    su querystring ya tiene ese parametro (o ningun parametro)."""
    partes = urlsplit(url)
    query = dict(parse_qsl(partes.query))
    query["error"] = error_code
    return urlunsplit((partes.scheme, partes.netloc, partes.path, urlencode(query), partes.fragment))


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

    try:
        user = _upsert_identity(claims)
    except LoginRechazadoSinInvitacion:
        logger.warning(
            "Login rechazado: %s no tiene IamUser ni invitacion pendiente", claims.get("email")
        )
        response = redirect(_agregar_error_a_redirect(settings.OIDC_FRONTEND_ERROR_URL, "sin_invitacion"))
        response.delete_cookie(settings.OIDC_PKCE_COOKIE_NAME)
        return response

    # Gate de status (14/Ago/2026, hallazgo al construir "eliminar usuario"
    # en /admin/usuarios): sin esto, suspender/eliminar a alguien desde el
    # directorio no le cerraba la puerta de verdad si esa persona TAMBIEN
    # tiene cuenta de Workspace - _upsert_identity la deja pasar por login
    # libre sin fijarse en status. Mismo criterio que
    # canjear_acceso_externo (auth_views.py) para el 3er tipo de invitacion.
    if user.status != IamUser.STATUS_ACTIVE:
        logger.warning("Login rechazado: %s tiene status=%s", user.primary_email, user.status)
        response = redirect(_agregar_error_a_redirect(settings.OIDC_FRONTEND_ERROR_URL, "cuenta_suspendida"))
        response.delete_cookie(settings.OIDC_PKCE_COOKIE_NAME)
        return response

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


@require_GET
def canjear_acceso_externo(request, token):
    """Canje del 3er tipo de invitacion (colaborador externo sin
    Workspace, ver models.IamExternalCollaborator y memoria de sesion
    "tercer-tipo-invitacion-externo-sin-workspace"): a diferencia de
    IamMagicLinkViewSet.validar (JSON, JWT de alcance limitado), esta
    vista es de navegador - el link del correo apunta directo aqui, no a
    una pantalla del frontend que luego llama a la API.

    Emite la MISMA cookie de sesion que google_callback
    (issue_session_jwt) porque el colaborador debe navegar la app normal
    con sus roles/permisos reales, no solo probar un correo verificado
    como el magic link. El link no vence por tiempo (no hay expires_at
    aqui) - solo revocado a mano (IamExternalCollaboratorViewSet.revocar,
    que tambien suspende el IamUser)."""
    try:
        acceso = IamExternalCollaborator.objects.select_related("user").get(token_hash=hash_token(token))
    except IamExternalCollaborator.DoesNotExist:
        return redirect(_agregar_error_a_redirect(settings.OIDC_FRONTEND_ERROR_URL, "acceso_invalido"))

    if acceso.revoked_at is not None or acceso.user.status != IamUser.STATUS_ACTIVE:
        return redirect(_agregar_error_a_redirect(settings.OIDC_FRONTEND_ERROR_URL, "acceso_revocado"))

    acceso.last_used_at = timezone.now()
    acceso.save(update_fields=["last_used_at"])

    session_jwt = issue_session_jwt(acceso.user)
    response = redirect(settings.OIDC_FRONTEND_SUCCESS_URL)
    response.set_cookie(
        settings.SESSION_COOKIE_NAME_JWT,
        session_jwt,
        max_age=settings.SESSION_JWT_TTL_MINUTES * 60,
        httponly=True,
        samesite="Lax",
    )

    emitir_evento_auditoria(
        "iam_external_collaborators.login",
        "iam_external_collaborators",
        acceso.external_access_id,
        actor_user_id=acceso.user.user_id,
        valores_nuevos={"email": acceso.email},
    )
    return response


def _upsert_identity(claims: dict) -> IamUser:
    """Crea/actualiza iam_identities + iam_users (README.md sec. 6.1, paso
    7). email_verified/hd/picture se refrescan en cada login - son datos
    de Google, no editables por el usuario dentro de CumbresBI.

    Gate de invitacion formal (decision hibrida 10/Ago/2026, ver memoria
    de sesion "iam-invitacion-alcance-incierto"): si el correo YA tiene
    IamUser, es un usuario ya registrado en la organizacion -> login
    libre, como siempre. Si NO lo tiene, es alguien nuevo -> solo entra si
    un IAM Admin ya lo invito (IamInvitation pendiente, ni aceptada ni
    revocada); si no hay invitacion, se rechaza el login SIN crear el
    IamUser (antes de este gate, cualquier correo del dominio aprobado se
    autocreaba en silencio - ver LoginRechazadoSinInvitacion arriba).

    Reactivacion (14/Ago/2026, ver IamUserViewSet.eliminar): un IamUser
    con status=DELETED se trata como "sin cuenta" para este gate (misma
    logica que IamInvitationViewSet.create, que ya excluye DELETED del
    chequeo de "ya existe una cuenta") - necesita invitacion nueva, y al
    aceptarla se reactiva (status=ACTIVE) en vez de crear una fila
    duplicada. Sin esto, un usuario eliminado quedaba en un callejon sin
    salida: no podia loguearse (gate de status en google_callback) ni
    volver a entrar por invitacion (esta fila ya "existia")."""
    email = claims["email"]
    now = timezone.now()

    user = IamUser.objects.filter(primary_email__iexact=email).exclude(status=IamUser.STATUS_DELETED).first()
    if not user:
        invitacion = IamInvitation.objects.filter(
            email__iexact=email, accepted_at__isnull=True, revoked_at__isnull=True
        ).first()
        if not invitacion:
            raise LoginRechazadoSinInvitacion(email)

        user = IamUser.objects.filter(primary_email__iexact=email, status=IamUser.STATUS_DELETED).first()
        if user:
            user.status = IamUser.STATUS_ACTIVE
            user.display_name = claims.get("name")
            user.save(update_fields=["status", "display_name"])
        else:
            user = IamUser.objects.create(primary_email=email, display_name=claims.get("name"))
        invitacion.accepted_at = now
        invitacion.save(update_fields=["accepted_at"])

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

    # picture_url no viaja en el JWT (es dato de Google que se refresca en
    # cada login, no un claim de alcance) - se resuelve aqui de la
    # identidad mas reciente, para el avatar real del header (AppShell.tsx).
    identity = IamIdentity.objects.filter(user_id=claims["sub"]).order_by("-last_login_at").first()

    return JsonResponse(
        {
            "user_id": claims["sub"],
            "email": claims["email"],
            "is_global": claims["is_global"],
            "sociedad_rfcs": claims["sociedad_rfcs"],
            "proyecto_ids": claims["proyecto_ids"],
            "centro_ids": claims["centro_ids"],
            "contrato_ids": claims["contrato_ids"],
            # Ya viajaban en el JWT (compute_effective_scope_claims) pero
            # /api/me no los exponia - el frontend los necesita para
            # filtrar el sidebar por rol (ver AppShell.tsx), no solo
            # confiar en que el backend regrese 403 en escritura.
            "role_keys": claims["role_keys"],
            "perm_keys": claims["perm_keys"],
            "picture_url": identity.picture_url if identity else None,
        }
    )
