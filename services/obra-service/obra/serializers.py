from rest_framework import serializers

from .models import (
    ObraConcepto,
    ObraCorteSemanal,
    ObraCorteSemanalDetalle,
    ObraEstimacion,
    ObraEtapa,
    ObraEvidencia,
    ObraLote,
)


class ObraEtapaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObraEtapa
        fields = [
            "id_etapa",
            "numero",
            "nombre",
            "orden",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_etapa", "created_at", "updated_at"]


class ObraConceptoSerializer(serializers.ModelSerializer):
    etapa_nombre = serializers.CharField(source="etapa.nombre", read_only=True)

    class Meta:
        model = ObraConcepto
        fields = [
            "id_concepto",
            "etapa",
            "etapa_nombre",
            "numero",
            "descripcion",
            "maestro",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_concepto", "created_at", "updated_at"]


class ObraLoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObraLote
        fields = [
            "id_lote",
            "proyecto",
            "obra",
            "lugar",
            "ciudad",
            "manzana",
            "numero_lote",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_lote", "created_at", "updated_at"]


class ObraEstimacionSerializer(serializers.ModelSerializer):
    """`total_porcentaje` es el acumulado de todas las estimaciones del
    mismo concepto+lote hasta llegar a 1 (100%) - se calcula en el
    ViewSet.perform_create (ver views.py), no aqui, para poder validar el
    tope de 1 antes de guardar."""

    concepto_descripcion = serializers.CharField(source="concepto.descripcion", read_only=True)
    lote_numero = serializers.CharField(source="lote.numero_lote", read_only=True)

    class Meta:
        model = ObraEstimacion
        fields = [
            "id_estimacion",
            "concepto",
            "concepto_descripcion",
            "lote",
            "lote_numero",
            "numero_estimacion",
            "porcentaje",
            "fecha_captura",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_estimacion", "numero_estimacion", "created_at", "updated_at"]


class ObraEvidenciaSerializer(serializers.ModelSerializer):
    """`link_drive` se captura a mano (URL pegada) mientras no exista la
    Unidad compartida de Drive para Obra - ver docstring del modelo."""

    concepto_descripcion = serializers.CharField(source="concepto.descripcion", read_only=True)
    lote_numero = serializers.CharField(source="lote.numero_lote", read_only=True)

    class Meta:
        model = ObraEvidencia
        fields = [
            "id_evidencia",
            "concepto",
            "concepto_descripcion",
            "lote",
            "lote_numero",
            "link_drive",
            "fecha_captura",
            "revisado",
            "revisado_por",
            "revisado_en",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_evidencia", "revisado", "revisado_por", "revisado_en", "created_at", "updated_at"]


class ObraCorteSemanalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObraCorteSemanal
        fields = [
            "id_corte",
            "proyecto",
            "fecha_corte",
            "semana_de_fase",
            "estado",
            "aprobado_por",
            "aprobado_en",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_corte", "estado", "aprobado_por", "aprobado_en", "created_at", "updated_at"]


class ObraCorteSemanalDetalleSerializer(serializers.ModelSerializer):
    """Snapshot congelado al aprobar el corte - de solo lectura, se crea
    unicamente desde ObraCorteSemanalViewSet.aprobar(), nunca via POST
    directo (ver views.py)."""

    concepto_numero = serializers.CharField(source="concepto.numero", read_only=True)
    concepto_descripcion = serializers.CharField(source="concepto.descripcion", read_only=True)
    lote_numero = serializers.CharField(source="lote.numero_lote", read_only=True)

    class Meta:
        model = ObraCorteSemanalDetalle
        fields = [
            "id_detalle",
            "corte",
            "concepto",
            "concepto_numero",
            "concepto_descripcion",
            "lote",
            "lote_numero",
            "porcentaje_acumulado",
            "created_at",
        ]
        read_only_fields = fields
