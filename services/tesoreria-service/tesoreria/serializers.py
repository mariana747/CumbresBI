from rest_framework import serializers

from .models import TesoreriaBanco, TesoreriaContraparte, TesoreriaContrato, TesoreriaCuenta, TesoreriaFlujo


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
