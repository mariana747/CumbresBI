import hashlib
import secrets
from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone

# TTL del JWT emitido tras validar un magic link - corto a proposito (ver
# docs/architecture/README.md sec. 6.2: "TTL corto (~15 min) para limitar el
# dano de una revocacion tardia"). No confundir con expires_at del magic
# link en si (30 minutos por defecto, ver views.py - decision de cliente
# 2026-08-07, antes era 7 dias) - eso es cuanto tiempo el
# link es utilizable, esto es cuanto dura la sesion externa una vez que ya
# se uso.
EXTERNAL_JWT_TTL_MINUTES = 15


def generate_token() -> tuple[str, str]:
    """Genera un token aleatorio criptografico y su hash SHA-256.

    Regresa (token_en_claro, token_hash). El token en claro es lo unico que
    viaja en el link (por correo, o en la respuesta en modo dev) - nunca se
    guarda en la base de datos, solo su hash (ver IamMagicLink.token_hash)."""
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_external_jwt(magic_link) -> str:
    """Firma un JWT de alcance externo limitado (RS256) tras validar un
    magic link. Alcance minimo a proposito: sin is_global, sin
    sociedad/proyecto/centro/contrato - el modulo consumidor decide que
    hacer con recurso_tipo/recurso_id, este JWT solo prueba "este correo
    fue verificado via magic link para este recurso".

    JWT_PRIVATE_KEY tiene un default de desarrollo (ver settings.py) -
    unicamente para no bloquear el trabajo local mientras no exista la
    llave real en Secret Manager (ver docs/tareas-arturo si aplica);
    reemplazar via variable de entorno en cualquier ambiente real.
    """
    now = timezone.now()
    claims = {
        "sub": magic_link.email,
        "magic_link_id": magic_link.magic_link_id,
        "recurso_tipo": magic_link.recurso_tipo,
        "recurso_id": magic_link.recurso_id,
        "is_global": False,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=EXTERNAL_JWT_TTL_MINUTES)).timestamp()),
    }
    return jwt.encode(claims, settings.JWT_PRIVATE_KEY, algorithm="RS256")
