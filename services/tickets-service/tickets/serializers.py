from rest_framework import serializers

from .models import (
    Ticket,
    TicketsCentro,
    TicketsDependencia,
    TicketsLog,
    TicketsProyecto,
    TicketsProyectoParticipante,
    TicketsSubproyecto,
)


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


class TicketsSubproyectoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketsSubproyecto
        fields = [
            "id_subproyecto",
            "denominacion",
            "descripcion",
            "id_proyecto",
            "sociedad",
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
        read_only_fields = ["id_subproyecto", "created_at", "created_by", "updated_at", "updated_by"]


class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = [
            "id_ticket",
            "denominacion",
            "descripcion",
            "id_subproyecto",
            "categoria",
            "prioridad",
            "estado",
            "asignado_a",
            "fecha_inicio_prog",
            "fecha_fin_prog",
            "fecha_inicio_real",
            "fecha_fin_real",
            "estimacion_horas",
            "carpeta",
            "instrucciones_entrega",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_ticket", "created_at", "created_by", "updated_at", "updated_by"]


class TicketsDependenciaSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketsDependencia
        fields = [
            "id_dependencia",
            "predecesora",
            "sucesora",
            "tipo",
            "ventaja_desfase_dias",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_dependencia", "created_at", "created_by", "updated_at", "updated_by"]

    def validate(self, attrs):
        predecesora = attrs.get("predecesora", getattr(self.instance, "predecesora", None))
        sucesora = attrs.get("sucesora", getattr(self.instance, "sucesora", None))
        if predecesora and sucesora and predecesora == sucesora:
            raise serializers.ValidationError("Un ticket no puede depender de sí mismo.")
        return attrs


class TicketsLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketsLog
        fields = [
            "id_log",
            "id_ticket",
            "accion",
            "progreso_nuevo",
            "horas_incurridas",
            "evidencia",
            "comentarios",
            "created_at",
            "created_by",
        ]
        read_only_fields = ["id_log", "created_at", "created_by"]
