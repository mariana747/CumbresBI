"""Exportar a Google Sheets, al Drive PERSONAL del usuario (14/Sep/2026,
"ya no se descargara ni CSV ni Excel, se guardara en su drive personal") -
distinto de drive-service (Unidad compartida corporativa, domain-wide
delegation). El access_token de Google de CADA usuario vive en
iam-service (ver iam/google_personal_views.py) - este modulo solo lo pide
prestado (reenviando el JWT/cookie del usuario, no un secreto compartido)
y llama la API de Sheets directo con `requests`, sin agregar
google-api-python-client como dependencia nueva a este servicio (mismo
criterio que el resto de integraciones externas del proyecto, ej.
mail_utils.py hablando con mail-service)."""

import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 20
_SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets"
_DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files"


class GoogleSheetsNoConectado(Exception):
    """El usuario no ha conectado su cuenta personal de Google todavia -
    el llamador (la vista) debe regresar la url de autorizacion en vez de
    un error generico, ver TesoreriaFlujoViewSet.exportar_sheets."""


def obtener_access_token(request) -> str:
    headers, cookies = forward_auth_headers(request)
    respuesta = requests.get(
        f"{settings.IAM_SERVICE_URL}/api/personal/access-token/",
        headers=headers,
        cookies=cookies,
        timeout=_TIMEOUT_SEGUNDOS,
    )
    if respuesta.status_code == 404:
        raise GoogleSheetsNoConectado()
    respuesta.raise_for_status()
    return respuesta.json()["access_token"]


def url_autorizacion(request) -> str:
    """Para cuando obtener_access_token lanza GoogleSheetsNoConectado -
    misma llamada servicio-a-servicio, reenviando el JWT/cookie del
    usuario, para pedirle a iam-service la URL de consentimiento de
    Google."""
    headers, cookies = forward_auth_headers(request)
    respuesta = requests.get(
        f"{settings.IAM_SERVICE_URL}/api/personal/autorizar/",
        headers=headers,
        cookies=cookies,
        timeout=_TIMEOUT_SEGUNDOS,
    )
    respuesta.raise_for_status()
    return respuesta.json()["url"]


def crear_hoja(
    access_token: str, titulo: str, encabezados: list[str], filas: list[list], carpeta_id: str | None = None
) -> str:
    """Crea la hoja (por default queda en la raiz del Drive del usuario
    del access_token - la API de Sheets no tiene forma de indicar carpeta
    al crear) y le escribe los datos. Si `carpeta_id` viene (14/Sep/2026,
    "dejar que ellos puedan escoger donde guardar" - elegida con el Google
    Picker en el frontend, ver googleFolderPicker.ts), se mueve ahi
    despues via la API de Drive (requiere el scope drive.file, ver
    google_oauth._SCOPE en iam-service - alcance suficiente porque el
    archivo lo creo esta misma app). Regresa la URL para abrir directo
    (nunca se descarga nada, ver pedido de negocio arriba)."""
    encabezados_auth = {"Authorization": f"Bearer {access_token}"}
    creado = requests.post(
        _SHEETS_API_URL,
        headers=encabezados_auth,
        json={"properties": {"title": titulo}},
        timeout=_TIMEOUT_SEGUNDOS,
    )
    creado.raise_for_status()
    datos = creado.json()
    spreadsheet_id = datos["spreadsheetId"]

    valores = requests.put(
        f"{_SHEETS_API_URL}/{spreadsheet_id}/values/A1",
        headers=encabezados_auth,
        params={"valueInputOption": "USER_ENTERED"},
        json={"values": [encabezados] + filas},
        timeout=_TIMEOUT_SEGUNDOS,
    )
    valores.raise_for_status()

    if carpeta_id:
        # removeParents=root (14/Sep/2026) - un Sheet recien creado por la
        # API, sin carpeta indicada, siempre nace con "root" (la raiz del
        # Drive del usuario) como su unico padre; se quita ese y se agrega
        # la carpeta elegida, un "mover" real (no "tambien esta en").
        mover = requests.patch(
            f"{_DRIVE_API_URL}/{spreadsheet_id}",
            headers=encabezados_auth,
            params={"addParents": carpeta_id, "removeParents": "root", "fields": "id,parents"},
            timeout=_TIMEOUT_SEGUNDOS,
        )
        # Fail-open (14/Sep/2026, mismo criterio que el resto del proyecto
        # con lo "mejor esfuerzo") - si mover falla (ej. la carpeta ya no
        # existe/se revoco el acceso), la hoja YA se creo con sus datos; es
        # mejor entregarla en la raiz que perder el trabajo ya hecho.
        if not mover.ok:
            logger.warning(
                "no se pudo mover el Sheet %s a la carpeta %s: %s", spreadsheet_id, carpeta_id, mover.text
            )

    return datos["spreadsheetUrl"]
