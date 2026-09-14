from rest_framework import serializers

from .models import (
    ConceptoPresupuesto,
    EvidenciaRecepcion,
    ManoObraCatalogo,
    MaterialCatalogo,
    Presupuesto,
    PresupuestoFirma,
    Requisicion,
    RequisicionLinea,
    SolicitudMaterial,
)


class MaterialCatalogoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialCatalogo
        fields = [
            "id_material",
            "material",
            "unidad_medida",
            "cantidad_disponible",
            "precio_unitario",
            "proveedor",
            "cotizacion_fecha_vigencia",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_material", "created_at", "updated_at"]


class ManoObraCatalogoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ManoObraCatalogo
        fields = [
            "id_mano_obra",
            "etapa_constructiva",
            "descripcion",
            "costo_unitario",
            "unidad_medida",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_mano_obra", "created_at", "updated_at"]


class PresupuestoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presupuesto
        fields = [
            "id_presupuesto",
            "proyecto",
            "denominacion",
            "estado",
            "monto_total",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_presupuesto", "created_at", "updated_at"]


class ConceptoPresupuestoSerializer(serializers.ModelSerializer):
    material_nombre = serializers.CharField(source="material.material", read_only=True)
    mano_obra_descripcion = serializers.CharField(source="mano_obra.descripcion", read_only=True)

    class Meta:
        model = ConceptoPresupuesto
        fields = [
            "id_concepto",
            "presupuesto",
            "etapa_constructiva",
            "concepto",
            "material",
            "material_nombre",
            "mano_obra",
            "mano_obra_descripcion",
            "cantidad",
            "precio_unitario",
            "importe",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_concepto", "created_at", "updated_at"]


class PresupuestoFirmaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresupuestoFirma
        fields = [
            "id_firma",
            "presupuesto",
            "firmante",
            "cargo",
            "fecha",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_firma", "created_at", "updated_at"]


class SolicitudMaterialSerializer(serializers.ModelSerializer):
    """`estado`/`fecha_entrega` son de solo lectura aqui - se cambian via
    las acciones dedicadas (entregar/rechazar en el ViewSet), no con un
    PATCH directo, mismo criterio de segregacion captura/decision que
    ObraCorteSemanal.aprobar en obra-service.

    La solicitud es SOLO para pedir contra lo que ya hay en almacen
    (decision de Mariana 21/Ago/2026: "es para pedir del que hay", no una
    requisicion de compra) - por eso valida aqui que no se pida mas de lo
    disponible; el descuento real al entregar vive en
    SolicitudMaterialViewSet.entregar."""

    material_nombre = serializers.CharField(source="material.material", read_only=True)
    tiene_evidencia = serializers.SerializerMethodField()

    class Meta:
        model = SolicitudMaterial
        fields = [
            "id_solicitud",
            "proyecto",
            "material",
            "material_nombre",
            "cantidad_solicitada",
            "solicitado_por",
            "estado",
            "fecha_solicitud",
            "fecha_entrega",
            "comentarios",
            "tiene_evidencia",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_solicitud", "estado", "fecha_solicitud", "fecha_entrega", "created_at", "updated_at"]

    def get_tiene_evidencia(self, obj):
        # Para pintar el icono de la bitacora en el frontend (verde/rojo,
        # pedido de Mariana 21/Ago/2026) - al menos una foto capturada.
        return obj.evidencias.exclude(link_drive__isnull=True).exclude(link_drive="").exists()

    def validate(self, attrs):
        material = attrs.get("material") or getattr(self.instance, "material", None)
        cantidad = attrs.get("cantidad_solicitada")
        if material is not None and cantidad is not None and cantidad > material.cantidad_disponible:
            raise serializers.ValidationError(
                {
                    "cantidad_solicitada": (
                        f"Solo hay {material.cantidad_disponible} {material.unidad_medida} disponibles de "
                        f"'{material.material}' en almacén."
                    )
                }
            )
        return attrs


class RequisicionLineaSerializer(serializers.ModelSerializer):
    material_nombre = serializers.CharField(source="material.material", read_only=True)

    class Meta:
        model = RequisicionLinea
        fields = [
            "id_linea",
            "requisicion",
            "concepto",
            "concepto_nombre",
            "material",
            "material_nombre",
            "cantidad_por_vivienda",
            "cantidad_total",
            "precio_unitario",
            "importe",
            "proveedor_cotizacion",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_linea", "created_at", "updated_at"]


class RequisicionSerializer(serializers.ModelSerializer):
    """`estado`/`folio`/las 3 firmas son de solo lectura via API directa -
    se cambian con las acciones dedicadas del ViewSet (validar/autorizar/
    rechazar), mismo criterio de segregacion captura/decision que
    SolicitudMaterial. Las lineas (snapshot de ConceptoPresupuesto) se
    generan solas al crear, no se mandan en el POST - ver
    RequisicionViewSet.perform_create."""

    lineas = RequisicionLineaSerializer(many=True, read_only=True)
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)

    class Meta:
        model = Requisicion
        fields = [
            "id_requisicion",
            "folio",
            "proyecto",
            "presupuesto",
            "etapa_constructiva",
            "empresa",
            "responsable",
            "num_viviendas",
            "presupuesto_asignado",
            "estado",
            "estado_label",
            "solicito_por",
            "valido_por",
            "autorizo_compra_por",
            "comentarios",
            "lineas",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id_requisicion",
            "folio",
            "presupuesto_asignado",
            "estado",
            "solicito_por",
            "valido_por",
            "autorizo_compra_por",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]


class EvidenciaRecepcionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenciaRecepcion
        fields = [
            "id_evidencia",
            "solicitud",
            "link_drive",
            "fecha",
            "hora",
            "registrado_por",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_evidencia", "created_at", "updated_at"]
