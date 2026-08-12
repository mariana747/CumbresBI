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
            "drive_file_id",
            "mime_type",
            "tamano_bytes",
            "subido_en",
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
        # drive_file_id/mime_type/tamano_bytes/subido_en/link_documento se
        # llenan via la accion subir() (ver views.py), nunca a mano en
        # create/update directo - el archivo real es la fuente de verdad.
        read_only_fields = [
            "id_kyc_doc",
            "created_at",
            "updated_at",
            "link_documento",
            "drive_file_id",
            "mime_type",
            "tamano_bytes",
            "subido_en",
        ]


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
            "estado_llenado_manual",
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
        # estado_llenado_manual NO esta aqui a proposito: no se expone para
        # setear directo, solo se prende solo (ver update() abajo) cuando el
        # analista edita estado_llenado a mano, o se apaga via la accion
        # reactivar_auto_estado (views.py) - nunca por PATCH directo.
        read_only_fields = [
            "id_kyc",
            "estado_llenado_manual",
            "aprobado_por",
            "aprobado_en",
            "created_at",
            "updated_at",
        ]

    def update(self, instance, validated_data):
        # Workflow hibrido (docs/architecture/pld-fase2-alcance.md sec. 3,
        # ver pld/signals.py): si el analista edita estado_llenado a mano
        # (via PATCH normal, no confirmar_extraccion ni la accion de
        # aprobar), a partir de ahi deja de recalcularse automatico segun
        # los documentos - se marca aqui, en el unico lugar donde
        # estado_llenado_manual se prende.
        if "estado_llenado" in validated_data:
            validated_data["estado_llenado_manual"] = True
        return super().update(instance, validated_data)


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
