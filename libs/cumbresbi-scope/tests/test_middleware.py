import json

from django.test import RequestFactory

from cumbresbi_scope import EffectiveScopeMiddleware
from cumbresbi_scope.scope import EffectiveScope

rf = RequestFactory()


def _passthrough(request):
    return request


def test_debug_header_accepted_when_debug_true_and_no_public_key(settings):
    settings.DEBUG = True
    settings.CUMBRESBI_SCOPE_JWT_PUBLIC_KEY = None
    middleware = EffectiveScopeMiddleware(_passthrough)

    request = rf.get("/", **{"HTTP_X_DEBUG_SCOPE": json.dumps({"is_global": True})})
    result = middleware(request)

    assert result.effective_scope.is_global is True


def test_debug_header_ignored_when_debug_false():
    from django.test import override_settings

    with override_settings(DEBUG=False, CUMBRESBI_SCOPE_JWT_PUBLIC_KEY=None):
        middleware = EffectiveScopeMiddleware(_passthrough)
        request = rf.get("/", **{"HTTP_X_DEBUG_SCOPE": json.dumps({"is_global": True})})
        result = middleware(request)

    assert result.effective_scope == EffectiveScope.anonymous()


def test_no_header_and_no_token_resolves_to_anonymous(settings):
    settings.DEBUG = True
    settings.CUMBRESBI_SCOPE_JWT_PUBLIC_KEY = None
    middleware = EffectiveScopeMiddleware(_passthrough)

    request = rf.get("/")
    result = middleware(request)

    assert result.effective_scope == EffectiveScope.anonymous()


def test_malformed_debug_header_json_resolves_to_anonymous(settings):
    settings.DEBUG = True
    settings.CUMBRESBI_SCOPE_JWT_PUBLIC_KEY = None
    middleware = EffectiveScopeMiddleware(_passthrough)

    request = rf.get("/", **{"HTTP_X_DEBUG_SCOPE": "{not-valid-json"})
    result = middleware(request)

    assert result.effective_scope == EffectiveScope.anonymous()


def test_invalid_jwt_resolves_to_anonymous(settings):
    settings.DEBUG = False
    settings.CUMBRESBI_SCOPE_JWT_PUBLIC_KEY = "not-a-real-key"
    middleware = EffectiveScopeMiddleware(_passthrough)

    request = rf.get("/", HTTP_AUTHORIZATION="Bearer garbage.not.a.jwt")
    result = middleware(request)

    assert result.effective_scope == EffectiveScope.anonymous()


def test_valid_jwt_claims_populate_the_scope(monkeypatch, settings):
    settings.DEBUG = False
    settings.CUMBRESBI_SCOPE_JWT_PUBLIC_KEY = "fake-public-key-for-test"

    import jwt as pyjwt

    monkeypatch.setattr(
        pyjwt,
        "decode",
        lambda token, key, algorithms: {"is_global": False, "sociedad_rfcs": ["ABC123456XYZ"]},
    )

    middleware = EffectiveScopeMiddleware(_passthrough)
    request = rf.get("/", HTTP_AUTHORIZATION="Bearer whatever-the-signature-checked-out")
    result = middleware(request)

    assert result.effective_scope.is_global is False
    assert result.effective_scope.sociedad_rfcs == ("ABC123456XYZ",)


def test_debug_header_never_honored_outside_debug_even_if_public_key_missing():
    # Fail-closed explicito: DEBUG=False + sin llave publica configurada no
    # debe caer de vuelta al header de debug - debe ser anonimo, punto.
    from django.test import override_settings

    with override_settings(DEBUG=False, CUMBRESBI_SCOPE_JWT_PUBLIC_KEY=None):
        middleware = EffectiveScopeMiddleware(_passthrough)
        request = rf.get("/", **{"HTTP_X_DEBUG_SCOPE": json.dumps({"is_global": True})})
        result = middleware(request)

    assert result.effective_scope == EffectiveScope.anonymous()
