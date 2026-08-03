from rest_framework import serializers

from .models import BitacoraAuditoria


class BitacoraAuditoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BitacoraAuditoria
        fields = [
            "event_id",
            "servicio_origen",
            "actor_user_id",
            "accion",
            "entidad",
            "entidad_id",
            "valores_previos",
            "valores_nuevos",
            "ocurrido_en",
            "recibido_en",
        ]
        read_only_fields = fields
