import uuid

from django.db import models


def _request_id():
    return uuid.uuid4().hex


class AnalysisRequestLog(models.Model):
    """Unica tabla de este servicio (docs/architecture/README.md sec. 1.1:
    'Ninguna tabla de negocio, solo su propio log de solicitudes'). El evento
    de auditoria real (async, via outbox) se publica aparte hacia
    audit-service - este log es operativo/debug, no el registro de
    cumplimiento.

    Nombres de campo en espanol (consistente con el resto del esquema real),
    salvo created_at/updated_at que siguen la convencion ya establecida en
    todas las tablas del ERD original.
    """

    request_id = models.CharField(max_length=32, primary_key=True, default=_request_id, editable=False)
    servicio_solicitante = models.CharField(max_length=50, help_text="Ej. 'pld-service'")
    tipo_documento_esperado = models.CharField(max_length=100)
    tipo_documento_detectado = models.CharField(max_length=100, blank=True, null=True)
    coincide_tipo_esperado = models.BooleanField(default=False)
    confianza = models.FloatField(default=0.0)
    proveedor_usado = models.CharField(
        max_length=20,
        default="ai-studio",
        help_text="'ai-studio' (documentos ficticios) o 'vertex-ai' (documentos reales).",
    )
    errores_validacion = models.JSONField(default=list, blank=True)
    advertencias = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "docint_analysis_request_log"
        ordering = ["-created_at"]
