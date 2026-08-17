from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-only-insecure-key")
DEBUG = env.bool("DJANGO_DEBUG", default=True)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

# URL interna de audit-service (nombre de servicio de docker-compose en
# dev; en Cloud Run seria la URL real del servicio) - usada para el
# registro sincrono interino de eventos de auditoria (ver
# iam/audit_utils.py) mientras no exista Pub/Sub real.
AUDIT_SERVICE_URL = env("AUDIT_SERVICE_URL", default="http://audit-service:8080")

# mail-service (envio real de Magic Links via Gmail API, ver
# iam/mail_utils.py) y la URL base del frontend para construir el link
# completo que se manda por correo (ej. "https://cumbresbi.mx/magic-link/<token>").
MAIL_SERVICE_URL = env("MAIL_SERVICE_URL", default="http://mail-service:8080")
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:3000")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "iam",
]

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "CumbresBI - iam-service",
    "DESCRIPTION": "Identidad, roles, permisos y calculo del alcance efectivo (RLS).",
    "VERSION": "0.1.0",
}

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "cumbresbi_scope.EffectiveScopeMiddleware",
]

# Clave publica RS256 para validar el JWT de alcance (docs/architecture/
# README.md sec. 8) - es la publica de JWT_PRIVATE_KEY (ver mas abajo), con
# la que iam-service ya firma tanto sus propios JWT de sesion (auth_views.py)
# como los de Magic Link. El default es la publica del par de DESARROLLO -
# NUNCA usarlo fuera de dev; en cualquier ambiente real, esta variable debe
# venir de Secret Manager con la publica que corresponda a la privada real.
CUMBRESBI_SCOPE_JWT_PUBLIC_KEY = env(
    "CUMBRESBI_SCOPE_JWT_PUBLIC_KEY",
    default="""-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuANSmqBa2csu48OmC2k9
k/gtsVZynSl/M76fsdkGwL7nVMh5egK/YYIZO3cYWOMuNcWNchkxDQ2OjgTKNgGw
zIcEgyy+GDW0CFlqSdGRWjnCQSbuxGQW5Qca5w7SJT75h+fQjNGicGP62gLo1k+v
FtnNGk5bcPxEFhQtSuya2/re1kvIGMnUVk/1/1ytbaN5pl3xaghaNfVY6XSbKULo
Gg06Cc6r+DO24tf7yc0ZiavjWAWvzdzEdtpc1Yr9f7zQdVB+2Ze0wJFaMLedK0Ar
Pzzk6e7rDpCf91ZLB3wY5DMYtLmnfkrV7vovWjKRMOR0aAcbI4MbiG+Cot/YNptN
fwIDAQAB
-----END PUBLIC KEY-----""",
)

# Llave privada RS256 para firmar los JWT de alcance externo emitidos al
# validar un Magic Link (Fase 1, Semana 4; ver iam/magic_link_utils.py). El
# default es un par de llaves de DESARROLLO generado solo para no bloquear
# el trabajo local mientras Secret Manager no tenga la llave real (ver
# tarea pendiente con Arturo) - NUNCA usar este default fuera de dev. La
# llave publica correspondiente se distribuye a los servicios consumidores
# como CUMBRESBI_SCOPE_JWT_PUBLIC_KEY cuando corresponda.
_DEV_JWT_PRIVATE_KEY = """-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC4A1KaoFrZyy7j
w6YLaT2T+C2xVnKdKX8zvp+x2QbAvudUyHl6Ar9hghk7dxhY4y41xY1yGTENDY6O
BMo2AbDMhwSDLL4YNbQIWWpJ0ZFaOcJBJu7EZBblBxrnDtIlPvmH59CM0aJwY/ra
AujWT68W2c0aTltw/EQWFC1K7Jrb+t7WS8gYydRWT/X/XK1to3mmXfFqCFo19Vjp
dJspQugaDToJzqv4M7bi1/vJzRmJq+NYBa/N3MR22lzViv1/vNB1UH7Zl7TAkVow
t50rQCs/POTp7usOkJ/3VksHfBjkMxi0uad+StXu+i9aMpEw5HRoBxsjgxuIb4Ki
39g2m01/AgMBAAECgf9GrlVhujaAxzWQ8esrIZba6iP4T5G2zI8Ppn5bfKwbXTjT
rYL7sBJ9tyX6BsT+CkVgYixH/LqFSQUjiAjOtdeIuFQDZCxLIFWxifxJs+B2cmPV
+B5pUV4kmutlKqGNrPgsO97fjaaCL+UrLfLsXwSMwnGwqRMhUxopYOwE24f1oWpM
GrtB1e5xqgvMG3Di3Zld6UCDJbgg/bZjCP9GYbUWd7ZNFzlt9rwNwjvns+EFOm9j
Gcrh2AJYrYQTokiGXcXj+EBEpCwBMxIUZBVEgleBxqQxbLjY6eYgQqYL7ShUb73q
wim0zIV7Hii0MRB82xAumjRdicqdqIyq+olaizkCgYEA8THcVWBSN8Q9sNqxjUS5
GxGVhlEQSSEzK54vIac8y3CnMAuK3Ix3/oBkls+QthUbITbEdGGQCrdpO7MqfxCz
3y8H1TywLz6hGHuKMaOyCM+rruwObpQKE9tzIRBcOqtvU2wW3EHiggPYs7vOWMCO
egy6Ywh/N82soHROAj1oAksCgYEAw07n/zrlVK7kvJC+dvTq13evYHMMSoEek5P0
ozkCr9UzXCsJKuutaIBoO1Sm0mLuKYf+z9xTFT04Npm+JYFNlzkRn3KpoVS2yTmd
z1jjU9u8NvCwHFAVhsyA0mL4SSlVX7Lwr/4GirqbC0T2nRH0N981JmZQtxIa9+Uq
51T6QR0CgYEA2gJMeqsehaOOc12pINyeR9ZEBe0dwEwO+Xz4cv272NMRez7jm+gn
ydV5lks1LS+0nvfm6J8K2HTh3IFchw+s1a2n8djyEzIT4JJB3g5tLMOxFeHuRYrv
9PTlglxMUQeGD6ximWG//+7EH+lAYT5jSfRZQIx8mQ8B2uJlZGbmrTMCgYAPI5ao
GhCct9HTLAUXg3SQrx5RA5n4THnqRpW38TtcFdKdWlijkxEmAI4Ty0QDGtgLMBd4
VUO7abtpwBEVJyi0iB/tlB3B+6cPgf/RirpUTbwRJicAitSgVknGBRXp1eJgQKaX
fcFUD5LlFLtpAXNEwXCFQXkQN78PaBwjQlsDoQKBgQCj2mKaQ1ubiGLGf1H3c3VQ
mSGUTD5E6RibA3XpBDecxSAEU4k8wieWtE+e201/7RnNpJIci9NmgU91euDdT/VX
1/ehFeMGSuHDq0fvCfI50tIJ+agwFuotfQwHdas7GkybgfFjvT4T1zcBmQICSkk7
KIYLz1XLfh9TeCisjfT5wQ==
-----END PRIVATE KEY-----"""

JWT_PRIVATE_KEY = env("JWT_PRIVATE_KEY", default=_DEV_JWT_PRIVATE_KEY)

# --- Login OIDC real (Google Workspace) - Fase 1, Semana 4 ---
# docs/architecture/README.md sec. 6.1. Client ID/Secret ya existen en
# Secret Manager (docs/architecture/infraestructura-gcp/oidc-login.md);
# en dev local se leen de .env (cliente OAuth "iam-service-oidc" con las
# URIs de localhost). SSO silencioso (sin boton "Iniciar sesion con
# Google", decision de producto confirmada) = responsabilidad del
# frontend, que redirige directo a OIDC_START_PATH sin pantalla propia.
OIDC_CLIENT_ID = env("OIDC_CLIENT_ID", default="")
OIDC_CLIENT_SECRET = env("OIDC_CLIENT_SECRET", default="")
OIDC_REDIRECT_URI = env("OIDC_REDIRECT_URI", default="http://localhost:8000/auth/google/callback")
# Dominios de Workspace aprobados (claim "hd" del id_token) - unico
# dominio confirmado hoy es el de Cumbres; agregar aqui los demas cuando
# se confirmen (ver memoria de sesion "login-y-drive-cuenta-workspace-cumbres").
OIDC_APPROVED_DOMAINS = env.list("OIDC_APPROVED_DOMAINS", default=["cypcumbres.mx"])
# A donde redirige el navegador tras un login exitoso (el frontend lee la
# cookie de sesion ahi y sigue su flujo normal de AuthProvider).
OIDC_FRONTEND_SUCCESS_URL = env("OIDC_FRONTEND_SUCCESS_URL", default="http://localhost:3000/")
OIDC_FRONTEND_ERROR_URL = env("OIDC_FRONTEND_ERROR_URL", default="http://localhost:3000/login?error=oidc")

# Cookie de sesion real (JWT RS256 propio, firmado con JWT_PRIVATE_KEY) -
# reemplaza a la sesion simulada de localStorage (src/lib/auth.ts,
# frontend) una vez que este flujo este probado de punta a punta.
SESSION_COOKIE_NAME_JWT = "cumbresbi_session"
SESSION_JWT_TTL_MINUTES = 15  # mismo TTL documentado en README.md sec. 6.1

# Cookie temporal (PKCE code_verifier + state) entre /auth/google/start y
# /auth/google/callback - firmada con django.core.signing (usa SECRET_KEY),
# nunca en la sesion ni en la URL. TTL corto: solo dura el redirect a Google
# y de vuelta.
OIDC_PKCE_COOKIE_NAME = "oidc_pkce"
OIDC_PKCE_MAX_AGE_SECONDS = 300

# Fase 0: el frontend (Next.js, localhost:3000) llama a este servicio directo
# desde el navegador, sin API Gateway todavia (docs/architecture/README.md
# sec. 8, pendiente). CORS solo para orígenes de desarrollo local.
CORS_ALLOWED_ORIGINS = env.list(
    "IAM_CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)
# La sesion real (cookie HttpOnly de auth_views.py) viaja en fetch() con
# credentials:"include" desde el frontend (otro origen) - sin esto el
# navegador nunca manda ni acepta la cookie entre localhost:3000 y :8000.
CORS_ALLOW_CREDENTIALS = True

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# IAM_DB_SOCKET_DIR: cuando corre en Cloud Run, la conexion a Cloud SQL NO es
# por IP publica/TCP (Cloud Run no tiene IP fija que autorizar en Cloud SQL,
# la conexion por IP publica se cuelga hasta que Cloud Run corta la request
# con 503 "Service Unavailable"). En su lugar, Cloud Run monta un socket Unix
# en /cloudsql/<INSTANCE_CONNECTION_NAME> cuando adjuntas la conexion Cloud
# SQL al servicio (Cloud Run -> Editar e implementar nueva revision ->
# Conexiones -> Conexiones de Cloud SQL). Configura IAM_DB_SOCKET_DIR con esa
# ruta completa; en local (Docker Compose) se deja vacio y se usa TCP normal
# via IAM_DB_HOST/IAM_DB_PORT como hasta ahora.
IAM_DB_SOCKET_DIR = env("IAM_DB_SOCKET_DIR", default=None)

if IAM_DB_SOCKET_DIR:
    _db_host = IAM_DB_SOCKET_DIR
    _db_port = ""
else:
    _db_host = env("IAM_DB_HOST", default="iam-db")
    _db_port = env("IAM_DB_PORT", default="3306")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("IAM_DB_NAME", default="iam_service"),
        "USER": env("IAM_DB_USER", default="iam_app"),
        "PASSWORD": env("IAM_DB_PASSWORD", default=""),
        "HOST": _db_host,
        "PORT": _db_port,
        "OPTIONS": {"charset": "utf8mb4"},
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "es-mx"
TIME_ZONE = "America/Mexico_City"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
