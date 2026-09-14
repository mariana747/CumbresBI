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


class AnalysisJob(models.Model):
    """Estado transaccional vivo de un analisis (Fase 1+ de la migracion a
    async con Cloud Tasks, ver plan). AnalysisRequestLog sigue siendo la
    bitacora historica que se escribe al completar - este modelo es el que
    se consulta mientras el analisis esta en curso (polling de
    GET /analyze/<id>/status) y el que permite reintentar sin que el
    usuario vuelva a subir el archivo (el archivo vive en staging, ver
    docint/storage.py, no se descarta hasta que el job termina).
    """

    PENDIENTE = "PENDIENTE"
    PROCESANDO = "PROCESANDO"
    COMPLETADO = "COMPLETADO"
    ERROR = "ERROR"
    ESTADOS = [
        (PENDIENTE, "Pendiente"),
        (PROCESANDO, "Procesando"),
        (COMPLETADO, "Completado"),
        (ERROR, "Error"),
    ]

    id = models.CharField(max_length=32, primary_key=True, default=_request_id, editable=False)
    status = models.CharField(max_length=12, choices=ESTADOS, default=PENDIENTE)

    gcs_uri = models.CharField(max_length=500, help_text="URI de staging (docint/storage.py), no el archivo final.")
    mime_type = models.CharField(max_length=100)
    expected_document_type = models.CharField(max_length=100, blank=True)
    internal_prompt_key = models.CharField(max_length=100)
    matched_by_filename = models.BooleanField(null=True, default=None)
    metadata = models.JSONField(default=dict, blank=True)
    servicio_solicitante = models.CharField(max_length=50, default="desconocido")

    resultado = models.JSONField(null=True, blank=True, help_text="DocumentAnalysisResult serializado, solo si COMPLETADO.")
    error_mensaje = models.TextField(blank=True, default="")

    intentos = models.PositiveIntegerField(default=0)
    max_intentos = models.PositiveIntegerField(default=3)
    cloud_task_name = models.CharField(max_length=200, blank=True, default="")

    # user_id de iam-service (referencia laxa, igual patron que created_by en
    # otros servicios) - snapshot de quien pidio el analisis y de que el
    # permiso ya se valido en POST /analyze con su JWT (ver plan, seccion de
    # autenticacion: la tarea encolada NO revalida el JWT del usuario, solo
    # este registro es la autorizacion que ya quedo tomada).
    solicitado_por = models.CharField(max_length=100, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "docint_analysis_job"
        ordering = ["-created_at"]
