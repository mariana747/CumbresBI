import re

from rest_framework import serializers

from .models import (
    PldContraparteDoc,
    PldContraparteKyc,
    PldRepresentanteLegal,
    PldSolicitudEliminacionDoc,
    PldTicketCliente,
)


class PldRepresentanteLegalSerializer(serializers.ModelSerializer):
    """Representante legal / apoderado de una contraparte Moral (02/Sep/2026,
    ver PldRepresentanteLegal en models.py)."""

    class Meta:
        model = PldRepresentanteLegal
        fields = [
            "id_representante",
            "kyc",
            "tipo",
            "es_principal_del_tramite",
            "es_beneficiario_controlador",
            "porcentaje_participacion",
            "nombre_completo",
            "rfc",
            "curp",
            "tipo_identificacion",
            "numero_identificacion",
            "autoridad_identificacion",
            "poder_numero_escritura",
            "poder_notario_nombre",
            "poder_notario_numero",
            "poder_fecha_escritura",
            "poder_facultades",
            "poder_vigente",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate(self, attrs):
        # Mismos patrones (no oficiales al 100%, ver aviso en
        # PldContraparteKycSerializer.validate) que el titular del
        # expediente - un representante legal es siempre persona fisica,
        # su RFC es de 13 caracteres.
        rfc = attrs.get("rfc")
        if rfc and not re.fullmatch(r"[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}", rfc.upper()):
            raise serializers.ValidationError(
                {"rfc": ["RFC con formato inválido (verifica longitud y homoclave)."]}
            )
        curp = attrs.get("curp")
        if curp and not re.fullmatch(r"[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d", curp.upper()):
            raise serializers.ValidationError({"curp": ["CURP con formato inválido (deben ser 18 caracteres)."]})

        porcentaje = attrs.get("porcentaje_participacion")
        if porcentaje is not None and not (0 <= porcentaje <= 100):
            raise serializers.ValidationError(
                {"porcentaje_participacion": ["Debe ser un porcentaje entre 0 y 100."]}
            )
        return attrs


class PldContraparteDocSerializer(serializers.ModelSerializer):
    # Solo lectura, calculado (04/Sep/2026, ver PldContraparteDoc en
    # models.py) - None si no hay vigencia_meses definida o el documento no
    # se ha entregado todavia.
    fecha_vencimiento_documento = serializers.DateField(read_only=True)
    vencido = serializers.BooleanField(read_only=True)

    class Meta:
        model = PldContraparteDoc
        fields = [
            "id_kyc_doc",
            "kyc",
            "tipo_documento",
            "denominacion",
            "detalles_adicionales",
            "status",
            "obligatorio",
            "vigencia_meses",
            "fecha_vencimiento_documento",
            "vencido",
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
            "nombre",
            "apellido_paterno",
            "apellido_materno",
            "tipo_persona",
            "categoria_cumplimiento",
            "categoria_cumplimiento_manual",
            "fecha_nac_const",
            "pais_nac_const",
            "folio_mercantil",
            "objeto_social",
            "curp",
            "rfc",
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
            # categoria_cumplimiento_manual (04/Sep/2026): mismo criterio que
            # estado_llenado_manual arriba - se prende solo en update() al
            # detectar que llego categoria_cumplimiento en el PATCH, nunca a
            # mano.
            "categoria_cumplimiento_manual",
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

    def validate(self, attrs):
        # Codigo postal a 5 digitos numericos (02/Sep/2026, pedido explicito
        # del checklist de cumplimiento: "agregar una regla de validacion
        # para forzar que el campo Codigo Postal acepte exclusivamente 5
        # digitos numericos") - aplica a los 2 campos de CP del expediente
        # (domicilio y domicilio de correspondencia, ambos opcionales - solo
        # se valida el formato si SI llega un valor, no se vuelve
        # obligatorio de la nada).
        for campo in ("dom_cp", "dom_corresp_dom_cp"):
            valor = attrs.get(campo)
            if valor and not re.fullmatch(r"\d{5}", valor):
                raise serializers.ValidationError({campo: ["Debe ser un código postal de 5 dígitos numéricos."]})

        # Colonia no puede ser solo numeros (02/Sep/2026, pedido explicito:
        # "en domicilio, colonia no puede ser numeros") - hallazgo real:
        # alguien puede escribir el CP por error en este campo en vez del
        # nombre real de la colonia. No se prohiben numeros del todo (hay
        # colonias reales con numeros en el nombre, ej. "20 de Noviembre",
        # "Unidad Habitacional FOVISSSTE 2") - solo se rechaza si el valor
        # entero son puros digitos, sin ninguna letra.
        for campo in ("dom_colonia", "dom_corresp_dom_colonia"):
            valor = attrs.get(campo)
            if valor and re.fullmatch(r"\d+", valor.strip()):
                raise serializers.ValidationError(
                    {campo: ["La colonia no puede ser solo números - escribe el nombre real."]}
                )

        # RFC/CURP con estructura real (02/Sep/2026, pedido explicito del
        # checklist de cumplimiento: "Requerir de forma obligatoria el RFC
        # con homoclave (13 caracteres)... y la CURP (18 caracteres),
        # validando su estructura"). AVISO: son patrones razonables, no el
        # validador oficial completo del SAT/RENAPO (ese exige ademas
        # verificar contra un digito verificador real y una lista cerrada
        # de codigos de entidad federativa) - esto atrapa errores de
        # formato obvios (longitud, caracteres invalidos, fecha/genero
        # imposibles), no sustituye una validacion oficial real.
        #
        # Solo se valida el FORMATO si SI llega un valor - "obligatorio"
        # (bloquear el guardado sin el dato) se aplica en el formulario
        # (frontend), no aqui, mismo criterio que el resto de "datos del
        # cliente" en un expediente de alta autonoma (Opcion B).
        tipo_persona = attrs.get("tipo_persona", getattr(self.instance, "tipo_persona", None))
        rfc = attrs.get("rfc")
        if rfc:
            if tipo_persona == "moral":
                patron_rfc = r"[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}"
            elif tipo_persona == "fisica":
                patron_rfc = r"[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}"
            else:
                # Fideicomiso/sin elegir todavia - acepta cualquiera de los
                # 2 formatos (12 o 13 caracteres).
                patron_rfc = r"[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}"
            if not re.fullmatch(patron_rfc, rfc.upper()):
                raise serializers.ValidationError(
                    {"rfc": ["RFC con formato inválido (verifica longitud y homoclave)."]}
                )

        curp = attrs.get("curp")
        if curp and not re.fullmatch(r"[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d", curp.upper()):
            raise serializers.ValidationError({"curp": ["CURP con formato inválido (deben ser 18 caracteres)."]})

        return attrs

    def update(self, instance, validated_data):
        # Workflow hibrido (docs/architecture/pld-fase2-alcance.md sec. 3,
        # ver pld/signals.py): si el analista edita estado_llenado a mano
        # (via PATCH normal, no confirmar_extraccion ni la accion de
        # aprobar), a partir de ahi deja de recalcularse automatico segun
        # los documentos - se marca aqui, en el unico lugar donde
        # estado_llenado_manual se prende.
        if "estado_llenado" in validated_data:
            validated_data["estado_llenado_manual"] = True
        # Mismo patron hibrido (04/Sep/2026) para categoria_cumplimiento -
        # ver PldContraparteKyc.save() en models.py: si el analista lo edita
        # a mano (reclasificar un "caso raro" fideicomiso/tipo_persona
        # vacio), deja de recalcularse solo cada vez que cambie tipo_persona.
        if "categoria_cumplimiento" in validated_data:
            validated_data["categoria_cumplimiento_manual"] = True
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
