from abc import ABC, abstractmethod

from docint.contracts import DocumentAnalysisRequest, DocumentAnalysisResult


class DocumentIntelligenceProvider(ABC):
    """Patron adaptador (docs/architecture/README.md sec. 10) - el resto del
    sistema llama a get_provider(), nunca conoce el proveedor concreto."""

    @abstractmethod
    def analyze(
        self, request: DocumentAnalysisRequest, document_bytes: bytes, mime_type: str
    ) -> DocumentAnalysisResult:
        raise NotImplementedError
