from rest_framework import serializers

from .models import TicketsCentro, TicketsProyecto, TicketsProyectoParticipante


class TicketsCentroSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketsCentro
        fields = [
            "id_tickets_centro",
            "denominacion",
            "descripcion",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_tickets_centro", "created_at", "created_by", "updated_at", "updated_by"]


class TicketsProyectoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketsProyecto
        fields = [
            "id_proyecto",
            "denominacion",
            "descripcion",
            "centro",
            "carpeta",
            "responsable",
            "estado",
            "vencimiento",
            "fecha_inicio",
            "fecha_fin",
            "progreso",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_proyecto", "created_at", "created_by", "updated_at", "updated_by"]


class TicketsProyectoParticipanteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketsProyectoParticipante
        fields = [
            "id_proyectos_part",
            "id_proyecto",
            "id_participante",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_proyectos_part", "created_at", "created_by", "updated_at", "updated_by"]
