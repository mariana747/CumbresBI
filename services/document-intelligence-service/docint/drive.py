"""Cliente HTTP hacia drive-service para leer bytes de un documento ya
guardado en Drive (docs/architecture/README.md sec. 10: "streaming via
Google Drive API", nunca subida local real - ver memoria de sesion
"motor-documental-seleccion-archivos-drive": el analista sube el archivo
directo en drive.google.com, esta app solo lo selecciona y analiza).

docint nunca habla con la API de Google Drive directo - le pide los bytes
a drive-service via HTTP (mismo patron que PldContraparteDocViewSet.subir/
BitacoraAuditoriaViewSet.export_csv: reenviar el JWT/cookie del usuario
original, para que el permiso real lo siga decidiendo drive-service segun
el perm_key que mande el llamador, no una credencial propia de docint).
"""

import requests
from django.conf import settings


class DriveError(Exception):
    """Cualquier falla al pedirle un archivo a drive-service - los views la
    traducen a un 502, nunca dejan pasar la excepcion cruda de requests."""


def fetch_bytes(
    file_id: str,
    carpeta: str,
    perm_key: str,
    headers: dict,
    cookies: dict,
) -> bytes:
    """Descarga el archivo `file_id` (dentro de `carpeta`, ej.
    "PLD/<id_contraparte>") desde drive-service. `headers`/`cookies` son
    los del request original del usuario (Authorization/cookie de sesion),
    reenviados tal cual para que drive-service exija el perm_key real."""
    try:
        response = requests.get(
            f"{settings.DRIVE_SERVICE_URL}/api/download/{file_id}/",
            params={"perm": perm_key, "carpeta": carpeta},
            headers=headers,
            cookies=cookies,
            timeout=60,
        )
    except requests.RequestException as exc:
        raise DriveError(f"drive-service no respondio: {exc}") from exc

    if response.status_code != 200:
        detalle = response.text if response.content else f"HTTP {response.status_code}"
        raise DriveError(f"No se pudo descargar el archivo de Drive: {detalle}")

    return response.content
