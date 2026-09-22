from rest_framework import serializers

from .models import (
    ConceptoPresupuesto,
    EvidenciaRecepcion,
    ManoObraCatalogo,
    MaterialCatalogo,
    MaterialesNotificacion,
    Presupuesto,
    PresupuestoFirma,
    Requisicion,
    RequisicionLinea,
    RequisicionObra,
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
            "obra",
            "denominacion",
            "estado",
            "monto_total",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        # created_by/updated_by de solo lectura (18/Sep/2026) - los rellena
        # PresupuestoViewSet.perform_create/actor, no el cliente; si se
        # dejan como campo normal, ModelSerializer los marca required=True
        # (CharField sin blank=True) y el POST del frontend truena en
        # validacion ANTES de llegar a perform_create, mismo bug que ya
        # tenia RequisicionViewSet resuelto (ver su serializer arriba).
        read_only_fields = ["id_presupuesto", "created_at", "created_by", "updated_at", "updated_by"]


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

    La solicitud es SOLO para pedir contra lo que ya hay en almacen,
    no una requisicion de compra - por eso valida aqui que no se pida mas de lo
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
        # Para pintar el icono de la bitacora en el frontend (verde/rojo) -
        # al menos una foto capturada.
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
    class Meta:
        model = RequisicionLinea
        fields = [
            "id_linea",
            "requisicion",
            "material",
            "material_nombre",
            "cantidad_total",
            "precio_unitario",
            "importe",
            "proveedor_cotizacion",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = fields


class RequisicionObraSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequisicionObra
        fields = ["id_requisicion_obra", "requisicion", "obra"]
        read_only_fields = fields


class RequisicionSerializer(serializers.ModelSerializer):
    """`estado`/`folio`/las 3 firmas son de solo lectura via API directa -
    se cambian con las acciones dedicadas del ViewSet (validar/autorizar/
    rechazar), mismo criterio de segregacion captura/decision que
    SolicitudMaterial. Las lineas (agregado de Material entre Obras) se
    generan solas al crear, no se mandan en el POST - ver
    RequisicionViewSet.perform_create.

    `obras` (18/Sep/2026, rediseño) es write-only: lista de id_lote de
    obra-service a incluir - no es un campo real del modelo, lo consume
    perform_create para crear RequisicionObra y agregar las lineas. La
    lectura de las Obras incluidas es via `obras_incluidas`."""

    lineas = RequisicionLineaSerializer(many=True, read_only=True)
    obras_incluidas = RequisicionObraSerializer(many=True, read_only=True, source="obras")
    obras = serializers.ListField(child=serializers.CharField(max_length=8), write_only=True)
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)

    class Meta:
        model = Requisicion
        fields = [
            "id_requisicion",
            "folio",
            "proyecto",
            "obras",
            "obras_incluidas",
            "etapa_constructiva",
            "empresa",
            "responsable",
            "presupuesto_asignado",
            "estado",
            "estado_label",
            "solicito_por",
            "valido_por",
            "autorizo_compra_por",
            "id_solicitud_compra",
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
            "id_solicitud_compra",
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


class MaterialesNotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaterialesNotificacion
        fields = ["id_notificacion", "destinatario", "tipo", "mensaje", "link_url", "leida", "created_at"]
        read_only_fields = ["id_notificacion", "destinatario", "tipo", "mensaje", "link_url", "created_at"]
