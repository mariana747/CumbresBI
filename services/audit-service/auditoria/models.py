import uuid

from django.db import models


def _event_id():
    return uuid.uuid4().hex


class BitacoraAuditoria(models.Model):
    """Bitacora central de auditoria, inmutable / append-only.

    Unico escritor: audit-service, consumiendo `audit.events` de Pub/Sub
    via patron Transactional Outbox (docs/architecture/README.md sec. 9).
    No lleva ForeignKey real a iam_users (otro servicio, otro esquema
    logico) - servicio_origen + actor_user_id son referencias laxas.
    La inmutabilidad se refuerza con triggers SQL BEFORE UPDATE/DELETE
    (migration 0002_append_only_triggers) ademas de bloquear aqui mismo
    cualquier intento de UPDATE/DELETE via el ORM.
    """

    event_id = models.CharField(max_length=32, primary_key=True, default=_event_id, editable=False)
    servicio_origen = models.CharField(
        max_length=50, help_text="Microservicio que publico el evento, ej. 'iam-service'."
    )
    actor_user_id = models.CharField(
        max_length=8, help_text="iam_users.user_id del actor, sin FK cruzada de esquema."
    )
    accion = models.CharField(max_length=100, help_text="Ej. 'iam_user_roles.grant', 'pld_kyc.approve'.")
    entidad = models.CharField(max_length=100, help_text="Tabla/entidad de negocio afectada.")
    entidad_id = models.CharField(max_length=255)
    valores_previos = models.JSONField(blank=True, null=True)
    valores_nuevos = models.JSONField(blank=True, null=True)
    ocurrido_en = models.DateTimeField(help_text="Timestamp del hecho de negocio, no de la insercion.")
    recibido_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bitacora_auditoria"
        ordering = ["-ocurrido_en"]

    def __str__(self):
        return f"{self.servicio_origen}:{self.accion}:{self.entidad_id}"

    def save(self, *args, **kwargs):
        if self.pk and BitacoraAuditoria.objects.filter(pk=self.pk).exists():
            raise ValueError("bitacora_auditoria es append-only: no se permite UPDATE.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("bitacora_auditoria es append-only: no se permite DELETE.")
