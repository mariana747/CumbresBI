from datetime import timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from django.conf import settings
from django.utils import timezone

from .scope_utils import compute_effective_scope_claims


def _public_key_pem() -> bytes:
    """Deriva la llave publica de JWT_PRIVATE_KEY en runtime - iam-service
    es tanto el firmante como el unico verificador de esta cookie (los
    demas servicios validan el JWT de alcance real via
    CUMBRESBI_SCOPE_JWT_PUBLIC_KEY, que se distribuye aparte una vez que
    exista esa llave en Secret Manager - ver settings.py). No hace falta
    guardar la publica por separado solo para este caso de uso interno."""
    private_key = serialization.load_pem_private_key(settings.JWT_PRIVATE_KEY.encode(), password=None)
    return private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def issue_session_jwt(user) -> str:
    """Firma el JWT de sesion (RS256) que se guarda en la cookie HttpOnly.
    Lleva los mismos claims de EffectiveScope que consume cumbresbi-scope
    (docs/architecture/README.md sec. 8) mas 'sub'/'email' para /api/me -
    es el mismo token que, en produccion, tambien se reenvia como
    Authorization: Bearer hacia el resto de los servicios."""
    now = timezone.now()
    claims = {
        "sub": user.user_id,
        "email": user.primary_email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.SESSION_JWT_TTL_MINUTES)).timestamp()),
        **compute_effective_scope_claims(user),
    }
    return jwt.encode(claims, settings.JWT_PRIVATE_KEY, algorithm="RS256")


def decode_session_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, _public_key_pem(), algorithms=["RS256"])
    except jwt.PyJWTError:
        return None
