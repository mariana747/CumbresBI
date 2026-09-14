import hashlib
import secrets

# Mismo mecanismo que iam-service (ver iam/magic_link_utils.py): el token en
# claro nunca se guarda, solo su hash SHA-256 (PldTicketCliente.token_hash).
# pld-service solo tiene la llave publica de cumbresbi_scope (ver
# config/settings.py), no una privada - no puede emitir JWTs propios, asi que
# a diferencia de iam-service este ticket no emite sesion externa: "validar"
# regresa los datos del ticket/expediente directamente.


def generate_token() -> tuple[str, str]:
    """Genera un token aleatorio criptografico y su hash SHA-256.

    Regresa (token_en_claro, token_hash). El token en claro es lo unico que
    viaja en el link (por correo, o en la respuesta en modo dev) - nunca se
    guarda en la base de datos, solo su hash."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
