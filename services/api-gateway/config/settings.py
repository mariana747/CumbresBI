from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-only-insecure-key")
DEBUG = env.bool("DJANGO_DEBUG", default=True)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

# Gateway local de desarrollo (docs/architecture/README.md sec. 8) -
# reemplaza a Cloud Endpoints ESPv2 mientras no exista Cloud Run real. Es el
# UNICO servicio que el frontend llama directo; todo lo demas pasa por aqui
# (ver gateway/views.py). Sin base de datos propia - no tiene modelos, solo
# reenvia requests, asi que no hace falta MySQL ni migraciones.
INSTALLED_APPS = [
    "corsheaders",
    "gateway",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

# APPEND_SLASH interferiria con el catch-all de urls.py (redirigiria antes de
# que el proxy vea la request) - el path se reenvia tal cual llega.
APPEND_SLASH = False

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Sin base de datos - el Gateway no tiene modelos propios.
DATABASES = {}

# El frontend (Next.js, localhost:3000) es el unico origen que llama al
# Gateway directo desde el navegador. CORS_ALLOW_CREDENTIALS=True porque la
# cookie de sesion (cumbresbi_session, puesta por iam-service via el Gateway)
# viaja en cada fetch con credentials:"include".
CORS_ALLOWED_ORIGINS = env.list(
    "GATEWAY_CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)
CORS_ALLOW_CREDENTIALS = True

# Nombre de la cookie de sesion real (ver services/iam-service/iam/
# auth_views.py, SESSION_COOKIE_NAME_JWT) - el Gateway la traduce a
# Authorization: Bearer antes de reenviar, que es la forma "de produccion"
# documentada (README.md sec. 8) de propagar el alcance. cumbresbi_scope en
# cada servicio tambien sabe leer la cookie directo como respaldo (ver
# libs/cumbresbi-scope/cumbresbi_scope/middleware.py) - dos capas, no una
# depende de la otra.
SESSION_COOKIE_NAME_JWT = "cumbresbi_session"

# Tabla de ruteo: prefijo de la URL que ve el navegador -> URL base interna
# del microservicio (nombre de servicio de docker-compose, resuelto por la
# red interna de Docker). En Cloud Run, esta tabla se reemplaza por la
# configuracion de Cloud Endpoints ESPv2 (openapi.yaml por servicio) - el
# contrato que ve el frontend (GATEWAY_URL + prefijo) no cambia.
SERVICE_ROUTES = {
    "iam": env("GATEWAY_ROUTE_IAM", default="http://iam-service:8080"),
    "pld": env("GATEWAY_ROUTE_PLD", default="http://pld-service:8002"),
    "audit": env("GATEWAY_ROUTE_AUDIT", default="http://audit-service:8001"),
    "docint": env("GATEWAY_ROUTE_DOCINT", default="http://document-intelligence-service:8006"),
    "vivienda": env("GATEWAY_ROUTE_VIVIENDA", default="http://vivienda-service:8003"),
    "compras-tesoreria": env("GATEWAY_ROUTE_COMPRAS_TESORERIA", default="http://compras-tesoreria-service:8004"),
    "rrhh": env("GATEWAY_ROUTE_RRHH", default="http://rrhh-service:8005"),
    "tesoreria": env("GATEWAY_ROUTE_TESORERIA", default="http://tesoreria-service:8007"),
    "rentas": env("GATEWAY_ROUTE_RENTAS", default="http://rentas-service:8008"),
}
