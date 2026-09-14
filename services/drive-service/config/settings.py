import socket
from pathlib import Path

import environ

# 07/Sep/2026 (hallazgo real, no era un blip de red): este entorno resuelve
# oauth2.googleapis.com/googleapis.com a una direccion IPv6 sin ruta valida
# ("Network is unreachable") ademas de la IPv4 que si funciona - un socket
# normal cae solo a IPv4 al fallar IPv6, pero httplib2 (que usa
# google-auth/googleapiclient para pedir el token OAuth y hablar con la API
# de Drive) no reintenta con la siguiente direccion, se queda atorado en la
# primera que le dio getaddrinfo. Forzar IPv4 primero aqui evita que
# cualquier llamada real a Drive falle intermitentemente segun el orden en
# que el DNS haya regresado las direcciones ese momento.
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

# Servicio dedicado a Google Drive (docs/architecture/pld-fase2-alcance.md
# sec. 1.2-1.3, decision 11/Ago/2026: Drive es transversal - PLD, contratos
# de Tesoreria y subida/descarga de Excels lo van a usar, no solo PLD - y
# NO debe depender de document-intelligence-service (Gemini). Sin base de
# datos propia - es un proxy stateless hacia la API de Drive, mismo
# criterio que api-gateway.
INSTALLED_APPS = [
    # contenttypes/auth: no se usan de verdad (sin BD, sin login de sesion
    # propio) pero DRF los necesita para resolver AnonymousUser al
    # autenticar cada request - sin ellos, "RuntimeError: Model class
    # django.contrib.contenttypes.models.ContentType doesn't declare..."
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "drive",
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
    "DRIVE_CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Sin base de datos - ver comentario de arriba.
DATABASES = {}

REST_FRAMEWORK = {
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.JSONParser",
    ],
}

# Credencial de la cuenta de servicio de Drive (domain-wide delegation,
# ver pld-fase2-alcance.md sec. 1.4) - JSON completo como string, mismo
# patron que DOCINT_DB_PASSWORD/AUDIT_DB_PASSWORD en Secret Manager. Sin
# valor (default vacio) => driveclient.py cae en modo simulado (ver ese
# archivo) para poder desarrollar/probar sin la cuenta real todavia.
DRIVE_SERVICE_ACCOUNT_JSON = env("DRIVE_SERVICE_ACCOUNT_JSON", default="")

# Correo del Workspace de Cumbres a impersonar via domain-wide delegation
# (una cuenta de servicio no tiene Drive propio - actua "como si fuera"
# este usuario, que debe ser dueno/tener acceso a la carpeta CumbresBI/).
DRIVE_IMPERSONATE_SUBJECT = env("DRIVE_IMPERSONATE_SUBJECT", default="")

# Secreto compartido servicio-a-servicio (ver services/pld-service/config/
# settings.py, mismo comentario del otro lado): PldTicketClienteViewSet.
# subir_documento es un endpoint PUBLICO (formulario externo sin sesion,
# sin JWT que reenviar) - cuando una llamada a este servicio trae este
# secreto en el header X-Internal-Secret (en vez de un JWT de usuario en
# Authorization), se confia en que ya viene de otro microservicio interno
# que ya validó lo que tenia que validar (token del cliente + reCAPTCHA) y
# se le deja pasar sin exigir perm_key. Vacio en dev por default (nadie
# puede usar este bypass hasta configurarlo explicitamente en ambos lados).
DRIVE_INTERNAL_SECRET = env("DRIVE_INTERNAL_SECRET", default="")

# ID de la carpeta raiz "CumbresBI/" en Drive (se resuelve una vez y se
# fija aqui - ver pld-fase2-alcance.md sec. 1.3 y memoria de sesion
# "drive-estructura-carpetas-grupos": estructura de carpetas por modulo,
# CumbresBI/RRHH/, CumbresBI/Vivienda/, CumbresBI/Compras/,
# CumbresBI/Tesoreria/ - decision 12/Ago/2026 reemplazo la mencion original
# a Contratos/Excels). Sigue siendo el fallback para los modulos que NO
# tienen todavia su propia Unidad compartida (ver DRIVE_MODULE_FOLDER_IDS).
DRIVE_ROOT_FOLDER_ID = env("DRIVE_ROOT_FOLDER_ID", default="")

# Mapeo modulo -> ID de su propia Unidad compartida, para modulos migrados
# de "CumbresBI/<modulo>/" a una Unidad compartida independiente (decision
# 14/Ago/2026, memoria "drive-grupos-automatizacion-permisos": permite dar
# de alta un grupo de Google como miembro de la Unidad compartida completa
# -y que le aparezca en "Unidades compartidas"- en vez de depender del
# toggle fragil de "restringir acceso" por subcarpeta. PLD es el primer
# modulo migrado; los que no aparecen aqui siguen resolviendose como
# subcarpeta de DRIVE_ROOT_FOLDER_ID (comportamiento viejo, ver
# ensure_folder_path en driveclient.py).
DRIVE_MODULE_FOLDER_IDS = env.json("DRIVE_MODULE_FOLDER_IDS", default={})
