from django.test import RequestFactory

from cumbresbi_scope import forward_auth_headers

rf = RequestFactory()


def test_forwards_authorization_header():
    request = rf.get("/", HTTP_AUTHORIZATION="Bearer un-jwt")
    headers, cookies = forward_auth_headers(request)
    assert headers == {"Authorization": "Bearer un-jwt"}
    assert cookies == {}


def test_forwards_session_cookie_with_default_name():
    request = rf.get("/")
    request.COOKIES["cumbresbi_session"] = "cookie-value"
    headers, cookies = forward_auth_headers(request)
    assert headers == {}
    assert cookies == {"cumbresbi_session": "cookie-value"}


def test_forwards_session_cookie_with_custom_name(settings):
    settings.CUMBRESBI_SCOPE_SESSION_COOKIE_NAME = "otra_cookie"
    request = rf.get("/")
    request.COOKIES["otra_cookie"] = "cookie-value"
    _, cookies = forward_auth_headers(request)
    assert cookies == {"otra_cookie": "cookie-value"}


def test_forwards_both_when_present():
    request = rf.get("/", HTTP_AUTHORIZATION="Bearer un-jwt")
    request.COOKIES["cumbresbi_session"] = "cookie-value"
    headers, cookies = forward_auth_headers(request)
    assert headers == {"Authorization": "Bearer un-jwt"}
    assert cookies == {"cumbresbi_session": "cookie-value"}


def test_empty_when_nothing_present():
    request = rf.get("/")
    headers, cookies = forward_auth_headers(request)
    assert headers == {}
    assert cookies == {}
