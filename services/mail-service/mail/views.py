"""Endpoint de mail-service - consumido por otros microservicios (iam-service
para Magic Links, pld-service para tickets de cliente), nunca directo por
el navegador. Gateado por permiso via cumbresbi_scope (mismo criterio que
drive-service): el llamador debe traer el JWT de sesion original del
usuario que genero el link/ticket (no una credencial de servicio propia),
asi el permiso exacto (ej. iam.crear, pld-compliance.crear) sigue siendo
el que decide, no "cualquiera que le hable a este servicio puede mandar
correo a nombre de Cumbres".
"""

from rest_framework.response import Response
from rest_framework.views import APIView

from cumbresbi_scope.permissions import require_permission

from . import gmailclient


class SendEmailView(APIView):
    """POST /api/send/ - JSON: to, subject, html_body, permiso requerido via
    query param ?perm=iam.crear (el llamador decide cual perm_key aplica a
    SU caso de uso, mismo patron que drive-service/drive/views.py)."""

    def post(self, request, *args, **kwargs):
        perm_key = request.query_params.get("perm")
        if not perm_key:
            return Response({"detail": "Falta ?perm=<perm_key> requerido por el llamador"}, status=400)
        if not require_permission(perm_key)().has_permission(request, self):
            return Response({"detail": f"Falta el permiso '{perm_key}'"}, status=403)

        to = request.data.get("to")
        subject = request.data.get("subject")
        html_body = request.data.get("html_body")
        if not to or not subject or not html_body:
            return Response({"detail": "Campos 'to', 'subject' y 'html_body' requeridos"}, status=400)

        try:
            resultado = gmailclient.send_email(to=to, subject=subject, html_body=html_body)
        except gmailclient.MailError as exc:
            return Response({"detail": str(exc)}, status=502)

        return Response(resultado, status=201)
