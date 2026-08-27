import hashlib
import secrets

# Mismo mecanismo que pld-service/pld/ticket_utils.py (27/Ago/2026, ticket
# publico de proveedores) e iam-service/iam/magic_link_utils.py: el token
# en claro nunca se guarda, solo su hash SHA-256 (TesoreriaTicketProveedor.
# token_hash). tesoreria-service tampoco tiene llave privada para emitir
# JWTs propios (solo verifica el de cumbresbi_scope, ver config/
# settings.py) - este ticket no emite sesion externa, "validar" regresa el
# ticket/contraparte directamente.


def generate_token() -> tuple[str, str]:
    """Genera un token aleatorio criptografico y su hash SHA-256.

    Regresa (token_en_claro, token_hash). El token en claro es lo unico que
    viaja en el link (por correo, o en la respuesta en modo dev) - nunca se
    guarda en la base de datos, solo su hash."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
