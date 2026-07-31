"""Streaming de documentos desde Google Drive (docs/architecture/README.md:
'sin almacenamiento local de archivos, streaming via Google Drive API').

Integracion real pendiente - requiere una cuenta de servicio con acceso a
Drive, que depende del proyecto GCP (Actividad 1, bloqueada). Mientras tanto,
para pruebas con documentos FICTICIOS solamente, se acepta un archivo subido
directo al endpoint (ver docint/views.py) en vez de una referencia de Drive.
"""


def fetch_bytes(file_id: str) -> bytes:
    raise NotImplementedError(
        "Integracion con Google Drive API pendiente - requiere proyecto GCP "
        "(Actividad 1). Usa el modo de subida directa (dev, solo documentos "
        "ficticios) mientras tanto - ver docint/views.py."
    )
