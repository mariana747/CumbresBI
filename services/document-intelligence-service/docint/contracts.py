"""Contrato del Motor Inteligente de Procesamiento Documental.

Tal cual documentado en docs/architecture/README.md sec. 10. Este contrato
NO cambia entre AI Studio (dev, documentos ficticios) y Vertex AI
(produccion, documentos reales) - lo unico que cambia es el provider usado
por debajo (ver providers/).
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class DriveFileRef:
    file_id: str
    web_view_link: Optional[str] = None


@dataclass(frozen=True)
class DocumentAnalysisRequest:
    document_ref: DriveFileRef  # streaming, nunca ruta local
    expected_document_type: str  # namespaced por servicio: "pld.ine", "compras.cotizacion"
    metadata: dict = field(default_factory=dict)  # opaco para el motor (id_kyc, id_expediente...)
    internal_prompt_key: str = "generic"


@dataclass(frozen=True)
class DocumentAnalysisResult:
    detected_document_type: Optional[str]
    matches_expected_type: bool
    confidence: float
    extracted_data: dict  # dato ausente = None, nunca inferido
    validation_errors: list
    warnings: list
