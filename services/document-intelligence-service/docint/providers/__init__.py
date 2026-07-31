from .base import DocumentIntelligenceProvider
from .gemini_provider import GeminiProvider

__all__ = ["DocumentIntelligenceProvider", "GeminiProvider", "get_provider"]


def get_provider() -> DocumentIntelligenceProvider:
    """Punto unico de eleccion de provider - todo lo demas (vistas, PLD,
    Compras, RRHH) llama siempre a get_provider(), nunca instancia un
    provider concreto directamente."""
    return GeminiProvider()
