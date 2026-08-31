from rest_framework import serializers

from .models import PldContraparteDoc, PldContraparteKyc, PldSolicitudEliminacionDoc, PldTicketCliente


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


class PldSolicitudEliminacionDocSerializer(serializers.ModelSerializer):
    # 25/Ago/2026 (notificacion en la campana de AppShell, Admin) - el
    # frontend necesita saber a que expediente ir sin tener que resolver
    # documento->kyc por su cuenta. Solo valido mientras "documento" siga
    # ahi (siempre el caso para una solicitud PENDIENTE, que es la unica
    # que le importa a la campana) - None despues de aprobar (SET_NULL).
    documento_kyc = serializers.SerializerMethodField()

    def get_documento_kyc(self, obj):
        return obj.documento.kyc_id if obj.documento else None

    class Meta:
        model = PldSolicitudEliminacionDoc
        fields = [
            "id_solicitud",
            "documento",
            "documento_kyc",
            "denominacion_doc",
            "razon",
            "estado",
            "solicitado_por",
            "solicitado_en",
            "resuelto_por",
            "resuelto_en",
            "comentario_resolucion",
        ]
        # estado/resuelto_por/resuelto_en/comentario_resolucion solo los
        # escriben aprobar()/rechazar() (ver views.py), nunca un PATCH
        # directo - el analista que crea la solicitud no puede resolverla
        # el mismo con un update generico. denominacion_doc se deriva sola
        # en perform_create (snapshot del documento real), el cliente no
        # la manda.
        read_only_fields = [
            "id_solicitud",
            "denominacion_doc",
            "estado",
            "solicitado_en",
            "resuelto_por",
            "resuelto_en",
            "comentario_resolucion",
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
            # 25/Ago/2026 (hallazgo real: el campo "Sociedad" del dialogo de
            # crear expediente en el frontend nunca funciono - mandaba
            # sociedad_rfc en el body, pero al no estar en esta lista de
            # fields, DRF lo ignoraba en silencio. Por eso los expedientes
            # de prueba tienen sociedad_rfc=NULL pese a que el analista si
            # lo lleno).
            "sociedad_rfc",
            # sociedad_nombre (25/Ago/2026) - snapshot de solo lectura, ver
            # comentario en models.py. Lo llena create() en views.py
            # (validado contra iam-service), nunca el cliente a mano.
            "sociedad_nombre",
            # 31/Ago/2026, mismo criterio que sociedad_rfc arriba - debe
            # estar en esta lista o DRF lo ignora en silencio al guardar.
            "proyecto",
            "nombre_completo",
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
            "estado_cuenta",
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
            "politicas_aceptadas_en",
            "veracidad_declarada_en",
        ]
        # estado_llenado_manual NO esta aqui a proposito: no se expone para
        # setear directo, solo se prende solo (ver update() abajo) cuando el
        # analista edita estado_llenado a mano, o se apaga via la accion
        # reactivar_auto_estado (views.py) - nunca por PATCH directo.
        read_only_fields = [
            "id_kyc",
            "estado_llenado_manual",
            "estado_cuenta",
            "aprobado_por",
            "aprobado_en",
            "created_at",
            "updated_at",
            # Consentimiento (25/Ago/2026) - de solo lectura a proposito, no
            # se pueden setear por PATCH normal (un analista no puede fingir
            # el consentimiento del cliente). Solo
            # PldTicketClienteViewSet.actualizar_datos los escribe, via
            # serializer.save(**kwargs) que si puede pisar read_only_fields.
            "politicas_aceptadas_en",
            "veracidad_declarada_en",
            # sociedad_nombre (25/Ago/2026) - se llena en create() (ver
            # views.py), nunca por PATCH directo.
            "sociedad_nombre",
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
