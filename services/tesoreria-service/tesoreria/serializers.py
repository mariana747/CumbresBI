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
    TesoreriaCorteEdc,
    TesoreriaCuenta,
    TesoreriaFactura,
    TesoreriaFlujo,
    TesoreriaNotaCredito,
    TesoreriaRecNomina,
    TesoreriaSaldo,
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
        read_only_fields = ["id_contraparte", "created_at", "updated_at"]


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
        read_only_fields = ["id_cuenta_bancaria", "created_at", "updated_at"]


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
    catalogos compartidos de arriba."""

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
            "tipo_pago",
            "frecuencia",
            "moneda",
            "monto_periodo_iva_mxp",
            "monto_total_iva_mxp",
            "requiere_factura",
            "status",
            "comentarios",
            "link_contrato",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_contrato", "created_at", "updated_at"]


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
    (docs/architecture/roles-y-permisos.md sec. 2)."""

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
            "descripcion_pago",
            "link_comprobante_banco",
            "factura",
            "complemento",
            "nomina",
            "validacion_estado",
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

    class Meta:
        model = TesoreriaFactura
        fields = [
            "id",
            "comprobante_serie",
            "comprobante_folio",
            "comprobante_fecha",
            "comprobante_forma_pago",
            "comprobante_metodo_pago",
            "comprobante_moneda",
            "comprobante_total",
            "comprobante_tipo_de_comprobante",
            "tipo_relacion",
            "uuid_relacionado",
            "emisor_rfc",
            "emisor_nombre",
            "receptor_rfc",
            "receptor_nombre",
            "receptor_uso_cfdi",
            "timbre_uuid",
            "timbre_fecha_timbrado",
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
        read_only_fields = ["id", "estado", "created_at", "updated_at"]

    def get_conceptos(self, obj):
        conceptos = FacturaConcepto.objects.filter(uuid=obj.timbre_uuid)
        return FacturaConceptoSerializer(conceptos, many=True).data


class TesoreriaComplementoPagoSerializer(serializers.ModelSerializer):
    """CFDI complemento de pago - confirma fiscalmente que una factura a
    credito ya se pago. Mismo criterio de alta manual que TesoreriaFactura
    en este primer corte."""

    class Meta:
        model = TesoreriaComplementoPago
        fields = [
            "id",
            "timbre_uuid",
            "serie",
            "folio",
            "fecha",
            "moneda",
            "sub_total",
            "total",
            "emisor_rfc",
            "emisor_nombre",
            "receptor_rfc",
            "receptor_nombre",
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
        read_only_fields = ["id", "created_at", "updated_at"]


class TesoreriaNotaCreditoSerializer(serializers.ModelSerializer):
    """Nota de credito - ajuste fiscal sobre una factura ya emitida
    (uuid_relacionado es FK real a TesoreriaFactura.timbre_uuid, a
    diferencia de ComplementoPago que solo trae el UUID en texto plano -
    asi esta declarado en el ERD/models.py)."""

    factura_folio = serializers.CharField(source="uuid_relacionado.comprobante_folio", read_only=True, default=None)

    class Meta:
        model = TesoreriaNotaCredito
        fields = [
            "id",
            "comprobante_serie",
            "comprobante_folio",
            "comprobante_fecha",
            "comprobante_total",
            "uuid_relacionado",
            "factura_folio",
            "emisor_rfc",
            "emisor_nombre",
            "receptor_rfc",
            "receptor_nombre",
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
        read_only_fields = ["id_relacion", "created_at", "updated_at"]


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
        read_only_fields = ["id", "created_at", "updated_at"]


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
