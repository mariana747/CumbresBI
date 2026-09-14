"""Endpoints del flujo OAuth personal de Google (14/Sep/2026, ver
google_oauth.py). Vistas Django simples (no ViewSet/DRF) - mismo criterio
que auth_views.py: /callback es parte de un flujo de redirects de
navegador, no de una API JSON convencional.

request.effective_scope ya viene resuelto por
cumbresbi_scope.EffectiveScopeMiddleware para CUALQUIER vista (no solo
DRF) - por eso /estado y /autorizar pueden usarlo directo, igual que
cualquier ViewSet del servicio."""

import logging

import requests
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from . import google_oauth
from .models import IamGooglePersonalToken

logger = logging.getLogger(__name__)


def _requiere_identidad(request):
    """401 generico - ninguna de estas vistas tiene sentido sin saber que
    usuario es (ni siquiera un perm_key especifico: conectar SU PROPIA
    cuenta de Google es algo que cualquier usuario logueado puede hacer,
    no una accion administrativa)."""
    if not request.effective_scope or not request.effective_scope.identity_user_id:
        return JsonResponse({"detail": "No autenticado."}, status=401)
    return None


@require_GET
def google_personal_estado(request):
    """GET /api/personal/estado/ - {conectado, email} para pintar el boton
    "Conectar con Google" vs. "Exportar a Google Sheets" en el frontend."""
    error = _requiere_identidad(request)
    if error:
        return error
    token = IamGooglePersonalToken.objects.filter(user_id=request.effective_scope.identity_user_id).first()
    return JsonResponse({"conectado": bool(token), "email": token.google_email if token else None})


@require_GET
def google_personal_autorizar(request):
    """GET /api/personal/autorizar/ - {url} de consentimiento de Google, a
    donde el frontend redirige (window.location, no fetch normal - el
    usuario tiene que ver la pantalla de Google)."""
    error = _requiere_identidad(request)
    if error:
        return error
    if not google_oauth.configurado():
        return JsonResponse({"detail": "La conexion con Google no esta configurada en este ambiente."}, status=503)
    return JsonResponse({"url": google_oauth.url_autorizacion(request.effective_scope.identity_user_id)})


# csrf_exempt (14/Sep/2026, mismo criterio que auth_views.google_callback):
# navegacion GET de vuelta desde accounts.google.com, no un submit propio.
@csrf_exempt
@require_GET
def google_personal_callback(request):
    """GET /api/personal/callback/ - PUBLICO (Google redirige el navegador
    aqui directo, sin forma de mandar nuestro JWT/cookie de sesion de
    forma confiable) - la identidad del usuario viaja en `state`, firmado
    en google_oauth.url_autorizacion (ver google_oauth.leer_state)."""
    error_google = request.GET.get("error")
    state = request.GET.get("state", "")
    identity_user_id = google_oauth.leer_state(state)
    retorno = _url_retorno()

    if error_google:
        # El usuario le dio "Cancelar" en la pantalla de consentimiento -
        # no es un error nuestro, solo no se conecto.
        return redirect(f"{retorno}?google_sheets=cancelado")
    if not identity_user_id:
        return redirect(f"{retorno}?google_sheets=error")

    code = request.GET.get("code")
    try:
        tokens = google_oauth.intercambiar_code(code)
    except requests.RequestException:
        logger.warning("fallo el intercambio de code por tokens de Google", exc_info=True)
        return redirect(f"{retorno}?google_sheets=error")

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        # Sin refresh_token (14/Sep/2026, ver comentario en
        # google_oauth.url_autorizacion sobre prompt=consent) - no hay nada
        # que guardar, no se puede refrescar el access_token despues.
        logger.warning("Google no regreso refresh_token para %s", identity_user_id)
        return redirect(f"{retorno}?google_sheets=error")

    email = google_oauth.obtener_email(tokens.get("access_token", ""))
    IamGooglePersonalToken.objects.update_or_create(
        user_id=identity_user_id,
        defaults={"refresh_token": refresh_token, "google_email": email},
    )
    return redirect(f"{retorno}?google_sheets=conectado")


@require_GET
def google_personal_access_token(request):
    """GET /api/personal/access-token/ - consumido servicio-a-servicio
    (ej. tesoreria-service) reenviando el JWT/cookie ORIGINAL del usuario
    (mismo patron que forward_auth_headers en el resto del proyecto, no un
    secreto compartido) - regresa un access_token de Google fresco para
    ESE usuario, o 404 si nunca conecto su cuenta."""
    error = _requiere_identidad(request)
    if error:
        return error
    token = IamGooglePersonalToken.objects.filter(user_id=request.effective_scope.identity_user_id).first()
    if not token:
        return JsonResponse({"detail": "El usuario no ha conectado su cuenta de Google."}, status=404)
    try:
        tokens = google_oauth.refrescar_access_token(token.refresh_token)
    except requests.RequestException:
        # El refresh_token pudo haber sido revocado desde la cuenta de
        # Google del usuario - se borra para que el frontend vuelva a
        # ofrecer "Conectar con Google" en vez de fallar en silencio cada
        # vez (ver TesoreriaFlujoViewSet.exportar_sheets en tesoreria-service).
        logger.info("refresh_token invalido para %s, se borra la conexion", token.user_id, exc_info=True)
        token.delete()
        return JsonResponse({"detail": "La conexión con Google ya no es válida, hay que reconectar."}, status=404)
    return JsonResponse({"access_token": tokens["access_token"]})


def _url_retorno() -> str:
    from django.conf import settings

    return settings.GOOGLE_PERSONAL_OAUTH_RETORNO_URL
