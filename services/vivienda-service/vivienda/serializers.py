from rest_framework import serializers

from .models import (
    ViviendaListado,
    ViviendaProyecto,
    ViviendaRelExpedienteCliente,
    ViviendaVentasAsesor,
    ViviendaVentasExpediente,
    ViviendaVentasExpedienteItem,
)


class ViviendaProyectoSerializer(serializers.ModelSerializer):
    """Proyecto de vivienda (Fase 3, arranque de exposicion CRUD 19/Ago/2026).
    `propietario` se queda como CharField plano (referencia laxa a
    general_sociedades.rfc, ver models.py) - mismo criterio que
    TesoreriaContrato.sociedad, sin ScopedManager todavia (queda pendiente
    declarar SCOPE_FIELD_PROYECTO/SOCIEDAD aqui, ver
    docs/CumbresBI_estado.md linea 168)."""

    class Meta:
        model = ViviendaProyecto
        fields = [
            "id_proyecto",
            "alias_proyecto",
            "denominacion",
            "propietario",
            "dom_calle",
            "dom_numero_ext",
            "dom_numero_int",
            "dom_colonia",
            "dom_municipio_alcaldia",
            "dom_estado",
            "dom_cp",
            "dom_pais",
            "link_carpeta",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_proyecto", "created_at", "updated_at"]


class ViviendaListadoSerializer(serializers.ModelSerializer):
    """Catalogo de unidades de un proyecto (m2, precio, disponibilidad)."""

    proyecto_denominacion = serializers.CharField(source="proyecto.denominacion", read_only=True)

    class Meta:
        model = ViviendaListado
        fields = [
            "id_vivienda",
            "proyecto",
            "proyecto_denominacion",
            "num_oficial",
            "denominacion",
            "etapa",
            "tipo",
            "modelo",
            "torre",
            "mz",
            "lote",
            "piso",
            "habitaciones",
            "sup_terreno_m2",
            "sup_const_m2",
            "frente_m2",
            "fondo_m2",
            "terraza_m2",
            "balcones_m2",
            "bodega_m2",
            "cajones_est",
            "precio_lista",
            "disponible",
            "muestra",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_vivienda", "created_at", "updated_at"]


class ViviendaVentasAsesorSerializer(serializers.ModelSerializer):
    """Catalogo de asesores de venta y su % de comision."""

    class Meta:
        model = ViviendaVentasAsesor
        fields = [
            "id_asesor",
            "nombre",
            "telefono_sms",
            "email",
            "contacto",
            "persona_moral",
            "razon_social",
            "porc_comision",
            "rfc_afiliacion",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_asesor", "created_at", "updated_at"]


class ViviendaVentasExpedienteSerializer(serializers.ModelSerializer):
    """Expediente de venta (vivienda + asesor + contrato de tesoreria).
    `id_contrato` se queda como CharField plano (referencia laxa a
    tesoreria_contratos.id_contrato, servicio distinto, ver models.py)."""

    vivienda_denominacion = serializers.CharField(source="vivienda.denominacion", read_only=True)
    asesor_nombre = serializers.CharField(source="asesor.nombre", read_only=True)

    class Meta:
        model = ViviendaVentasExpediente
        fields = [
            "id_expediente",
            "vivienda",
            "vivienda_denominacion",
            "asesor",
            "asesor_nombre",
            "id_contrato",
            "estado",
            "fecha_cierre",
            "link_expediente",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_expediente", "created_at", "updated_at"]


class ViviendaRelExpedienteClienteSerializer(serializers.ModelSerializer):
    """Datos del cliente/acreditado (empleo, ingresos, referencias) ligado
    a un expediente. `id_contraparte` se queda como CharField plano
    (referencia laxa a tesoreria_contrapartes.id_contraparte, servicio
    distinto, ver models.py)."""

    class Meta:
        model = ViviendaRelExpedienteCliente
        fields = [
            "id_rel_viv_exp_cliente",
            "expediente",
            "id_contraparte",
            "tipo",
            "emp_razon_social",
            "emp_contacto_empleador",
            "emp_telefono_empleador",
            "emp_email_empleador",
            "emp_antiguedad_anos",
            "emp_antiguedad_meses",
            "emp_dom_calle",
            "emp_dom_colonia",
            "emp_dom_cp",
            "emp_dom_estado",
            "emp_dom_municipio_alcaldia",
            "emp_dom_numero_ext",
            "emp_dom_numero_int",
            "emp_puesto",
            "nss",
            "dependientes_econ",
            "ingreso_men_honorarios",
            "ingreso_men_nomina",
            "ingreso_men_otros",
            "nombre_referencia",
            "email_referencia",
            "telefono_referencia",
            "tipo_credito_prin",
            "tipo_credito_sec",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_rel_viv_exp_cliente", "created_at", "updated_at"]


class ViviendaVentasExpedienteItemSerializer(serializers.ModelSerializer):
    """Checklist de documentos de un expediente (status pendiente/incompleto
    /entregado/aprobado)."""

    class Meta:
        model = ViviendaVentasExpedienteItem
        fields = [
            "id_item",
            "expediente",
            "denominacion",
            "detalles_adicionales",
            "status",
            "link_documento",
            "fecha_solicitud",
            "fecha_limite",
            "fecha_entrega",
            "fecha_cierre",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_item", "created_at", "updated_at"]
