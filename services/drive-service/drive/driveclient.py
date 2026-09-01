"""Cliente de Google Drive - unico lugar del proyecto que habla con la API
real (docs/architecture/pld-fase2-alcance.md sec. 1.3: Drive es transversal
- PLD, contratos de Tesoreria y Excels lo van a reusar - por eso vive en su
propio servicio, sin depender de document-intelligence-service/Gemini).

Autenticacion: cuenta de servicio (drive-service@cyp-cumbres-461220...) con
domain-wide delegation, impersonando a settings.DRIVE_IMPERSONATE_SUBJECT
(un usuario real del Workspace de Cumbres dueno/con acceso a la carpeta
CumbresBI/) - una cuenta de servicio no tiene Drive propio.

Modo simulado (settings.DRIVE_SERVICE_ACCOUNT_JSON vacio, default en dev):
en vez de lanzar NotImplementedError como el stub viejo de docint/drive.py,
aqui se simula un Drive real con una carpeta local en disco
(MEDIA_ROOT_SIMULADO) - permite escribir y probar todo el resto del
sistema (modelos, endpoints, frontend) sin la cuenta de servicio real
todavia. Cuando llegue la credencial, dejar de estar vacio
DRIVE_SERVICE_ACCOUNT_JSON activa el modo real sin tocar ningun consumidor
(pld-service, docint, etc.) - la interfaz (upload_bytes/download_bytes/
list_files/ensure_folder_path) es identica en ambos modos.
"""

import io
import json
import logging
import os
import uuid
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/drive"]

# Carpeta local que hace de "Drive simulado" en modo dev - vive dentro del
# contenedor/checkout, no se sube a git (ver .gitignore) ni se persiste
# entre builds de Docker; es solo para desarrollar sin credenciales reales.
_SIMULADO_ROOT = Path(os.environ.get("DRIVE_SIMULADO_ROOT", "/tmp/drive-service-simulado"))


class DriveError(Exception):
    """Cualquier falla al hablar con Drive (real o simulado) - los views la
    traducen a un 502, nunca dejan pasar la excepcion cruda de
    googleapiclient al cliente."""


def _traducir_error_drive(exc: Exception, contexto: str) -> DriveError:
    """Traduce una excepcion real de googleapiclient a un mensaje de negocio
    en espanol (01/Sep/2026, hallazgo real: hasta ahora cada `except
    Exception as exc` metia `str(exc)` crudo dentro del mensaje - el JSON
    completo de error de Google, con codigos internos, URIs de la API y
    detalles tecnicos, llegaba tal cual al frontend via el 502 de las vistas
    - mismo criterio de traduccion por codigo que ya usa
    document-intelligence-service/docint/providers/gemini_provider.py, solo
    que ahi si se aplicaba desde el principio.

    El detalle real SIEMPRE se manda al logger (logger.exception, con
    traceback completo) para depuracion - nunca se pierde, solo se deja de
    exponer en la respuesta HTTP que ve el usuario final."""
    logger.exception("Error real de Google Drive al intentar %s", contexto)

    from googleapiclient.errors import HttpError

    if isinstance(exc, HttpError):
        status = exc.resp.status
        if status in (401, 403):
            return DriveError(
                f"No se tiene permiso para {contexto} en Drive - la cuenta de servicio no tiene "
                "acceso a esa carpeta, o el token de acceso expiró. Contacta a un administrador."
            )
        if status == 404:
            return DriveError(f"No se encontró el archivo o carpeta en Drive al intentar {contexto}.")
        if status == 429:
            return DriveError(
                "Se alcanzó el límite de solicitudes a Google Drive. Intenta de nuevo en unos minutos."
            )
        if status in (500, 502, 503, 504):
            return DriveError(
                "El servicio de Google Drive no está disponible en este momento. Intenta de nuevo más tarde."
            )
        return DriveError(f"Google Drive respondió con un error al intentar {contexto} (código {status}).")

    return DriveError(f"No se pudo conectar con Google Drive al intentar {contexto}. Intenta de nuevo.")


def _modo_real() -> bool:
    return bool(settings.DRIVE_SERVICE_ACCOUNT_JSON)


_TIMEOUT_SEGUNDOS = 30


def _servicio_real():
    """Construye el cliente de googleapiclient - import perezoso a proposito
    (google-api-python-client/google-auth solo hacen falta en modo real; el
    modo simulado no debe requerir que esten instalados para correr, ej. en
    pruebas unitarias rapidas).

    25/Ago/2026 (hallazgo real: una subida se quedaba "cargando" para
    siempre en el formulario publico, sin log ni error) - build() con
    credentials= construye su httplib2.Http() interno SIN timeout, asi que
    un problema de red hacia Google (DNS lento, conexion colgada) bloqueaba
    el worker de gunicorn indefinidamente, sin fallar nunca. Se arma el
    Http explicito con timeout y se pasa como http= (no se puede pasar
    credentials= y http= juntos) para que cualquier llamada falle rapido y
    caiga en los except DriveError/502 que ya existian, en vez de colgarse."""
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    import google_auth_httplib2
    import httplib2

    # 01/Sep/2026 (hallazgo real: nada envolvia esta construccion en
    # try/except - un DRIVE_SERVICE_ACCOUNT_JSON malformado o una credencial
    # revocada tumbaba con un 500 crudo de Django, sin pasar por DriveError
    # ni por el 502 uniforme que ya arman las vistas, distinto de cualquier
    # otro error de este modulo).
    try:
        info = json.loads(settings.DRIVE_SERVICE_ACCOUNT_JSON)
        credentials = service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
        if settings.DRIVE_IMPERSONATE_SUBJECT:
            credentials = credentials.with_subject(settings.DRIVE_IMPERSONATE_SUBJECT)
        http_autorizado = google_auth_httplib2.AuthorizedHttp(
            credentials, http=httplib2.Http(timeout=_TIMEOUT_SEGUNDOS)
        )
        return build("drive", "v3", http=http_autorizado, cache_discovery=False)
    except Exception as exc:  # noqa: BLE001
        logger.exception("No se pudo construir el cliente de Google Drive (credencial de servicio)")
        raise DriveError(
            "No se pudo conectar con Google Drive - la credencial de la cuenta de servicio no es válida "
            "o no está configurada correctamente. Contacta a un administrador."
        ) from exc


def ensure_folder_path(ruta: str) -> str:
    """Resuelve (creando si hace falta) una ruta tipo "PLD/<id_contraparte>".
    El primer segmento es el modulo: si tiene su propia Unidad compartida en
    settings.DRIVE_MODULE_FOLDER_IDS (ver comentario ahi - PLD desde
    14/Ago/2026), el resto de la ruta se resuelve directamente bajo esa
    Unidad (el nombre del modulo NO se vuelve una subcarpeta, ya es la
    raiz). Si el modulo no esta en ese mapeo, cae al comportamiento viejo:
    toda la ruta (incluido el modulo) se resuelve como subcarpetas de
    settings.DRIVE_ROOT_FOLDER_ID ("CumbresBI/"). Regresa el file_id (real o
    simulado) de la carpeta final.

    IMPORTANTE: tanto DRIVE_ROOT_FOLDER_ID como cualquier ID de
    DRIVE_MODULE_FOLDER_IDS viven en una Unidad compartida, no en "Mi
    unidad" - la API de Drive por default asume "Mi unidad" y regresa 404
    "File not found" para IDs de una Unidad compartida si no se manda
    supportsAllDrives=True (y includeItemsFromAllDrives=True en list()) en
    CADA llamada que toca esa jerarquia - list, create, get_media. Se
    detecto probando contra el Drive real (12/Ago/2026): sin este parametro
    fallaba con 404 aunque el usuario impersonado si tenia acceso."""
    partes = [p for p in ruta.split("/") if p]

    if not _modo_real():
        destino = _SIMULADO_ROOT.joinpath(*partes)
        destino.mkdir(parents=True, exist_ok=True)
        return str(destino)

    servicio = _servicio_real()

    modulo = partes[0] if partes else None
    if modulo and modulo in settings.DRIVE_MODULE_FOLDER_IDS:
        padre_id = settings.DRIVE_MODULE_FOLDER_IDS[modulo]
        partes = partes[1:]
    else:
        padre_id = settings.DRIVE_ROOT_FOLDER_ID
        if not padre_id:
            raise DriveError("DRIVE_ROOT_FOLDER_ID no configurado - falta resolver la carpeta CumbresBI/ raiz")

    for nombre in partes:
        query = (
            f"'{padre_id}' in parents and name = '{nombre}' "
            "and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        )
        try:
            resultado = (
                servicio.files()
                .list(
                    q=query,
                    fields="files(id, name)",
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True,
                )
                .execute()
            )
        except Exception as exc:  # noqa: BLE001 - cualquier error de googleapiclient
            raise _traducir_error_drive(exc, "listar carpetas") from exc

        encontrados = resultado.get("files", [])
        if encontrados:
            padre_id = encontrados[0]["id"]
            continue

        metadata = {"name": nombre, "mimeType": "application/vnd.google-apps.folder", "parents": [padre_id]}
        try:
            carpeta = servicio.files().create(body=metadata, fields="id", supportsAllDrives=True).execute()
        except Exception as exc:  # noqa: BLE001
            raise _traducir_error_drive(exc, f"crear la carpeta '{nombre}'") from exc
        padre_id = carpeta["id"]

    return padre_id


def upload_bytes(carpeta: str, nombre_archivo: str, contenido: bytes, mime_type: str = "application/octet-stream"):
    """Sube un archivo a `carpeta` (ruta tipo "PLD/<id_contraparte>",
    resuelta/creada via ensure_folder_path). Regresa
    {"file_id": ..., "web_view_link": ..., "mime_type": ..., "tamano_bytes": ...}."""
    carpeta_id = ensure_folder_path(carpeta)

    if not _modo_real():
        file_id = f"sim-{uuid.uuid4().hex[:12]}"
        destino = Path(carpeta_id) / f"{file_id}__{nombre_archivo}"
        destino.write_bytes(contenido)
        return {
            "file_id": file_id,
            "web_view_link": f"file://{destino}",
            "mime_type": mime_type,
            "tamano_bytes": len(contenido),
        }

    from googleapiclient.http import MediaIoBaseUpload

    servicio = _servicio_real()
    media = MediaIoBaseUpload(io.BytesIO(contenido), mimetype=mime_type, resumable=False)
    metadata = {"name": nombre_archivo, "parents": [carpeta_id]}
    try:
        archivo = (
            servicio.files()
            .create(
                body=metadata,
                media_body=media,
                fields="id, webViewLink, mimeType, size",
                supportsAllDrives=True,
            )
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise _traducir_error_drive(exc, f"subir '{nombre_archivo}'") from exc

    return {
        "file_id": archivo["id"],
        "web_view_link": archivo.get("webViewLink", ""),
        "mime_type": archivo.get("mimeType", mime_type),
        "tamano_bytes": int(archivo.get("size", len(contenido))),
    }


def iter_download(file_id: str, carpeta: str | None = None, chunk_size: int = 256 * 1024):
    """Generador de chunks de bytes - lo que consume el view de descarga
    (StreamingHttpResponse) y, mas adelante, docint para el streaming
    Drive->Gemini (docint pide los bytes via HTTP a este servicio en vez de
    hablar con Drive directo - asi Gemini nunca depende de la credencial de
    Drive, solo drive-service la tiene)."""
    if not _modo_real():
        # En modo simulado, file_id es justo el nombre que se guardo en
        # upload_bytes - se busca dentro de la carpeta simulada indicada
        # (docint/pld-service deben mandar la misma carpeta que usaron al
        # subir, igual que tendrian que mandar el padre real en Drive).
        if not carpeta:
            raise DriveError("Modo simulado: se requiere 'carpeta' para ubicar el archivo")
        base = Path(ensure_folder_path(carpeta))
        coincidencias = list(base.glob(f"{file_id}__*"))
        if not coincidencias:
            raise DriveError(f"Archivo simulado no encontrado: {file_id} en {carpeta}")
        with open(coincidencias[0], "rb") as f:
            while chunk := f.read(chunk_size):
                yield chunk
        return

    from googleapiclient.http import MediaIoBaseDownload

    servicio = _servicio_real()
    buffer = io.BytesIO()
    try:
        request = servicio.files().get_media(fileId=file_id, supportsAllDrives=True)
        downloader = MediaIoBaseDownload(buffer, request, chunksize=chunk_size)
        listo = False
        while not listo:
            _, listo = downloader.next_chunk()
            buffer.seek(0)
            yield buffer.read()
            buffer.seek(0)
            buffer.truncate()
    except Exception as exc:  # noqa: BLE001
        raise _traducir_error_drive(exc, f"descargar el archivo '{file_id}'") from exc


def file_exists(file_id: str, carpeta: str | None = None) -> bool:
    """True si `file_id` sigue existiendo en Drive (y no esta en la papelera)
    - usado para detectar documentos borrados directo en drive.google.com
    sin pasar por la app (18/Ago/2026, hallazgo: la app nunca se enteraba,
    seguia mostrando el documento como si siguiera ahi). No lanza DriveError
    para un simple "no existe" (404/trashed) - eso es un resultado valido,
    no una falla; DriveError sigue reservado para errores reales de
    comunicacion con Drive (permisos, red, etc.)."""
    if not _modo_real():
        if not carpeta:
            raise DriveError("Modo simulado: se requiere 'carpeta' para ubicar el archivo")
        base = Path(ensure_folder_path(carpeta))
        return len(list(base.glob(f"{file_id}__*"))) > 0

    from googleapiclient.errors import HttpError

    servicio = _servicio_real()
    try:
        metadata = (
            servicio.files()
            .get(fileId=file_id, fields="id, trashed", supportsAllDrives=True)
            .execute()
        )
    except HttpError as exc:
        if exc.resp.status == 404:
            return False
        raise _traducir_error_drive(exc, f"verificar el archivo '{file_id}'") from exc
    except Exception as exc:  # noqa: BLE001
        raise _traducir_error_drive(exc, f"verificar el archivo '{file_id}'") from exc

    return not metadata.get("trashed", False)


def list_files(carpeta: str) -> list[dict]:
    """Lista los archivos (no subcarpetas) dentro de `carpeta`."""
    if not _modo_real():
        base = Path(ensure_folder_path(carpeta))
        return [
            {"file_id": p.name.split("__", 1)[0], "nombre": p.name.split("__", 1)[1]}
            for p in base.iterdir()
            if p.is_file()
        ]

    servicio = _servicio_real()
    carpeta_id = ensure_folder_path(carpeta)
    try:
        resultado = (
            servicio.files()
            .list(
                q=f"'{carpeta_id}' in parents and trashed = false",
                fields="files(id, name, mimeType, size, webViewLink)",
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
    except Exception as exc:  # noqa: BLE001
        raise _traducir_error_drive(exc, f"listar '{carpeta}'") from exc

    return [
        {"file_id": f["id"], "nombre": f["name"], "mime_type": f.get("mimeType"), "web_view_link": f.get("webViewLink")}
        for f in resultado.get("files", [])
        if f.get("mimeType") != "application/vnd.google-apps.folder"
    ]
