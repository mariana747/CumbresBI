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
    "corsheaders",
    "docint",
]

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

# Fase 0: el frontend (Next.js, localhost:3000) llama a este servicio directo
# desde el navegador, sin API Gateway todavia (docs/architecture/README.md
# sec. 8, pendiente). CORS solo para orígenes de desarrollo local.
CORS_ALLOW_CREDENTIALS = True  # cookie de sesion de iam-service, ver middleware fallback
CORS_ALLOWED_ORIGINS = env.list(
    "DOCINT_CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
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

# DOCINT_DB_SOCKET_DIR: cuando corre en Cloud Run, la conexion a Cloud SQL NO es
# por IP publica/TCP (Cloud Run no tiene IP fija que autorizar en Cloud SQL,
# la conexion por IP publica se cuelga hasta que Cloud Run corta la request
# con 503 "Service Unavailable"). En su lugar, Cloud Run monta un socket Unix
# en /cloudsql/<INSTANCE_CONNECTION_NAME> cuando adjuntas la conexion Cloud
# SQL al servicio (Cloud Run -> Editar e implementar nueva revision ->
# Conexiones -> Conexiones de Cloud SQL). Configura DOCINT_DB_SOCKET_DIR con
# esa ruta completa; en local (Docker Compose) se deja vacio y se usa TCP
# normal via DOCINT_DB_HOST/DOCINT_DB_PORT como hasta ahora (mismo patron
# que iam-service, ver su config/settings.py).
DOCINT_DB_SOCKET_DIR = env("DOCINT_DB_SOCKET_DIR", default=None)

if DOCINT_DB_SOCKET_DIR:
    _db_host = DOCINT_DB_SOCKET_DIR
    _db_port = ""
else:
    _db_host = env("DOCINT_DB_HOST", default="document-intelligence-service-db")
    _db_port = env("DOCINT_DB_PORT", default="3306")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("DOCINT_DB_NAME", default="docint_service"),
        "USER": env("DOCINT_DB_USER", default="docint_app"),
        "PASSWORD": env("DOCINT_DB_PASSWORD", default=""),
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

# --- Motor Inteligente de Procesamiento Documental ---
# Plan acordado (ver conversacion de Fase 0): mientras no exista el proyecto
# GCP (Actividad 1, bloqueada), se usa la clave gratuita de AI Studio
# (DOCINT_USE_VERTEX=False) SOLO con documentos ficticios de prueba - nunca
# datos reales de PLD/KYC, porque el tier gratuito de AI Studio puede usar
# los prompts para entrenar modelos de Google. En cuanto exista el proyecto
# GCP, cambiar DOCINT_USE_VERTEX=True (Vertex AI, no usa los datos para
# entrenamiento) antes de procesar cualquier documento real.
DOCINT_USE_VERTEX = env.bool("DOCINT_USE_VERTEX", default=False)
GEMINI_API_KEY = env("GEMINI_API_KEY", default=None)  # solo si DOCINT_USE_VERTEX=False
VERTEX_PROJECT_ID = env("VERTEX_PROJECT_ID", default=None)  # solo si DOCINT_USE_VERTEX=True
VERTEX_LOCATION = env("VERTEX_LOCATION", default="us-central1")

# URL interna de drive-service - docint/drive.py le pide los bytes del
# documento ahi (streaming Drive->Gemini, ver docint/views.py::AnalyzeView).
# Mismo patron que services/pld-service/config/settings.py.
DRIVE_SERVICE_URL = env("DRIVE_SERVICE_URL", default="http://drive-service:8080")

# --- Analisis asincrono con Cloud Tasks (Fase 1: persistencia; ver
# docs/architecture - plan de migracion async del motor documental) ---
# Staging temporal del archivo antes de analizarlo (docint/storage.py).
# "local" en dev/Docker Compose (sin GCP real), "gcs" en Cloud Run.
DOCINT_STAGING_BACKEND = env("DOCINT_STAGING_BACKEND", default="local")
DOCINT_STAGING_BUCKET = env("DOCINT_STAGING_BUCKET", default=None)  # solo si backend=gcs
DOCINT_STAGING_LOCAL_DIR = env("DOCINT_STAGING_LOCAL_DIR", default="/tmp/docint-staging")

# Reintentos de aplicacion dentro de /analyze/<id>/procesar (Fase 2+) -
# separado de los reintentos de transporte que configura la propia cola de
# Cloud Tasks (maxAttempts, fuera de este codigo).
DOCINT_MAX_INTENTOS_ANALISIS = env.int("DOCINT_MAX_INTENTOS_ANALISIS", default=3)

# Fase 2+: integracion real con Cloud Tasks. DOCINT_TASKS_ENABLED=False (dev)
# ejecuta el analisis in-process en vez de encolar de verdad - mismo patron
# que DOCINT_USE_VERTEX para no depender de GCP real en desarrollo local.
DOCINT_TASKS_ENABLED = env.bool("DOCINT_TASKS_ENABLED", default=False)
DOCINT_CLOUD_TASKS_PROJECT = env("DOCINT_CLOUD_TASKS_PROJECT", default=None)
DOCINT_CLOUD_TASKS_LOCATION = env("DOCINT_CLOUD_TASKS_LOCATION", default="us-central1")
DOCINT_CLOUD_TASKS_QUEUE = env("DOCINT_CLOUD_TASKS_QUEUE", default="docint-analysis")
DOCINT_CLOUD_TASKS_SERVICE_ACCOUNT = env("DOCINT_CLOUD_TASKS_SERVICE_ACCOUNT", default=None)
DOCINT_SELF_BASE_URL = env("DOCINT_SELF_BASE_URL", default="http://localhost:8080")
