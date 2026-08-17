"""Endpoints del servicio de Drive - consumidos por otros microservicios
(pld-service hoy; Tesoreria/contratos y Excels mas adelante, ver
pld-fase2-alcance.md sec. 1.3), nunca directo por el navegador. Gateados
por permiso via cumbresbi_scope (mismo criterio que el resto del
proyecto) - el llamador debe traer el JWT de sesion original del usuario
final (no una credencial de servicio propia), asi el permiso exacto
(ej. pld-compliance.crear) sigue siendo el que decide, no "cualquiera que
le hable a este servicio puede subir archivos".
"""

from django.conf import settings
from django.http import StreamingHttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from cumbresbi_scope.permissions import require_permission

from . import driveclient


def _autorizado(request, view, perm_key: str) -> bool:
    """Autoriza por JWT de usuario (caso normal) O por secreto interno
    servicio-a-servicio (caso del formulario publico de PldTicketCliente,
    que no tiene sesion/JWT que reenviar - ver settings.DRIVE_INTERNAL_SECRET
    y su comentario espejo en pld-service/config/settings.py). El secreto
    NUNCA reemplaza el permiso en el caso normal (con JWT) - es una via
    adicional, solo valida si settings.DRIVE_INTERNAL_SECRET esta
    configurado (no vacio) y coincide exactamente."""
    secreto_configurado = settings.DRIVE_INTERNAL_SECRET
    secreto_recibido = request.META.get("HTTP_X_INTERNAL_SECRET")
    if secreto_configurado and secreto_recibido == secreto_configurado:
        return True
    return require_permission(perm_key)().has_permission(request, view)


class UploadView(APIView):
    """POST /api/upload/ - multipart: file, carpeta ("PLD/<id_contraparte>"),
    permiso requerido via query param ?perm=pld-compliance.crear (el
    llamador decide cual perm_key aplica a SU caso de uso; este servicio no
    conoce el dominio de negocio de quien lo llama, solo exige que el JWT
    tenga ALGUN perm_key, ver _require_perm_dinamico) - o el secreto interno
    servicio-a-servicio (ver _autorizado arriba) para llamadas sin sesion
    de usuario (ej. formulario publico de PldTicketCliente)."""

    def post(self, request, *args, **kwargs):
        perm_key = request.query_params.get("perm")
        if not perm_key:
            return Response({"detail": "Falta ?perm=<perm_key> requerido por el llamador"}, status=400)
        if not _autorizado(request, self, perm_key):
            return Response({"detail": f"Falta el permiso '{perm_key}'"}, status=403)

        archivo = request.FILES.get("file")
        carpeta = request.data.get("carpeta")
        if not archivo or not carpeta:
            return Response({"detail": "Campos 'file' y 'carpeta' requeridos"}, status=400)

        try:
            resultado = driveclient.upload_bytes(
                carpeta=carpeta,
                nombre_archivo=archivo.name,
                contenido=archivo.read(),
                mime_type=archivo.content_type or "application/octet-stream",
            )
        except driveclient.DriveError as exc:
            return Response({"detail": str(exc)}, status=502)

        return Response(resultado, status=201)


class DownloadView(APIView):
    """GET /api/download/<file_id>/?carpeta=PLD/<id_contraparte> - respuesta
    en streaming (chunk por chunk, ver driveclient.iter_download) para que
    quien la consuma (ej. docint reenviando a Gemini) no tenga que esperar
    el archivo completo en memoria antes de empezar a procesarlo."""

    def get(self, request, file_id, *args, **kwargs):
        perm_key = request.query_params.get("perm")
        if not perm_key:
            return Response({"detail": "Falta ?perm=<perm_key> requerido por el llamador"}, status=400)
        if not require_permission(perm_key)().has_permission(request, self):
            return Response({"detail": f"Falta el permiso '{perm_key}'"}, status=403)

        carpeta = request.query_params.get("carpeta")
        try:
            chunks = driveclient.iter_download(file_id, carpeta=carpeta)
            # Fuerza la primera lectura aqui (fuera del generador perezoso)
            # para que un DriveError se traduzca a 502 en vez de romper el
            # streaming ya empezado con un 200 a medias.
            primer_chunk = next(chunks)
        except driveclient.DriveError as exc:
            return Response({"detail": str(exc)}, status=502)
        except StopIteration:
            primer_chunk = b""
            chunks = iter(())

        def generador():
            yield primer_chunk
            yield from chunks

        return StreamingHttpResponse(generador(), content_type="application/octet-stream")


class ListFilesView(APIView):
    """GET /api/list/?carpeta=PLD/<id_contraparte>&perm=pld-compliance.leer"""

    def get(self, request, *args, **kwargs):
        perm_key = request.query_params.get("perm")
        if not perm_key:
            return Response({"detail": "Falta ?perm=<perm_key> requerido por el llamador"}, status=400)
        if not require_permission(perm_key)().has_permission(request, self):
            return Response({"detail": f"Falta el permiso '{perm_key}'"}, status=403)

        carpeta = request.query_params.get("carpeta")
        if not carpeta:
            return Response({"detail": "Falta ?carpeta=..."}, status=400)

        try:
            archivos = driveclient.list_files(carpeta)
        except driveclient.DriveError as exc:
            return Response({"detail": str(exc)}, status=502)

        return Response({"archivos": archivos})
