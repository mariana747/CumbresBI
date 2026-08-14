"""Endpoints del servicio de Drive - consumidos por otros microservicios
(pld-service hoy; Tesoreria/contratos y Excels mas adelante, ver
pld-fase2-alcance.md sec. 1.3), nunca directo por el navegador. Gateados
por permiso via cumbresbi_scope (mismo criterio que el resto del
proyecto) - el llamador debe traer el JWT de sesion original del usuario
final (no una credencial de servicio propia), asi el permiso exacto
(ej. pld-compliance.crear) sigue siendo el que decide, no "cualquiera que
le hable a este servicio puede subir archivos".
"""

from django.http import StreamingHttpResponse
from rest_framework.response import Response
from rest_framework.views import APIView

from cumbresbi_scope.permissions import require_permission

from . import driveclient


class UploadView(APIView):
    """POST /api/upload/ - multipart: file, carpeta ("PLD/<id_contraparte>"),
    permiso requerido via query param ?perm=pld-compliance.crear (el
    llamador decide cual perm_key aplica a SU caso de uso; este servicio no
    conoce el dominio de negocio de quien lo llama, solo exige que el JWT
    tenga ALGUN perm_key, ver _require_perm_dinamico)."""

    def post(self, request, *args, **kwargs):
        perm_key = request.query_params.get("perm")
        if not perm_key:
            return Response({"detail": "Falta ?perm=<perm_key> requerido por el llamador"}, status=400)
        if not require_permission(perm_key)().has_permission(request, self):
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


class BrowseView(APIView):
    """GET /api/browse/?carpeta_id=<id, vacio=raiz>&perm=pld-compliance.crear
    - explorador real de la Unidad compartida (a diferencia de
    ListFilesView, que resuelve/crea una ruta fija por nombre y solo
    regresa archivos): esta vista navega por ID y regresa TANTO archivos
    como subcarpetas (campo `es_carpeta`), para que el frontend arme un
    explorador con "entrar"/"regresar" en vez de una ruta fija por modulo
    (decision de Mariana, 13/Ago/2026)."""

    def get(self, request, *args, **kwargs):
        perm_key = request.query_params.get("perm")
        if not perm_key:
            return Response({"detail": "Falta ?perm=<perm_key> requerido por el llamador"}, status=400)
        if not require_permission(perm_key)().has_permission(request, self):
            return Response({"detail": f"Falta el permiso '{perm_key}'"}, status=403)

        carpeta_id = request.query_params.get("carpeta_id") or None
        try:
            items = driveclient.list_children(carpeta_id)
        except driveclient.DriveError as exc:
            return Response({"detail": str(exc)}, status=502)

        return Response({"items": items})


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
