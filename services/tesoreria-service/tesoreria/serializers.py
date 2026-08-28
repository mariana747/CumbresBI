from rest_framework import serializers

from .models import (
    FacturaConcepto,
    FacturaDoctoRelacionado,
    FacturaNotaCredito,
    FacturaTraslado,
    TesoreriaBanco,
    TesoreriaComplementoPago,
    TesoreriaContraparte,
    TesoreriaContraparteRelacion,
    TesoreriaContrato,
    TesoreriaContratoDocumento,
    TesoreriaCorteEdc,
    TesoreriaCuenta,
    TesoreriaFactura,
    TesoreriaFlujo,
    TesoreriaNotaCredito,
    TesoreriaRecNomina,
    TesoreriaSaldo,
    TesoreriaTicketProveedor,
    TesoreriaTicketReembolso,
)


class TesoreriaContraparteSerializer(serializers.ModelSerializer):
    """Catalogo maestro de contrapartes (Fase 4, arranque formal 18/Ago/2026:
    docs/architecture/README.md sec. 11.2 #7 - "fusion definitiva", Contrapartes
    vive dentro de tesoreria-service, no un microservicio propio). Sin
    ScopedManager a proposito - el modelo no tiene columna de sociedad (es un
    catalogo compartido entre todas las sociedades, igual criterio que
    GeneralSociedad en iam-service), el filtro real es por permiso
    (tesoreria.crear/.editar), no por alcance de fila.

    `id_contraparte` es la PK real (autogenerada, uuid.hex[:8]) - es el mismo
    valor que en el futuro debe referenciar pld_contrapartes_kyc.id_contraparte
    en vez de generar el suyo propio (ver pld/models.py, comentario de
    "dueno real: contrapartes-service")."""

    # Declarado explicito (28/Ago/2026, bug encontrado en vivo) - el modelo
    # tiene editable=False en este campo (para que Django no lo muestre en
    # el admin/formularios automaticos), pero eso hace que ModelSerializer
    # lo marque read_only SIN IMPORTAR lo que diga Meta.read_only_fields -
    # el comentario de abajo (25/Ago/2026) decia que ya no era read_only,
    # pero solo se habia quitado de esa lista, nunca se corrigio la causa
    # real. Sin este override, el id que el frontend genera y muestra antes
    # de guardar (ver docstring de abajo) se descartaba en silencio y el
    # backend guardaba uno distinto (el default=_short_id del modelo).
    id_contraparte = serializers.CharField(max_length=8, required=False)

    class Meta:
        model = TesoreriaContraparte
        fields = [
            "id_contraparte",
            "rfc",
            "razon_social",
            "apellido_paterno",
            "apellido_materno",
            "tipo_persona",
            "genero",
            "contacto",
            "telefono_sms",
            "email",
            "cliente",
            "proveedor",
            "comentarios",
            "permiso",
            "autorizado_por",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        # id_contraparte YA NO es read_only (25/Ago/2026) - el modelo sigue
        # generandolo solo si el cliente no manda nada (default=_short_id,
        # ver models.py), pero ahora el frontend lo genera antes de abrir el
        # dialogo de alta y lo manda explicito, mismo patron que
        # TesoreriaSaldo.id (ver serializer de Saldo mas abajo) - asi la
        # pantalla puede mostrar el ID real desde antes de guardar, no un
        # ejemplo. Sin este cambio el campo se ignoraba en silencio en el
        # POST (DRF descarta valores de campos read_only) y el ID que se
        # veia en pantalla nunca coincidia con el que de verdad quedaba
        # guardado.
        read_only_fields = ["created_at", "updated_at"]


class TesoreriaBancoSerializer(serializers.ModelSerializer):
    """Catalogo de bancos (Banxico) - id_banxico es la PK real, capturada a
    mano (no autogenerada), mismo criterio que cualquier catalogo fijo."""

    class Meta:
        model = TesoreriaBanco
        fields = ["id_banxico", "banco", "alias", "created_at", "created_by", "updated_at", "updated_by"]
        read_only_fields = ["created_at", "updated_at"]


class TesoreriaCuentaSerializer(serializers.ModelSerializer):
    """Cuentas bancarias (Fase 4). `rfc_razon_social` se queda como texto
    libre (fiel al ERD heredado, ver models.py) - no FK real a
    TesoreriaContraparte todavia, es deuda tecnica documentada, no un
    descuido de este serializer."""

    banco_nombre = serializers.CharField(source="banco.banco", read_only=True)

    class Meta:
        model = TesoreriaCuenta
        fields = [
            "id_cuenta_bancaria",
            "rfc_razon_social",
            "sociedad",
            "tipo",
            "banco",
            "banco_nombre",
            "cuenta",
            "clabe",
            "alias",
            "label",
            "activa",
            "apertura",
            "cierre",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        # Ver comentario equivalente en TesoreriaContraparteSerializer -
        # id_cuenta_bancaria ya no es read_only, mismo motivo.
        read_only_fields = ["created_at", "updated_at"]


class TesoreriaContratoSerializer(serializers.ModelSerializer):
    """Contrato (Fase 4, tercer corte tras Contrapartes/Cuentas): une una
    Sociedad con una Contraparte - es el registro del que despues cuelgan
    Flujos y Facturas (docs/CumbresBI_estado.md, notas de Tesoreria).

    `id_contrato` se genera en el backend (ver views.py::perform_create),
    formato "{sociedad}-{id_contraparte}-{consecutivo de 3 digitos}"
    (decision de Mariana 18/Ago/2026) - NO es autogenerado por uuid como
    Contraparte/Cuenta, porque aqui si tiene valor de negocio ser legible
    (identifica sociedad+contraparte a simple vista).

    `sociedad` es CharField plano (referencia laxa a
    general_sociedades.rfc, ver models.py) - primer modelo de este servicio
    con ScopedManager real (SCOPE_FIELD_SOCIEDAD), a diferencia de los
    catalogos compartidos de arriba.

    proyecto/propiedad/centro/duracion/fecha_proyectada/concepto_factura/
    link_carpeta/permiso/autorizacion (25/Ago/2026): ya estaban en el
    modelo (ERD original) pero no en este serializer - mismo hallazgo que
    en TesoreriaFlujoSerializer. `label` (etiqueta compuesta que se ve en
    el AppSheet original) y un supuesto `autorizado_por` NO son columnas
    reales de esta tabla (confirmado contra el detalle real del AppSheet,
    25/Ago/2026) - no se agregan aqui."""

    contraparte_nombre = serializers.CharField(source="contraparte.razon_social", read_only=True)

    class Meta:
        model = TesoreriaContrato
        fields = [
            "id_contrato",
            "sociedad",
            "contraparte",
            "contraparte_nombre",
            "tipo",
            "fecha_generacion",
            "fecha_vencimiento",
            "proyecto",
            "propiedad",
            "centro",
            "tipo_pago",
            "frecuencia",
            "duracion",
            "fecha_proyectada",
            "moneda",
            "monto_periodo_iva_mxp",
            "monto_total_iva_mxp",
            "concepto_factura",
            "link_carpeta",
            "requiere_factura",
            "status",
            "comentarios",
            "link_contrato",
            "permiso",
            "autorizacion",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_contrato", "created_at", "updated_at"]


class TesoreriaContratoDocumentoSerializer(serializers.ModelSerializer):
    """Un renglon del checklist de documentos requeridos de un contrato. 
    `link_archivo`/`drive_file_id`
    son de solo lectura - se llenan via la accion `subir_archivo`
    (TesoreriaContratoDocumentoViewSet), mismo criterio que
    TesoreriaFlujoSerializer con link_comprobante_banco."""

    nombre_display = serializers.CharField(source="get_nombre_display", read_only=True)

    class Meta:
        model = TesoreriaContratoDocumento
        fields = [
            "id",
            "contrato",
            "nombre",
            "nombre_display",
            "obligatorio",
            "recibido",
            "link_archivo",
            "drive_file_id",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "link_archivo", "drive_file_id", "created_at", "updated_at"]


class TesoreriaFlujoSerializer(serializers.ModelSerializer):
    """Flujo de caja (Fase 4, Sem 21 del cronograma) - un movimiento real de
    dinero (ingreso o egreso: pago a proveedor, reembolso, nomina) ligado a
    un TesoreriaContrato. Primer corte: catalogos de facturas/complementos/
    nomina (CFDI) todavia no tienen CRUD propio (Sem 20, sin construir),
    asi que `factura`/`complemento`/`nomina` se exponen de solo lectura por
    ahora - se llenaran cuando exista esa pantalla, no a mano desde aqui.

    `autorizacion`/`autorizado_por`/`fecha_autorizacion` y `pagado`/
    `fecha_pago` los llenan las acciones `aprobar`/`registrar_pago` del
    ViewSet, no un PATCH directo - ver views.py. Mismo criterio que
    PldContraparteKycViewSet: "quien captura no aprueba"
    (docs/architecture/roles-y-permisos.md sec. 2).

    `estado_cfdi`/`requiere_complemento`/`comprobacion_asignada_a`/
    `aprobacion_lista`/`permiso_enviar_pago`/`informacion_envio`/
    `ultimo_envio`/`permiso`/`fecha_pago_original` son columnas heredadas
    del AppSheet original (20260727_Cumbres_ERD.sql) sin ninguna accion
    del ViewSet que las llene todavia - se dejan de escritura libre (igual
    que comentarios) hasta que exista esa automatizacion; por ahora las
    llena quien captura, en las pestañas Referencias/CFDI/Control del
    formulario de creacion (frontend/src/app/tesoreria/flujos/page.tsx)."""

    contrato_sociedad = serializers.CharField(source="contrato.sociedad", read_only=True, default=None)
    cuenta_alias = serializers.CharField(source="cuenta.alias", read_only=True)

    class Meta:
        model = TesoreriaFlujo
        fields = [
            "id_flujo",
            "contrato",
            "contrato_sociedad",
            "id_empleado",
            "id_requisicion",
            "fecha_efectiva",
            "concepto",
            "reembolso",
            "id_empleado_reembolso",
            "cuenta",
            "cuenta_alias",
            "total_mxp",
            "autorizacion",
            "autorizado_por",
            "fecha_autorizacion",
            "link_referencia",
            "pagado",
            "fecha_pago",
            "fecha_pago_original",
            "descripcion_pago",
            "link_comprobante_banco",
            "drive_file_id_comprobante",
            "factura",
            "complemento",
            "nomina",
            "estado_cfdi",
            "requiere_complemento",
            "comprobacion_asignada_a",
            "validacion_estado",
            "aprobacion_lista",
            "permiso_enviar_pago",
            "informacion_envio",
            "ultimo_envio",
            "permiso",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id_flujo",
            "autorizacion",
            "autorizado_por",
            "fecha_autorizacion",
            "pagado",
            "fecha_pago",
            "factura",
            "complemento",
            "nomina",
            "validacion_estado",
            "drive_file_id_comprobante",
            "created_at",
            "updated_at",
        ]


class FacturaConceptoSerializer(serializers.ModelSerializer):
    """Linea de una factura (Fase 4, Sem 20 del cronograma) - sin FK real
    hacia TesoreriaFactura en el ERD (uuid/rfc_propietario son referencias
    logicas de origen ETL, ver docstring del modelo); el filtro por
    ?uuid=<timbre_uuid> en el ViewSet es el unico enlace real."""

    class Meta:
        model = FacturaConcepto
        fields = [
            "id",
            "uuid",
            "clave_prod_serv",
            "no_identificacion",
            "cantidad",
            "clave_unidad",
            "unidad",
            "descripcion",
            "valor_unitario",
            "importe",
            "descuento",
            "objeto_imp",
            "rfc_propietario",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TesoreriaFacturaSerializer(serializers.ModelSerializer):
    """Factura CFDI recibida de un proveedor (Fase 4, Sem 20 del
    cronograma) - primer corte de encabezado, alta manual via API/
    formulario, mas el Motor Documental (24/Ago/2026, ver
    TesoreriaFacturaViewSet.confirmar_extraccion) para prellenar/actualizar
    esos mismos campos desde un PDF/XML ya analizado.

    `estado` es de solo lectura aqui a proposito - el ciclo de vida
    (PENDIENTE -> EN_PROCESO -> ACEPTADA/RECHAZADA, ver
    TesoreriaFactura.ESTADO_CHOICES) solo cambia via la accion
    marcar_estado(), que exige link_pdf+link_xml antes de aceptar. Sin este
    read_only, un PATCH normal podria saltarse esa validacion.

    conceptos expone las lineas reales (FacturaConcepto) filtradas por el
    mismo timbre_uuid - de solo lectura aqui, se administran via
    FacturaConceptoViewSet (?uuid=<timbre_uuid>), igual criterio que
    documentos/PldContraparteDocViewSet en pld-service."""

    conceptos = serializers.SerializerMethodField()
    contraparte_nombre = serializers.CharField(source="contraparte.razon_social", read_only=True)
    # Correo por defecto para envio masivo (26/Ago/2026, ver
    # TesoreriaFacturaViewSet.enviar_masivo) - el frontend lo usa para
    # prellenar el destinatario editable, no se manda automatico sin que el
    # usuario lo confirme en pantalla.
    contraparte_email = serializers.CharField(source="contraparte.email", read_only=True)

    class Meta:
        model = TesoreriaFactura
        fields = [
            "id",
            # contraparte (25/Ago/2026, "vista por proveedor") - de solo
            # lectura aqui: se llena automatico por RFC al crear/confirmar
            # extraccion (ver TesoreriaFacturaViewSet._vincular_contraparte),
            # no se captura a mano.
            "contraparte",
            "contraparte_nombre",
            "contraparte_email",
            "comprobante_version",
            "comprobante_serie",
            "comprobante_folio",
            "comprobante_fecha",
            "comprobante_forma_pago",
            "comprobante_no_certificado",
            "comprobante_sub_total",
            "comprobante_moneda",
            "comprobante_exportacion",
            "comprobante_tipo_cambio",
            "comprobante_total",
            "comprobante_tipo_de_comprobante",
            "comprobante_metodo_pago",
            "comprobante_lugar_expedicion",
            "tipo_relacion",
            "uuid_relacionado",
            "emisor_rfc",
            "emisor_nombre",
            "emisor_regimen_fiscal",
            "receptor_rfc",
            "receptor_nombre",
            "receptor_domicilio_fiscal_receptor",
            "receptor_regimen_fiscal_receptor",
            "receptor_uso_cfdi",
            "timbre_version",
            "timbre_uuid",
            "timbre_fecha_timbrado",
            "timbre_rfc_prov_certif",
            "timbre_no_certificado_sat",
            "tipo_factura",
            "link_pdf",
            "link_xml",
            "estado",
            "conceptos",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "contraparte", "estado", "created_at", "updated_at"]

    def get_conceptos(self, obj):
        conceptos = FacturaConcepto.objects.filter(uuid=obj.timbre_uuid)
        return FacturaConceptoSerializer(conceptos, many=True).data


class TesoreriaComplementoPagoSerializer(serializers.ModelSerializer):
    """CFDI complemento de pago - confirma fiscalmente que una factura a
    credito ya se pago. Mismo criterio de alta manual que TesoreriaFactura
    en este primer corte.

    version/no_certificado/lugar_expedicion/tipo_de_comprobante/
    exportacion, emisor_regimen_fiscal, receptor_domicilio_fiscal_receptor/
    regimen_fiscal_receptor/uso_cfdi, timbre_version/fecha_timbrado/
    rfc_prov_certif/no_certificado_sat (25/Ago/2026): mismo hallazgo que en
    Factura/Flujo/Contrato/NotaCredito - ya estaban en el modelo, faltaban
    aqui."""

    contraparte_nombre = serializers.CharField(source="contraparte.razon_social", read_only=True)

    class Meta:
        model = TesoreriaComplementoPago
        fields = [
            "id",
            # Ver comentario en TesoreriaFacturaSerializer - mismo criterio.
            "contraparte",
            "contraparte_nombre",
            "version",
            "timbre_uuid",
            "serie",
            "folio",
            "fecha",
            "no_certificado",
            "lugar_expedicion",
            "moneda",
            "tipo_de_comprobante",
            "exportacion",
            "sub_total",
            "total",
            "emisor_rfc",
            "emisor_nombre",
            "emisor_regimen_fiscal",
            "receptor_rfc",
            "receptor_nombre",
            "receptor_domicilio_fiscal_receptor",
            "receptor_regimen_fiscal_receptor",
            "receptor_uso_cfdi",
            "timbre_version",
            "timbre_fecha_timbrado",
            "timbre_rfc_prov_certif",
            "timbre_no_certificado_sat",
            "fecha_de_pago",
            "monto_pagado",
            "uuid_relacion",
            "tipo_factura",
            "link_pdf",
            "estado",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "contraparte", "created_at", "updated_at"]


class TesoreriaNotaCreditoSerializer(serializers.ModelSerializer):
    """Nota de credito - ajuste fiscal sobre una factura ya emitida
    (uuid_relacionado es FK real a TesoreriaFactura.timbre_uuid, a
    diferencia de ComplementoPago que solo trae el UUID en texto plano -
    asi esta declarado en el ERD/models.py).

    comprobante_version/forma_pago/no_certificado/sub_total/moneda/
    exportacion/tipo_cambio/tipo_de_comprobante/metodo_pago/
    lugar_expedicion, tipo_relacion, emisor_regimen_fiscal,
    receptor_domicilio_fiscal_receptor/regimen_fiscal_receptor/uso_cfdi,
    timbre_version/rfc_prov_certif/no_certificado_sat (25/Ago/2026): ya
    estaban en el modelo (encabezado CFDI completo, mismo patron que
    TesoreriaFactura) pero no en este serializer - mismo hallazgo que en
    Flujo/Contrato."""

    factura_folio = serializers.CharField(source="uuid_relacionado.comprobante_folio", read_only=True, default=None)
    contraparte_nombre = serializers.CharField(source="contraparte.razon_social", read_only=True)

    class Meta:
        model = TesoreriaNotaCredito
        fields = [
            "id",
            # Ver comentario en TesoreriaFacturaSerializer - mismo criterio.
            "contraparte",
            "contraparte_nombre",
            "comprobante_version",
            "comprobante_serie",
            "comprobante_folio",
            "comprobante_fecha",
            "comprobante_forma_pago",
            "comprobante_no_certificado",
            "comprobante_sub_total",
            "comprobante_moneda",
            "comprobante_exportacion",
            "comprobante_tipo_cambio",
            "comprobante_total",
            "comprobante_tipo_de_comprobante",
            "comprobante_metodo_pago",
            "comprobante_lugar_expedicion",
            "tipo_relacion",
            "uuid_relacionado",
            "factura_folio",
            "emisor_rfc",
            "emisor_nombre",
            "emisor_regimen_fiscal",
            "receptor_rfc",
            "receptor_nombre",
            "receptor_domicilio_fiscal_receptor",
            "receptor_regimen_fiscal_receptor",
            "receptor_uso_cfdi",
            "timbre_version",
            "timbre_uuid",
            "timbre_fecha_timbrado",
            "timbre_rfc_prov_certif",
            "timbre_no_certificado_sat",
            "tipo_factura",
            "link_pdf",
            "estado",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "contraparte", "created_at", "updated_at"]


class TesoreriaContraparteRelacionSerializer(serializers.ModelSerializer):
    """Representante legal / beneficiario controlador de una contraparte -
    dato que pide PLD/AML (ver piezas-de-tesoreria.html, bloque 1).
    contraparte_relacion es OTRA fila de TesoreriaContraparte (una persona
    fisica dada de alta en el mismo catalogo maestro), no un campo de texto
    libre - por eso ambos extremos son FK reales al mismo modelo."""

    contraparte_nombre = serializers.CharField(source="contraparte.razon_social", read_only=True)
    contraparte_relacion_nombre = serializers.CharField(source="contraparte_relacion.razon_social", read_only=True)

    class Meta:
        model = TesoreriaContraparteRelacion
        fields = [
            "id_relacion",
            "contraparte",
            "contraparte_nombre",
            "contraparte_relacion",
            "contraparte_relacion_nombre",
            "tipo_relacion",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        # Ver comentario en TesoreriaContraparteSerializer - id_relacion ya
        # no es read_only, mismo motivo (mostrar el ID real en pantalla
        # antes de guardar).
        read_only_fields = ["created_at", "updated_at"]


class TesoreriaCorteEdcSerializer(serializers.ModelSerializer):
    """Corte / estado de cuenta - el PDF del banco subido para conciliar
    contra los flujos capturados (ver piezas-de-tesoreria.html, bloque 5).
    `link` se captura a mano (URL pegada) - mismo criterio que
    ObraEvidencia.link_drive/EvidenciaRecepcion.link_drive mientras no
    exista una integracion real de subida de archivo para este flujo."""

    cuenta_alias = serializers.CharField(source="cuenta.alias", read_only=True)

    class Meta:
        model = TesoreriaCorteEdc
        fields = [
            "id",
            "cuenta",
            "cuenta_alias",
            "fecha_final",
            "tipo",
            "formato",
            "link",
            "disponible",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        # Ver comentario en TesoreriaContraparteSerializer - id ya no es
        # read_only, mismo motivo.
        read_only_fields = ["created_at", "updated_at"]


class TesoreriaSaldoSerializer(serializers.ModelSerializer):
    """Foto del saldo de una cuenta en una fecha - reporte de solo lectura
    para el dia a dia (ver piezas-de-tesoreria.html, bloque 5). `id` no es
    autogenerado (el modelo heredado no le puso default, ver models.py) -
    se llena por proceso/carga de archivo, no dato por dato a mano; se
    manda explicito al crear."""

    class Meta:
        model = TesoreriaSaldo
        fields = [
            "id",
            "fecha",
            "cuenta",
            "saldo",
            "cambio_dinero",
            "cambio_porcentual",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["created_at", "updated_at"]


class FacturaTrasladoSerializer(serializers.ModelSerializer):
    """Linea de impuesto trasladado de una factura - mismo criterio que
    FacturaConcepto (sin FK real, enlace logico por `uuid`)."""

    class Meta:
        model = FacturaTraslado
        fields = [
            "id",
            "uuid",
            "base",
            "impuesto",
            "tipo_factor",
            "tasa_o_cuota",
            "importe",
            "rfc_propietario",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FacturaDoctoRelacionadoSerializer(serializers.ModelSerializer):
    """Documento relacionado de una factura (parcialidades de pago) - mismo
    criterio que FacturaConcepto (sin FK real, enlace logico por
    `timbre_uuid`)."""

    class Meta:
        model = FacturaDoctoRelacionado
        fields = [
            "id",
            "timbre_uuid",
            "id_documento",
            "serie",
            "folio",
            "moneda_dr",
            "num_parcialidad",
            "imp_saldo_ant",
            "imp_pagado",
            "imp_saldo_insoluto",
            "rfc_propietario",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class FacturaNotaCreditoSerializer(serializers.ModelSerializer):
    """Linea de una nota de credito (distinta de TesoreriaNotaCredito, que
    es el encabezado) - mismo criterio que FacturaConcepto, enlace logico
    por `uuid`."""

    class Meta:
        model = FacturaNotaCredito
        fields = [
            "id",
            "uuid",
            "uuid_relacionado",
            "clave_prod_serv",
            "no_identificacion",
            "cantidad",
            "clave_unidad",
            "unidad",
            "descripcion",
            "valor_unitario",
            "importe",
            "objeto_imp",
            "rfc_propietario",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TesoreriaRecNominaSerializer(serializers.ModelSerializer):
    """CFDI de nomina - primer corte de encabezado/resumen (ver docstring
    de TesoreriaFacturaSerializer, mismo criterio: alta manual mientras no
    exista la integracion con RRHH/Motor Documental que de verdad la
    llene). No expone los ~50 campos granulares de Percepcion_*/Deduccion_*/
    OtroPago_* del modelo heredado - eso vive en el propio detalle del
    recibo (PDF/XML real), no hace falta capturarlo campo por campo aqui
    para el primer corte de Tesoreria."""

    class Meta:
        model = TesoreriaRecNomina
        fields = [
            "id",
            "fecha",
            "moneda",
            "folio",
            "sub_total",
            "total",
            "emisor_rfc",
            "emisor_nombre",
            "receptor_rfc",
            "receptor_nombre",
            "nom_receptor_num_empleado",
            "nomina_fecha_pago",
            "nomina_fecha_inicial_pago",
            "nomina_fecha_final_pago",
            "timbre_uuid",
            "timbre_fecha_timbrado",
            "tipo_factura",
            "link_pdf",
            "estado",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TesoreriaTicketReembolsoSerializer(serializers.ModelSerializer):
    """Ticket de reembolso de MiCumbres (pantalla provisional, ver
    docstring de TesoreriaTicketReembolso en models.py). id_empleado/
    estado/link_factura_pdf/drive_file_id_factura/factura/flujo son de
    solo lectura en el update normal - el empleado los fija al crear (o no
    los toca, en el caso de estado/factura/flujo) y solo cambian via las
    acciones dedicadas del ViewSet (aprobar/rechazar, subir_factura,
    vincular_factura, vincular_flujo), nunca via un PATCH libre."""

    flujo_id = serializers.CharField(source="flujo.id_flujo", read_only=True, default=None)
    factura_folio = serializers.CharField(source="factura.comprobante_folio", read_only=True, default=None)

    class Meta:
        model = TesoreriaTicketReembolso
        fields = [
            "id_ticket",
            "id_empleado",
            "descripcion",
            "monto",
            "fecha_gasto",
            "estado",
            "link_ticket",
            "drive_file_id_ticket",
            "link_factura_pdf",
            "drive_file_id_factura",
            "factura",
            "factura_folio",
            "flujo",
            "flujo_id",
            "comentarios",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = [
            "id_ticket",
            "id_empleado",
            "estado",
            "link_factura_pdf",
            "drive_file_id_factura",
            "factura",
            "flujo",
            "created_at",
            "updated_at",
        ]


class TesoreriaTicketProveedorSerializer(serializers.ModelSerializer):
    """Ticket publico de proveedor (27/Ago/2026, ver docstring del modelo).
    token_hash nunca se expone via API - se genera y regresa una unica vez,
    en claro, al crear el ticket (ver
    TesoreriaTicketProveedorViewSet.perform_create)."""

    contraparte_nombre = serializers.CharField(source="contraparte.razon_social", read_only=True)

    class Meta:
        model = TesoreriaTicketProveedor
        fields = [
            "id_ticket",
            "contraparte",
            "contraparte_nombre",
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
            "id_ticket",
            "issued_at",
            "uses_count",
            "first_used_at",
            "last_used_at",
            "revoked_at",
        ]
