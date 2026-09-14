import json
import logging

from django.conf import settings

from .scope import EffectiveScope

logger = logging.getLogger("cumbresbi_scope")


class EffectiveScopeMiddleware:
    """Prueba request.effective_scope a partir del JWT de alcance.

    En produccion: el JWT (RS256, firmado por iam-service, validado ademas por
    el API Gateway - ver docs/architecture/README.md sec. 8) viaja en el header
    Authorization: Bearer <token>. Se valida la firma con
    settings.CUMBRESBI_SCOPE_JWT_PUBLIC_KEY.

    Fallback de cookie (mientras no exista el API Gateway real, Fase 1): el
    mismo JWT tambien viaja en la cookie HttpOnly que pone iam-service tras el
    login OIDC (nombre configurable via settings.CUMBRESBI_SCOPE_SESSION_COOKIE_NAME,
    default "cumbresbi_session" - ver services/iam-service/iam/auth_views.py). El
    frontend no puede leer esa cookie con JS (es HttpOnly a proposito) para
    reenviarla como header, pero el navegador SI la manda en cualquier fetch con
    credentials:"include" hacia el mismo host (localhost, sin importar el puerto,
    en dev) - por eso cada servicio puede leerla directo de sus propias cookies,
    sin necesitar un Gateway que traduzca cookie->header. En produccion, con un
    dominio raiz compartido real, esto sigue funcionando igual.

    En dev local (DEBUG=True y sin esa key configurada): iam-service todavia
    no emite JWTs reales (eso es trabajo de Fase 1, no de Fase 0), asi que se
    acepta un header plano X-Debug-Scope con el JSON de claims sin firmar, SOLO
    si DEBUG=True. Nunca se acepta ese header fuera de DEBUG.

    Fail-closed: cualquier token ausente/invalido/expirado resulta en
    EffectiveScope.anonymous() (ScopedQuerySet.none()), nunca en acceso GLOBAL
    por accidente.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.effective_scope = self._resolve_scope(request)
        return self.get_response(request)

    def _resolve_scope(self, request):
        public_key = getattr(settings, "CUMBRESBI_SCOPE_JWT_PUBLIC_KEY", None)
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        cookie_name = getattr(settings, "CUMBRESBI_SCOPE_SESSION_COOKIE_NAME", "cumbresbi_session")

        if public_key and auth_header.startswith("Bearer "):
            return self._scope_from_jwt(auth_header.removeprefix("Bearer "), public_key)

        if public_key and request.COOKIES.get(cookie_name):
            return self._scope_from_jwt(request.COOKIES[cookie_name], public_key)

        if settings.DEBUG and not public_key:
            debug_header = request.META.get("HTTP_X_DEBUG_SCOPE")
            if debug_header:
                try:
                    return EffectiveScope.from_claims(json.loads(debug_header))
                except (ValueError, TypeError):
                    logger.warning("X-Debug-Scope invalido, tratando como anonimo")

        return EffectiveScope.anonymous()

    def _scope_from_jwt(self, token, public_key):
        import jwt

        try:
            claims = jwt.decode(token, public_key, algorithms=["RS256"])
        except jwt.PyJWTError:
            logger.warning("JWT de alcance invalido o expirado, tratando como anonimo")
            return EffectiveScope.anonymous()
        return EffectiveScope.from_claims(claims)
