import socket
from pathlib import Path

import environ

# 07/Sep/2026 - mismo hallazgo que drive-service/config/settings.py: este
# entorno resuelve los dominios de Google a una direccion IPv6 sin ruta
# valida ademas de la IPv4 que si funciona, y httplib2 (google-auth/
# googleapiclient, usado aqui para la Gmail API) no cae solo a IPv4 como
# si lo hace un socket normal. Forzar IPv4 primero evita el "Network is
# unreachable" intermitente al pedir el token OAuth o al enviar el correo.
_getaddrinfo_original = socket.getaddrinfo


def _getaddrinfo_ipv4_primero(host, port, family=0, type=0, proto=0, flags=0):
    resultados = _getaddrinfo_original(host, port, family, type, proto, flags)
    ipv4 = [r for r in resultados if r[0] == socket.AF_INET]
    return ipv4 or resultados


socket.getaddrinfo = _getaddrinfo_ipv4_primero

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DJANGO_DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-only-insecure-key")
DEBUG = env.bool("DJANGO_DEBUG", default=True)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

# Servicio dedicado a enviar correo real (Magic Links, tickets de cliente
# PLD, y a futuro cualquier otro flujo que necesite avisar por correo) -
# mismo criterio que drive-service: un solo lugar con la credencial real,
# sin base de datos propia (proxy stateless hacia Gmail API).
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "mail",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "cumbresbi_scope.EffectiveScopeMiddleware",
]

# Llave publica RS256 de DESARROLLO (mismo par que el resto de los
# servicios, ver iam-service/config/settings.py JWT_PRIVATE_KEY) - en un
# ambiente real viene de Secret Manager.
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

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = env.list(
    "MAIL_CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Sin base de datos - proxy stateless hacia Gmail API, mismo criterio que
# drive-service (ver su config/settings.py).
DATABASES = {}

REST_FRAMEWORK = {
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
}

# 07/Sep/2026: /api/send/ ahora acepta adjuntos (ver gmailclient.send_email),
# codificados en base64 dentro del mismo JSON - el default de Django
# (2.5MB) tronaria con cualquier PDF/XML real. tesoreria-service limita
# cada adjunto a 15MB antes de descargarlo (ver
# mail_utils._TAMANO_MAXIMO_ADJUNTO_BYTES); 30MB aqui deja margen para
# PDF+XML juntos ya codificados en base64 (~33% mas grande que el binario).
DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024

# Credencial de la cuenta de servicio de Gmail (domain-wide delegation,
# mismo patron que DRIVE_SERVICE_ACCOUNT_JSON en drive-service/config/
# settings.py) - JSON completo como string. Vacio (default) => gmailclient.py
# cae en modo simulado (solo registra el correo en el log, no lo manda de
# verdad) para poder desarrollar/probar sin la cuenta real todavia.
GMAIL_SERVICE_ACCOUNT_JSON = env("GMAIL_SERVICE_ACCOUNT_JSON", default="")

# Correo del Workspace de Cumbres a impersonar via domain-wide delegation Y
# remitente real de los correos (ej. "notificaciones@cypcumbres.mx") - una
# cuenta de servicio no tiene bandeja propia, actua "como si fuera" este
# usuario para poder enviar desde su direccion real.
GMAIL_SENDER_SUBJECT = env("GMAIL_SENDER_SUBJECT", default="")

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "es-mx"
TIME_ZONE = "America/Mexico_City"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
