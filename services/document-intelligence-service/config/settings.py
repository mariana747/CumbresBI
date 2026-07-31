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
    "docint",
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

CUMBRESBI_SCOPE_JWT_PUBLIC_KEY = env("CUMBRESBI_SCOPE_JWT_PUBLIC_KEY", default=None)

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

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("DOCINT_DB_NAME", default="docint_service"),
        "USER": env("DOCINT_DB_USER", default="docint_app"),
        "PASSWORD": env("DOCINT_DB_PASSWORD", default=""),
        "HOST": env("DOCINT_DB_HOST", default="document-intelligence-service-db"),
        "PORT": env("DOCINT_DB_PORT", default="3306"),
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
