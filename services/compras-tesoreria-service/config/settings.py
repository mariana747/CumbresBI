from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-only-insecure-key")
DEBUG = env.bool("DJANGO_DEBUG", default=True)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "compras_tesoreria",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "cumbresbi_scope.EffectiveScopeMiddleware",
]

# Llave publica RS256 (docs/architecture/README.md sec. 8) - publica del
# par de DESARROLLO ya usado por iam-service (JWT_PRIVATE_KEY). NUNCA usar
# este default fuera de dev; en un ambiente real viene de Secret Manager.
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

# COMPRAS_TESORERIA_DB_SOCKET_DIR: cuando corre en Cloud Run, la conexion a Cloud SQL NO es
# por IP publica/TCP (Cloud Run no tiene IP fija que autorizar en Cloud SQL,
# la conexion por IP publica se cuelga hasta que Cloud Run corta la request
# con 503 "Service Unavailable"). En su lugar, Cloud Run monta un socket Unix
# en /cloudsql/<INSTANCE_CONNECTION_NAME> cuando adjuntas la conexion Cloud
# SQL al servicio (Cloud Run -> Editar e implementar nueva revision ->
# Conexiones -> Conexiones de Cloud SQL). Configura COMPRAS_TESORERIA_DB_SOCKET_DIR con
# esa ruta completa; en local (Docker Compose) se deja vacio y se usa TCP
# normal via COMPRAS_TESORERIA_DB_HOST/COMPRAS_TESORERIA_DB_PORT como hasta ahora (mismo patron
# que iam-service, ver su config/settings.py).
COMPRAS_TESORERIA_DB_SOCKET_DIR = env("COMPRAS_TESORERIA_DB_SOCKET_DIR", default=None)

if COMPRAS_TESORERIA_DB_SOCKET_DIR:
    _db_host = COMPRAS_TESORERIA_DB_SOCKET_DIR
    _db_port = ""
else:
    _db_host = env("COMPRAS_TESORERIA_DB_HOST", default="compras-tesoreria-service-db")
    _db_port = env("COMPRAS_TESORERIA_DB_PORT", default="3306")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("COMPRAS_TESORERIA_DB_NAME", default="compras_tesoreria_service"),
        "USER": env("COMPRAS_TESORERIA_DB_USER", default="compras_tesoreria_app"),
        "PASSWORD": env("COMPRAS_TESORERIA_DB_PASSWORD", default=""),
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
