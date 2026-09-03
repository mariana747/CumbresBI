from rest_framework import serializers

from .models import (
    Cotizacion,
    CotizacionLinea,
    OrdenCompra,
    OrdenCompraLinea,
    Recepcion,
    RecepcionLinea,
    SolicitudCompra,
)


class CotizacionLineaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CotizacionLinea
        fields = ["id_linea", "descripcion", "cantidad", "precio_unitario", "importe"]
        read_only_fields = ["id_linea"]


class CotizacionSerializer(serializers.ModelSerializer):
    """`lineas` es de solo lectura via el CRUD normal - se reemplazan
    completas via CotizacionViewSet.confirmar_extraccion (mismo criterio
    que RequisicionSerializer.lineas en materiales-service)."""

    lineas = CotizacionLineaSerializer(many=True, read_only=True)
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)

    class Meta:
        model = Cotizacion
        fields = [
            "id_cotizacion",
            "solicitud",
            "proveedor",
            "proveedor_nombre",
            "proveedor_rfc",
            "fecha_cotizacion",
            "vigencia_dias",
            "moneda",
            "subtotal",
            "iva",
            "total",
            "link_drive",
            "estado",
            "estado_label",
            "comentarios",
            "lineas",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id_cotizacion",
            "estado",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]


class SolicitudCompraSerializer(serializers.ModelSerializer):
    cotizaciones = CotizacionSerializer(many=True, read_only=True)
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)

    class Meta:
        model = SolicitudCompra
        fields = [
            "id_solicitud",
            "proyecto",
            "requisicion",
            "descripcion",
            "estado",
            "estado_label",
            "solicitado_por",
            "comentarios",
            "cotizaciones",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id_solicitud",
            "estado",
            "solicitado_por",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]


class OrdenCompraLineaSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrdenCompraLinea
        fields = [
            "id_linea",
            "descripcion",
            "cantidad",
            "cantidad_recibida",
            "precio_unitario",
            "importe",
        ]
        read_only_fields = ["id_linea", "cantidad_recibida"]


class OrdenCompraSerializer(serializers.ModelSerializer):
    """`folio`/`estado`/las lineas son de solo lectura via API directa - la
    orden se genera completa con OrdenCompraViewSet.generar_desde_cotizacion,
    mismo criterio de segregacion captura/decision que RequisicionSerializer."""

    lineas = OrdenCompraLineaSerializer(many=True, read_only=True)
    estado_label = serializers.CharField(source="get_estado_display", read_only=True)

    class Meta:
        model = OrdenCompra
        fields = [
            "id_orden",
            "folio",
            "proyecto",
            "solicitud",
            "cotizacion",
            "proveedor",
            "proveedor_nombre",
            "fecha_orden",
            "monto_total",
            "estado",
            "estado_label",
            "autorizado_por",
            "comentarios",
            "lineas",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id_orden",
            "folio",
            "proveedor",
            "proveedor_nombre",
            "fecha_orden",
            "monto_total",
            "estado",
            "created_at",
            "updated_at",
        ]


class RecepcionLineaSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecepcionLinea
        fields = ["id_linea", "orden_linea", "cantidad_recibida"]
        read_only_fields = ["id_linea"]


class RecepcionSerializer(serializers.ModelSerializer):
    """`lineas` es de solo lectura via este serializer (el ModelSerializer
    anidado normal no sabe crear las lineas ni acumular cantidad_recibida
    en OrdenCompraLinea) - RecepcionViewSet.create las lee de
    request.data["lineas"] directo y hace la validacion/acumulacion a
    mano (ver ese metodo)."""

    lineas = RecepcionLineaSerializer(many=True, read_only=True)

    class Meta:
        model = Recepcion
        fields = [
            "id_recepcion",
            "orden",
            "fecha",
            "hora",
            "recibido_por",
            "link_drive",
            "comentarios",
            "lineas",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id_recepcion",
            "recibido_por",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
