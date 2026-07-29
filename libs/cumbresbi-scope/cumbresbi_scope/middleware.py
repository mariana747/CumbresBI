import json
import logging

from django.conf import settings

from .scope import EffectiveScope

logger = logging.getLogger("cumbresbi_scope")


class EffectiveScopeMiddleware:
    """Puebla request.effective_scope a partir del JWT de alcance.

    En produccion: el JWT (RS256, firmado por iam-service, validado ademas por
    el API Gateway - ver docs/architecture/README.md sec. 8) viaja en el header
    Authorization: Bearer <token>. Se valida la firma con
    settings.CUMBRESBI_SCOPE_JWT_PUBLIC_KEY.

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

        if public_key and auth_header.startswith("Bearer "):
            return self._scope_from_jwt(auth_header.removeprefix("Bearer "), public_key)

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
