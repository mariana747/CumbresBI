import logging
from http.cookies import SimpleCookie

import requests
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)

# Headers que nunca se deben copiar tal cual entre proxy y backend/cliente -
# son especificos de la conexion HTTP en turno, no del contenido (RFC 7230
# sec. 6.1, "hop-by-hop"). Copiarlos rompe el proxy (ej. Content-Length
# desincronizado si el body cambia de tamano al pasar por aqui, aunque aqui
# no cambia; Connection/Transfer-Encoding son responsabilidad de cada salto,
# no del mensaje).
_HOP_BY_HOP_REQUEST = {"host", "content-length"}
_HOP_BY_HOP_RESPONSE = {"content-encoding", "transfer-encoding", "connection", "content-length"}
_TIMEOUT_SEGUNDOS = 20
# docint/analyze llama a Gemini API + streaming de Drive (docint/drive.py) -
# puede tardar mas que el resto de los endpoints del sistema, sobre todo con
# varios archivos o PDFs grandes. Detectado 17/Ago/2026: "El servicio no
# respondio" (DOCINT-502) por ReadTimeout a los 20s con el timeout generico,
# aunque docint seguia procesando de fondo. Los demas servicios se quedan en
# el default - no hay motivo para darles mas margen todavia.
_TIMEOUT_SEGUNDOS_POR_PREFIJO = {"docint": 90}


@csrf_exempt
def proxy(request, path):
    """Unico punto de entrada del frontend (docs/architecture/README.md sec.
    8) - reenvia cada request al microservicio real segun el primer
    segmento del path (ej. /iam/api/users/ -> iam-service:/api/users/).

    Traduccion cookie -> header: el JWT de sesion viaja en la cookie
    HttpOnly que puso iam-service (el frontend no puede leerla con JS a
    proposito). Aqui, que si corre en el servidor, se lee esa cookie y se
    reenvia como Authorization: Bearer - el mecanismo "de produccion" que
    cumbresbi_scope espera en primer lugar (el fallback de cookie directo en
    cada servicio, ver libs/cumbresbi-scope, sigue existiendo como segunda
    capa, no se quita).
    """
    prefix, _, rest = path.partition("/")
    base_url = settings.SERVICE_ROUTES.get(prefix)
    if not base_url:
        return JsonResponse(
            {"detail": f"Ruta no reconocida por el Gateway: '/{prefix}'."}, status=404
        )

    target_url = f"{base_url}/{rest}"
    query_string = request.META.get("QUERY_STRING")
    if query_string:
        target_url += f"?{query_string}"

    headers = {
        key[5:].replace("_", "-"): value
        for key, value in request.META.items()
        if key.startswith("HTTP_") and key[5:].replace("_", "-").lower() not in _HOP_BY_HOP_REQUEST
    }
    if request.META.get("CONTENT_TYPE"):
        headers["Content-Type"] = request.META["CONTENT_TYPE"]

    session_token = request.COOKIES.get(settings.SESSION_COOKIE_NAME_JWT)
    if session_token and "Authorization" not in headers:
        headers["Authorization"] = f"Bearer {session_token}"

    try:
        upstream = requests.request(
            method=request.method,
            url=target_url,
            headers=headers,
            data=request.body,
            cookies=request.COOKIES,
            allow_redirects=False,
            timeout=_TIMEOUT_SEGUNDOS_POR_PREFIJO.get(prefix, _TIMEOUT_SEGUNDOS),
        )
    except requests.RequestException:
        logger.warning("No se pudo alcanzar el servicio '%s' en %s", prefix, target_url, exc_info=True)
        return JsonResponse({"detail": "El servicio no respondio. Intenta de nuevo."}, status=502)

    response = HttpResponse(upstream.content, status=upstream.status_code)
    for key, value in upstream.headers.items():
        key_lower = key.lower()
        # Access-Control-*: las pone el CorsMiddleware del Gateway mismo
        # (settings.CORS_ALLOWED_ORIGINS) para la respuesta que de verdad ve
        # el navegador - copiar tambien las del microservicio interno
        # duplicaria el header y el navegador rechaza la respuesta.
        if key_lower in _HOP_BY_HOP_RESPONSE or key_lower == "set-cookie" or key_lower.startswith("access-control-"):
            continue
        response[key] = value

    # Set-Cookie no se puede copiar via response[key]=value (sobreescribe en
    # vez de acumular) - resp.headers de "requests" tambien uniria varios
    # Set-Cookie con comas y los rompe. Se reconstruye cada cookie por
    # separado en response.cookies (SimpleCookie), que Django SI serializa
    # como multiples headers Set-Cookie reales.
    for raw_cookie in upstream.raw.headers.getlist("Set-Cookie"):
        parsed = SimpleCookie()
        parsed.load(raw_cookie)
        for morsel in parsed.values():
            try:
                max_age = int(morsel["max-age"]) if morsel["max-age"] else None
            except ValueError:
                max_age = None
            response.set_cookie(
                key=morsel.key,
                value=morsel.value,
                max_age=max_age,
                expires=morsel["expires"] or None,
                path=morsel["path"] or "/",
                domain=morsel["domain"] or None,
                secure=bool(morsel["secure"]),
                httponly=bool(morsel["httponly"]),
                samesite=morsel["samesite"] or None,
            )

    return response
