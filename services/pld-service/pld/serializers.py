from rest_framework import serializers

from .models import PldContraparteDoc, PldContraparteKyc, PldTicketCliente


class PldContraparteDocSerializer(serializers.ModelSerializer):
    class Meta:
        model = PldContraparteDoc
        fields = [
            "id_kyc_doc",
            "kyc",
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
        read_only_fields = ["id_kyc_doc", "created_at", "updated_at"]


class PldContraparteKycSerializer(serializers.ModelSerializer):
    """Expediente KYC (Fase 2, Semana 7). documentos es de solo lectura aqui
    - se administran via PldContraparteDocViewSet, filtrando por ?kyc=<id>."""

    documentos = PldContraparteDocSerializer(many=True, read_only=True)

    class Meta:
        model = PldContraparteKyc
        fields = [
            "id_kyc",
            "id_contraparte",
            "fecha_nac_const",
            "pais_nac_const",
            "folio_mercantil",
            "objeto_social",
            "curp",
            "nacionalidad",
            "ocupacion_act_economica",
            "dom_calle",
            "dom_numero_ext",
            "dom_numero_int",
            "dom_colonia",
            "dom_municipio_alcaldia",
            "dom_estado",
            "dom_cp",
            "dom_pais",
            "tipo_identificacion",
            "autoridad_identificacion",
            "numero_identificacion",
            "dom_corresp_dom_calle",
            "dom_corresp_dom_numero_ext",
            "dom_corresp_dom_numero_int",
            "dom_corresp_dom_colonia",
            "dom_corresp_dom_municipio_alcaldia",
            "dom_corresp_dom_estado",
            "dom_corresp_dom_cp",
            "dom_corresp_dom_pais",
            "telefono_fijo",
            "telefono_sms",
            "estado_civil",
            "ident_fideicomiso",
            "link_carpeta",
            "link_plantillas",
            "link_documento_pld",
            "estado_llenado",
            "aprobado_por",
            "aprobado_en",
            "comentarios",
            "documentos",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
            "fecha_vencimiento",
        ]
        read_only_fields = ["id_kyc", "aprobado_por", "aprobado_en", "created_at", "updated_at"]


class PldTicketClienteSerializer(serializers.ModelSerializer):
    """Magic link de KYC externo (Fase 2, Semana 9 del plan). token_hash
    nunca se expone via API - se genera y regresa una unica vez, en claro,
    al crear el ticket (ver PldTicketClienteViewSet.perform_create)."""

    class Meta:
        model = PldTicketCliente
        fields = [
            "id_pld_ticket",
            "kyc",
            "email",
            "issued_at",
            "issued_by",
            "expires_at",
            "max_uses",
            "uses_count",
            "first_used_at",
            "last_used_at",
            "revoked_at",
        ]
        read_only_fields = [
            "id_pld_ticket",
            "issued_at",
            "uses_count",
            "first_used_at",
            "last_used_at",
            "revoked_at",
        ]
