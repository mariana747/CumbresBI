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
    "pld",
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

# Fase 0/1: el frontend (Next.js, localhost:3000) llama a este servicio
# directo desde el navegador, sin API Gateway todavia (docs/architecture/
# README.md sec. 8, pendiente). CORS solo para origenes de desarrollo local.
CORS_ALLOW_CREDENTIALS = True  # cookie de sesion de iam-service, ver middleware fallback
CORS_ALLOWED_ORIGINS = env.list(
    "PLD_CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)

# Sube el default de Django (2.5MB) - PldTicketClienteViewSet.subir_documento
# acepta hasta 5 archivos de 2MB c/u (ver pld/views.py, MAX_ARCHIVOS_POR_LOTE/
# MAX_TAMANO_ARCHIVO_MB); el default rechazaba de golpe el multipart COMPLETO
# (suma de todos los archivos, no por archivo) con "RequestDataTooBig" antes
# de que la vista pudiera dar un mensaje explicito - hallazgo 18/Ago/2026, ver
# memoria de sesion "el subir documentos solo acepta uno por uno". Margen
# sobre 5*2MB=10MB para el overhead propio del multipart (boundaries, otros
# campos del form).
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024

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

# PLD_DB_SOCKET_DIR: cuando corre en Cloud Run, la conexion a Cloud SQL NO es
# por IP publica/TCP (Cloud Run no tiene IP fija que autorizar en Cloud SQL,
# la conexion por IP publica se cuelga hasta que Cloud Run corta la request
# con 503 "Service Unavailable"). En su lugar, Cloud Run monta un socket Unix
# en /cloudsql/<INSTANCE_CONNECTION_NAME> cuando adjuntas la conexion Cloud
# SQL al servicio (Cloud Run -> Editar e implementar nueva revision ->
# Conexiones -> Conexiones de Cloud SQL). Configura PLD_DB_SOCKET_DIR con
# esa ruta completa; en local (Docker Compose) se deja vacio y se usa TCP
# normal via PLD_DB_HOST/PLD_DB_PORT como hasta ahora (mismo patron
# que iam-service, ver su config/settings.py).
PLD_DB_SOCKET_DIR = env("PLD_DB_SOCKET_DIR", default=None)

if PLD_DB_SOCKET_DIR:
    _db_host = PLD_DB_SOCKET_DIR
    _db_port = ""
else:
    _db_host = env("PLD_DB_HOST", default="pld-service-db")
    _db_port = env("PLD_DB_PORT", default="3306")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": env("PLD_DB_NAME", default="pld_service"),
        "USER": env("PLD_DB_USER", default="pld_app"),
        "PASSWORD": env("PLD_DB_PASSWORD", default=""),
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

# URL interna de drive-service (docs/architecture/pld-fase2-alcance.md sec.
# 1.4) - pld-service le reenvia el archivo subido en PldContraparteDocViewSet.
# subir(), pasando el JWT del usuario original (no una credencial propia)
# para que el permiso lo siga decidiendo el rol de quien sube, no
# "pld-service puede subir lo que sea". Nombre de servicio de docker-compose,
# resuelto por la red interna de Docker - mismo patron que GATEWAY_ROUTE_*.
DRIVE_SERVICE_URL = env("DRIVE_SERVICE_URL", default="http://drive-service:8080")

# mail-service (envio real de tickets de cliente via Gmail API, ver
# pld/mail_utils.py) y la URL base del frontend para construir el link
# completo del ticket (ej. "https://cumbresbi.mx/pld-ticket/<token>").
MAIL_SERVICE_URL = env("MAIL_SERVICE_URL", default="http://mail-service:8080")
FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:3000")

# audit-service (bitacora central, ver pld/audit_utils.py). Mismo patron que
# document-intelligence-service/docint/audit_utils.py e iam-service/iam/audit_utils.py.
AUDIT_SERVICE_URL = env("AUDIT_SERVICE_URL", default="http://audit-service:8080")

# tesoreria-service (24/Ago/2026, cierre de la reconciliacion contraparte
# maestra - ver docs/CumbresBI_V2_Plan_de_Trabajo_y_Cronograma.md Semana 19).
# PldContraparteKycViewSet.create la usa para validar que el id_contraparte
# que manda el frontend (via ContraparteSelector) exista de verdad en el
# catalogo maestro, antes de guardar el expediente KYC.
TESORERIA_SERVICE_URL = env("TESORERIA_SERVICE_URL", default="http://tesoreria-service:8080")

# iam-service (25/Ago/2026, requerimiento real del cliente: la sociedad se
# elige de un dropdown real, no se escribe a mano) -
# PldContraparteKycViewSet.create la usa para validar que sociedad_rfc
# exista de verdad en el catalogo de sociedades (general_sociedades).
IAM_SERVICE_URL = env("IAM_SERVICE_URL", default="http://iam-service:8080")

# Secreto compartido servicio-a-servicio (docs/architecture/README.md sec.
# 11: "secretos gestionados... secret key de reCAPTCHA"; este es distinto,
# ver mas abajo) - PldTicketClienteViewSet.subir_documento es PUBLICO (sin
# sesion, el cliente externo no trae JWT, ver ticket_utils.py) pero SI
# necesita que drive-service acepte la subida. En vez de fabricar un JWT
# falso, drive-service reconoce este secreto como llamada de confianza
# servicio-a-servicio (ver drive/views.py) - nunca se expone al cliente,
# solo viaja entre contenedores. Vacio en dev por default (drive-service
# hace lo mismo) - en un ambiente real viene de Secret Manager, igual que
# los demas secretos de servicio.
DRIVE_INTERNAL_SECRET = env("DRIVE_INTERNAL_SECRET", default="")

# Mismo patron que DRIVE_INTERNAL_SECRET, pero hacia tesoreria-service
# (02/Sep/2026, cierre real de la reconciliacion contraparte maestra):
# cuando el analista crea un expediente KYC autonomo (Opcion B) sin elegir
# contraparte del catalogo, pld-service crea la contraparte real alla en
# vez de inventar un id local huerfano - ver
# pld/views.py::_crear_contraparte_minima_en_tesoreria. El analista de PLD
# no necesariamente tiene el permiso tesoreria.crear, por eso este secreto
# en vez de reenviar su JWT. Espejo exacto en
# tesoreria-service/config/settings.py::TESORERIA_INTERNAL_SECRET.
TESORERIA_INTERNAL_SECRET = env("TESORERIA_INTERNAL_SECRET", default="")

# Secret key de reCAPTCHA v2 (docs/architecture/README.md sec. 11) - para
# verificar del lado del servidor el token que manda el widget del
# formulario publico (pld-ticket/[token]/page.tsx). Vacio en dev (modo
# simulado: cualquier token se acepta, ver PldTicketClienteViewSet.
# subir_documento) para poder probar sin cuenta real de reCAPTCHA.
RECAPTCHA_SECRET_KEY = env("RECAPTCHA_SECRET_KEY", default="")

# Rate limiting del formulario publico (docs/architecture/pld-fase2-alcance.md
# sec. 2, pregunta abierta #4: "paginas publicas... necesitan limite de
# solicitudes" - mismo patron sugerido para Vivienda en CumbresBI_estado.md).
# Solo aplica al scope "pld-ticket-subir" (ver
# PldTicketClienteViewSet.get_throttles) - por IP, ya que el cliente
# externo no tiene sesion.
REST_FRAMEWORK = {
    "DEFAULT_THROTTLE_RATES": {
        "pld-ticket-subir": "10/hour",
        # PldDocumentoTicketViewSet.subir (04/Sep/2026) - mismo criterio
        # que pld-ticket-subir arriba, ticket de un solo documento.
        "pld-documento-ticket-subir": "10/hour",
    },
}
