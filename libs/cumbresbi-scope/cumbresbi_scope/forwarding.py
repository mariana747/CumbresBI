"""Reenvio de la identidad del usuario original hacia otro microservicio
(patron service-to-service usado por PldContraparteDocViewSet.subir hacia
drive-service, BitacoraAuditoriaViewSet.export_csv hacia drive-service, y
los mail_utils.py de iam-service/pld-service hacia mail-service): un
servicio A reenvia el JWT/cookie de sesion del request original a un
servicio B, para que el permiso exacto lo siga decidiendo B segun el rol
de quien hizo la peticion original, no una credencial propia de A.

Antes esto se repetia copiado en cada llamador - un solo lugar evita que
se desincronicen (ej. si cambia el nombre de la cookie de sesion).
"""

from django.conf import settings


def forward_auth_headers(request) -> tuple[dict, dict]:
    """Regresa (headers, cookies) listos para pasarle a requests.post/get -
    el Authorization header y la cookie de sesion del `request` original,
    si vienen."""
    headers = {}
    auth_header = request.META.get("HTTP_AUTHORIZATION")
    if auth_header:
        headers["Authorization"] = auth_header

    cookie_name = getattr(settings, "CUMBRESBI_SCOPE_SESSION_COOKIE_NAME", "cumbresbi_session")
    cookies = {}
    if request.COOKIES.get(cookie_name):
        cookies[cookie_name] = request.COOKIES[cookie_name]

    return headers, cookies
