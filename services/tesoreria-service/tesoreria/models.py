import uuid

from cumbresbi_scope.managers import ScopedManager
from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


# Nota general: este servicio agrupa Tesoreria + CFDI/Facturacion + el
# maestro de Contrapartes (tesoreria_contrapartes) en un solo esquema, tal
# como estaba documentado en docs/architecture/README.md sec. 1.1 - separado
# de compras-tesoreria-service (que se queda sin tablas de negocio propias
# hasta que exista el dominio real de Compras en Fase 4, ver su models.py).


class TesoreriaBanco(models.Model):
    """created_at/created_by/updated_at/updated_by agregadas en la Actividad 10
    de Fase 0 (docs/architecture/auditoria-esquema.md sec. 3) - las 3 tablas
    heredadas de AppSheet que no traian columnas de auditoria. Tipo char(8)
    para created_by/updated_by (coincide con iam_users.user_id), igual
    criterio que tesoreria_cortes_edc - no el varchar(100) sobredimensionado
    que la propia auditoria marca como inconsistencia en tablas legadas.
    """

    id_banxico = models.CharField(max_length=5, primary_key=True)
    banco = models.CharField(max_length=50, blank=True, null=True)
    alias = models.CharField(max_length=5, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_bancos"

    def __str__(self):
        return self.banco or self.id_banxico


class TesoreriaContraparte(models.Model):
    TIPO_FISICA = "fisica"
    TIPO_MORAL = "moral"
    TIPO_FISICA_ACT_EMP = "fisica_act_emp"
    TIPO_FIDEICOMISO = "fideicomiso"
    TIPO_PERSONA_CHOICES = [
        (TIPO_FISICA, "Fisica"),
        (TIPO_MORAL, "Moral"),
        (TIPO_FISICA_ACT_EMP, "Fisica con actividad empresarial"),
        (TIPO_FIDEICOMISO, "Fideicomiso"),
    ]

    GENERO_MUJER = "MUJER"
    GENERO_HOMBRE = "HOMBRE"
    GENERO_CHOICES = [
        (GENERO_MUJER, "Mujer"),
        (GENERO_HOMBRE, "Hombre"),
    ]

    id_contraparte = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    rfc = models.CharField(max_length=13, unique=True, blank=True, null=True)
    razon_social = models.CharField(max_length=100)
    contacto = models.CharField(max_length=100, blank=True, null=True)
    telefono_sms = models.CharField(max_length=10, blank=True, null=True)
    email = models.CharField(max_length=100)
    comentarios = models.TextField(blank=True, null=True)
    permiso = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    autorizado_por = models.CharField(max_length=100, blank=True, null=True)
    apellido_paterno = models.CharField(max_length=100, blank=True, null=True)
    apellido_materno = models.CharField(max_length=100, blank=True, null=True)
    tipo_persona = models.CharField(max_length=20, choices=TIPO_PERSONA_CHOICES)
    genero = models.CharField(max_length=20, choices=GENERO_CHOICES, blank=True, null=True)
    cliente = models.BooleanField(default=False)
    proveedor = models.BooleanField(default=False)

    class Meta:
        db_table = "tesoreria_contrapartes"

    def __str__(self):
        return self.razon_social


class TesoreriaContraparteRelacion(models.Model):
    TIPO_REP_LEGAL = "REP LEGAL"
    TIPO_BENEF_CONTROLADOR = "BENEF CONTROLADOR"
    TIPO_RELACION_CHOICES = [
        (TIPO_REP_LEGAL, "Representante legal"),
        (TIPO_BENEF_CONTROLADOR, "Beneficiario controlador"),
    ]

    id_relacion = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    contraparte = models.ForeignKey(
        TesoreriaContraparte,
        db_column="id_contraparte",
        on_delete=models.CASCADE,
        related_name="relaciones",
    )
    contraparte_relacion = models.ForeignKey(
        TesoreriaContraparte,
        db_column="id_contraparte_relacion",
        on_delete=models.CASCADE,
        related_name="relaciones_inversas",
    )
    tipo_relacion = models.CharField(max_length=20, choices=TIPO_RELACION_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_contrapartes_relacion"

    def __str__(self):
        return self.id_relacion


class TesoreriaCuenta(models.Model):
    id_cuenta_bancaria = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    rfc_razon_social = models.CharField(max_length=50, blank=True, null=True)
    banco = models.ForeignKey(
        TesoreriaBanco,
        db_column="banco",
        on_delete=models.PROTECT,
        related_name="cuentas",
        blank=True,
        null=True,
    )
    cuenta = models.CharField(max_length=20, blank=True, null=True)
    clabe = models.CharField(max_length=18, blank=True, null=True)
    alias = models.CharField(max_length=50, blank=True, null=True)
    label = models.CharField(max_length=100, blank=True, null=True)
    activa = models.BooleanField(blank=True, null=True)
    apertura = models.DateField()
    cierre = models.DateField(blank=True, null=True)
    # Ver docstring de TesoreriaBanco - misma correccion de Actividad 10.
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_cuentas"

    def __str__(self):
        return self.alias or self.id_cuenta_bancaria


class TesoreriaContrato(models.Model):
    """sociedad referencia general_sociedades.rfc (iam-service, fuera de este
    esquema) - CharField plano, no ForeignKey real."""

    TIPO_INTERNO = "INTERNO"
    TIPO_EXTERNO = "EXTERNO"
    TIPO_CHOICES = [(TIPO_INTERNO, "Interno"), (TIPO_EXTERNO, "Externo")]

    TIPO_PAGO_REGULAR = "REGULAR"
    TIPO_PAGO_IRREGULAR = "IRREGULAR"
    TIPO_PAGO_UNICO = "UNICO"
    TIPO_PAGO_CHOICES = [
        (TIPO_PAGO_REGULAR, "Regular"),
        (TIPO_PAGO_IRREGULAR, "Irregular"),
        (TIPO_PAGO_UNICO, "Unico"),
    ]

    FRECUENCIA_CHOICES = [
        ("MENSUAL", "Mensual"),
        ("BIMESTRAL", "Bimestral"),
        ("TRIMESTRAL", "Trimestral"),
        ("SEMESTRAL", "Semestral"),
        ("ANUAL", "Anual"),
        ("OTRA", "Otra"),
        ("SEMANAL", "Semanal"),
    ]

    MONEDA_CHOICES = [("MXP", "MXP"), ("USD", "USD"), ("EUR", "EUR")]

    STATUS_ACTIVO = "ACTIVO"
    STATUS_INACTIVO = "INACTIVO"
    STATUS_CHOICES = [(STATUS_ACTIVO, "Activo"), (STATUS_INACTIVO, "Inactivo")]

    id_contrato = models.CharField(max_length=255, primary_key=True)
    fecha_generacion = models.DateField(blank=True, null=True)
    fecha_vencimiento = models.DateField(blank=True, null=True)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, blank=True, null=True)
    contraparte = models.ForeignKey(
        TesoreriaContraparte, db_column="id_contraparte", on_delete=models.PROTECT, related_name="contratos"
    )
    sociedad = models.CharField(max_length=13)
    proyecto = models.CharField(max_length=3, blank=True, null=True)
    propiedad = models.CharField(max_length=50, blank=True, null=True)
    centro = models.CharField(max_length=100, blank=True, null=True)
    tipo_pago = models.CharField(max_length=20, choices=TIPO_PAGO_CHOICES, blank=True, null=True)
    frecuencia = models.CharField(max_length=20, choices=FRECUENCIA_CHOICES, blank=True, null=True)
    duracion = models.DecimalField(max_digits=4, decimal_places=0, blank=True, null=True)
    fecha_proyectada = models.DateField(blank=True, null=True)
    moneda = models.CharField(max_length=5, choices=MONEDA_CHOICES, blank=True, null=True)
    monto_periodo_iva_mxp = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    monto_total_iva_mxp = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    concepto_factura = models.TextField(blank=True, null=True)
    link_carpeta = models.TextField(blank=True, null=True)
    link_contrato = models.TextField(blank=True, null=True)
    requiere_factura = models.BooleanField(blank=True, null=True)
    comentarios = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, blank=True, null=True)
    permiso = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    autorizacion = models.BooleanField(blank=True, null=True)

    # Primer modelo real de tesoreria-service con columna de sociedad (18/Ago/2026,
    # arranque formal de Fase 4) - "sociedad" es un CharField plano que
    # referencia general_sociedades.rfc (iam-service, fuera de este esquema,
    # ver docstring de la clase), mismo criterio de referencia laxa que
    # pld_contrapartes_kyc.sociedad_rfc. Contraparte/Banco/Cuenta se quedan
    # sin ScopedManager (catalogos compartidos, ver serializers.py) - un
    # Contrato SI pertenece a una sociedad especifica.
    SCOPE_FIELD_SOCIEDAD = "sociedad"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_contratos"

    def __str__(self):
        return self.id_contrato


class TesoreriaCorteEdc(models.Model):
    TIPO_CORTE = "corte"
    TIPO_ESTADO_CUENTA = "estado_cuenta"
    TIPO_CHOICES = [(TIPO_CORTE, "Corte"), (TIPO_ESTADO_CUENTA, "Estado de cuenta")]

    FORMATO_PDF = "pdf"
    FORMATO_EXCEL = "excel"
    FORMATO_CSV = "csv"
    FORMATO_OTRO = "otro"
    FORMATO_CHOICES = [
        (FORMATO_PDF, "PDF"),
        (FORMATO_EXCEL, "Excel"),
        (FORMATO_CSV, "CSV"),
        (FORMATO_OTRO, "Otro"),
    ]

    id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    cuenta = models.ForeignKey(
        TesoreriaCuenta, db_column="cuenta", on_delete=models.CASCADE, related_name="cortes_edc"
    )
    fecha_final = models.DateField()
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    formato = models.CharField(max_length=20, choices=FORMATO_CHOICES)
    link = models.CharField(max_length=2083)
    disponible = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "tesoreria_cortes_edc"

    def __str__(self):
        return str(self.id)


class TesoreriaComplementoPago(models.Model):
    """CFDI complemento de pago. Campos siguen el nombrado del XML del SAT
    (PascalCase), tal como en el ERD heredado."""

    id = models.AutoField(primary_key=True)
    timbre_uuid = models.CharField(db_column="Timbre_UUID", max_length=36, unique=True)
    version = models.CharField(db_column="Version", max_length=5, blank=True, null=True)
    serie = models.CharField(db_column="Serie", max_length=25, blank=True, null=True)
    folio = models.CharField(db_column="Folio", max_length=25, blank=True, null=True)
    fecha = models.DateTimeField(db_column="Fecha", blank=True, null=True)
    no_certificado = models.CharField(db_column="NoCertificado", max_length=50, blank=True, null=True)
    lugar_expedicion = models.CharField(db_column="LugarExpedicion", max_length=10, blank=True, null=True)
    tipo_de_comprobante = models.CharField(
        db_column="TipoDeComprobante", max_length=2, blank=True, null=True
    )
    moneda = models.CharField(db_column="Moneda", max_length=5, blank=True, null=True)
    sub_total = models.DecimalField(
        db_column="SubTotal", max_digits=18, decimal_places=2, blank=True, null=True
    )
    total = models.DecimalField(db_column="Total", max_digits=18, decimal_places=2, blank=True, null=True)
    exportacion = models.CharField(db_column="Exportacion", max_length=10, blank=True, null=True)
    emisor_rfc = models.CharField(db_column="Emisor_Rfc", max_length=13, blank=True, null=True)
    emisor_nombre = models.CharField(db_column="Emisor_Nombre", max_length=255, blank=True, null=True)
    emisor_regimen_fiscal = models.CharField(
        db_column="Emisor_RegimenFiscal", max_length=5, blank=True, null=True
    )
    receptor_rfc = models.CharField(db_column="Receptor_Rfc", max_length=13, blank=True, null=True)
    receptor_nombre = models.CharField(db_column="Receptor_Nombre", max_length=255, blank=True, null=True)
    receptor_domicilio_fiscal_receptor = models.CharField(
        db_column="Receptor_DomicilioFiscalReceptor", max_length=10, blank=True, null=True
    )
    receptor_regimen_fiscal_receptor = models.CharField(
        db_column="Receptor_RegimenFiscalReceptor", max_length=5, blank=True, null=True
    )
    receptor_uso_cfdi = models.CharField(db_column="Receptor_UsoCFDI", max_length=5, blank=True, null=True)
    timbre_version = models.CharField(db_column="Timbre_Version", max_length=5, blank=True, null=True)
    timbre_fecha_timbrado = models.DateTimeField(
        db_column="Timbre_FechaTimbrado", blank=True, null=True
    )
    timbre_rfc_prov_certif = models.CharField(
        db_column="Timbre_RfcProvCertif", max_length=13, blank=True, null=True
    )
    timbre_no_certificado_sat = models.CharField(
        db_column="Timbre_NoCertificadoSAT", max_length=50, blank=True, null=True
    )
    fecha_de_pago = models.CharField(max_length=50, blank=True, null=True)
    monto_pagado = models.CharField(max_length=50, blank=True, null=True)
    uuid_relacion = models.CharField(max_length=50, blank=True, null=True)
    tipo_factura = models.CharField(max_length=50, blank=True, null=True)
    link_pdf = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_complementos_pago"

    def __str__(self):
        return self.timbre_uuid


class TesoreriaFactura(models.Model):
    id = models.AutoField(primary_key=True)
    comprobante_version = models.CharField(
        db_column="Comprobante_Version", max_length=10, blank=True, null=True
    )
    comprobante_serie = models.CharField(
        db_column="Comprobante_Serie", max_length=100, blank=True, null=True
    )
    comprobante_folio = models.CharField(
        db_column="Comprobante_Folio", max_length=100, blank=True, null=True
    )
    comprobante_fecha = models.DateTimeField(db_column="Comprobante_Fecha", blank=True, null=True)
    comprobante_forma_pago = models.CharField(
        db_column="Comprobante_FormaPago", max_length=5, blank=True, null=True
    )
    comprobante_no_certificado = models.CharField(
        db_column="Comprobante_NoCertificado", max_length=50, blank=True, null=True
    )
    comprobante_sub_total = models.CharField(
        db_column="Comprobante_SubTotal", max_length=50, blank=True, null=True
    )
    comprobante_moneda = models.CharField(
        db_column="Comprobante_Moneda", max_length=50, blank=True, null=True
    )
    comprobante_exportacion = models.CharField(
        db_column="Comprobante_Exportacion", max_length=5, blank=True, null=True
    )
    comprobante_tipo_cambio = models.CharField(
        db_column="Comprobante_TipoCambio", max_length=50, blank=True, null=True
    )
    comprobante_total = models.DecimalField(
        db_column="Comprobante_Total", max_digits=18, decimal_places=2, blank=True, null=True
    )
    comprobante_tipo_de_comprobante = models.CharField(
        db_column="Comprobante_TipoDeComprobante", max_length=2, blank=True, null=True
    )
    comprobante_metodo_pago = models.CharField(
        db_column="Comprobante_MetodoPago", max_length=5, blank=True, null=True
    )
    comprobante_lugar_expedicion = models.CharField(
        db_column="Comprobante_LugarExpedicion", max_length=300, blank=True, null=True
    )
    tipo_relacion = models.CharField(db_column="TipoRelacion", max_length=5, blank=True, null=True)
    uuid_relacionado = models.CharField(
        db_column="UUID_Relacionado", max_length=50, blank=True, null=True
    )
    emisor_rfc = models.CharField(db_column="Emisor_Rfc", max_length=13, blank=True, null=True)
    emisor_nombre = models.CharField(db_column="Emisor_Nombre", max_length=255, blank=True, null=True)
    emisor_regimen_fiscal = models.CharField(
        db_column="Emisor_RegimenFiscal", max_length=200, blank=True, null=True
    )
    receptor_rfc = models.CharField(db_column="Receptor_Rfc", max_length=13, blank=True, null=True)
    receptor_nombre = models.CharField(db_column="Receptor_Nombre", max_length=255, blank=True, null=True)
    receptor_domicilio_fiscal_receptor = models.CharField(
        db_column="Receptor_DomicilioFiscalReceptor", max_length=200, blank=True, null=True
    )
    receptor_regimen_fiscal_receptor = models.CharField(
        db_column="Receptor_RegimenFiscalReceptor", max_length=5, blank=True, null=True
    )
    receptor_uso_cfdi = models.CharField(db_column="Receptor_UsoCFDI", max_length=5, blank=True, null=True)
    timbre_version = models.CharField(db_column="Timbre_Version", max_length=5, blank=True, null=True)
    timbre_uuid = models.CharField(db_column="Timbre_UUID", max_length=50, unique=True)
    timbre_fecha_timbrado = models.DateTimeField(db_column="Timbre_FechaTimbrado", blank=True, null=True)
    timbre_rfc_prov_certif = models.CharField(
        db_column="Timbre_RfcProvCertif", max_length=13, blank=True, null=True
    )
    timbre_no_certificado_sat = models.CharField(
        db_column="Timbre_NoCertificadoSAT", max_length=30, blank=True, null=True
    )
    tipo_factura = models.CharField(max_length=50, blank=True, null=True)
    link_pdf = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_facturas"

    def __str__(self):
        return self.timbre_uuid


class TesoreriaNotaCredito(models.Model):
    id = models.AutoField(primary_key=True)
    comprobante_version = models.CharField(
        db_column="Comprobante_Version", max_length=10, blank=True, null=True
    )
    comprobante_serie = models.CharField(
        db_column="Comprobante_Serie", max_length=100, blank=True, null=True
    )
    comprobante_folio = models.CharField(
        db_column="Comprobante_Folio", max_length=100, blank=True, null=True
    )
    comprobante_fecha = models.DateTimeField(db_column="Comprobante_Fecha", blank=True, null=True)
    comprobante_forma_pago = models.CharField(
        db_column="Comprobante_FormaPago", max_length=5, blank=True, null=True
    )
    comprobante_no_certificado = models.CharField(
        db_column="Comprobante_NoCertificado", max_length=30, blank=True, null=True
    )
    comprobante_sub_total = models.DecimalField(
        db_column="Comprobante_SubTotal", max_digits=18, decimal_places=2, blank=True, null=True
    )
    comprobante_moneda = models.CharField(
        db_column="Comprobante_Moneda", max_length=100, blank=True, null=True
    )
    comprobante_exportacion = models.CharField(
        db_column="Comprobante_Exportacion", max_length=5, blank=True, null=True
    )
    comprobante_tipo_cambio = models.CharField(
        db_column="Comprobante_TipoCambio", max_length=50, blank=True, null=True
    )
    comprobante_total = models.DecimalField(
        db_column="Comprobante_Total", max_digits=18, decimal_places=2, blank=True, null=True
    )
    comprobante_tipo_de_comprobante = models.CharField(
        db_column="Comprobante_TipoDeComprobante", max_length=2, blank=True, null=True
    )
    comprobante_metodo_pago = models.CharField(
        db_column="Comprobante_MetodoPago", max_length=5, blank=True, null=True
    )
    comprobante_lugar_expedicion = models.CharField(
        db_column="Comprobante_LugarExpedicion", max_length=200, blank=True, null=True
    )
    tipo_relacion = models.CharField(db_column="TipoRelacion", max_length=5, blank=True, null=True)
    uuid_relacionado = models.ForeignKey(
        TesoreriaFactura,
        db_column="UUID_Relacionado",
        to_field="timbre_uuid",
        on_delete=models.SET_NULL,
        related_name="notas_credito",
        blank=True,
        null=True,
    )
    emisor_rfc = models.CharField(db_column="Emisor_Rfc", max_length=13, blank=True, null=True)
    emisor_nombre = models.CharField(db_column="Emisor_Nombre", max_length=255, blank=True, null=True)
    emisor_regimen_fiscal = models.CharField(
        db_column="Emisor_RegimenFiscal", max_length=5, blank=True, null=True
    )
    receptor_rfc = models.CharField(db_column="Receptor_Rfc", max_length=13, blank=True, null=True)
    receptor_nombre = models.CharField(db_column="Receptor_Nombre", max_length=255, blank=True, null=True)
    receptor_domicilio_fiscal_receptor = models.CharField(
        db_column="Receptor_DomicilioFiscalReceptor", max_length=10, blank=True, null=True
    )
    receptor_regimen_fiscal_receptor = models.CharField(
        db_column="Receptor_RegimenFiscalReceptor", max_length=5, blank=True, null=True
    )
    receptor_uso_cfdi = models.CharField(db_column="Receptor_UsoCFDI", max_length=5, blank=True, null=True)
    timbre_version = models.CharField(db_column="Timbre_Version", max_length=5, blank=True, null=True)
    timbre_uuid = models.CharField(db_column="Timbre_UUID", max_length=50, unique=True)
    timbre_fecha_timbrado = models.DateTimeField(db_column="Timbre_FechaTimbrado", blank=True, null=True)
    timbre_rfc_prov_certif = models.CharField(
        db_column="Timbre_RfcProvCertif", max_length=13, blank=True, null=True
    )
    timbre_no_certificado_sat = models.CharField(
        db_column="Timbre_NoCertificadoSAT", max_length=30, blank=True, null=True
    )
    tipo_factura = models.CharField(max_length=50, blank=True, null=True)
    link_pdf = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_notas_credito"

    def __str__(self):
        return self.timbre_uuid


class TesoreriaRecNomina(models.Model):
    """CFDI de nomina. Campos siguen el nombrado del XML del SAT, agrupados
    por bloque (Nomina_*, NomReceptor_*, Percepcion_*, Deduccion_*,
    OtroPago_*) tal como en el ERD heredado."""

    id = models.AutoField(primary_key=True)
    version = models.CharField(db_column="Version", max_length=5, blank=True, null=True)
    fecha = models.DateTimeField(db_column="Fecha", blank=True, null=True)
    moneda = models.CharField(db_column="Moneda", max_length=5, blank=True, null=True)
    tipo_de_comprobante = models.CharField(
        db_column="TipoDeComprobante", max_length=1, blank=True, null=True
    )
    exportacion = models.CharField(db_column="Exportacion", max_length=2, blank=True, null=True)
    metodo_pago = models.CharField(db_column="MetodoPago", max_length=5, blank=True, null=True)
    serie = models.CharField(db_column="Serie", max_length=20, blank=True, null=True)
    folio = models.CharField(db_column="Folio", max_length=20, blank=True, null=True)
    lugar_expedicion = models.CharField(db_column="LugarExpedicion", max_length=10, blank=True, null=True)
    sub_total = models.DecimalField(
        db_column="SubTotal", max_digits=12, decimal_places=2, blank=True, null=True
    )
    descuento = models.CharField(db_column="Descuento", max_length=50, blank=True, null=True)
    total = models.DecimalField(db_column="Total", max_digits=12, decimal_places=2, blank=True, null=True)
    emisor_regimen_fiscal = models.CharField(
        db_column="Emisor_RegimenFiscal", max_length=5, blank=True, null=True
    )
    emisor_rfc = models.CharField(db_column="Emisor_Rfc", max_length=13, blank=True, null=True)
    emisor_nombre = models.CharField(db_column="Emisor_Nombre", max_length=255, blank=True, null=True)
    receptor_rfc = models.CharField(db_column="Receptor_Rfc", max_length=13, blank=True, null=True)
    receptor_nombre = models.CharField(db_column="Receptor_Nombre", max_length=255, blank=True, null=True)
    receptor_domicilio_fiscal_receptor = models.CharField(
        db_column="Receptor_DomicilioFiscalReceptor", max_length=10, blank=True, null=True
    )
    receptor_regimen_fiscal_receptor = models.CharField(
        db_column="Receptor_RegimenFiscalReceptor", max_length=5, blank=True, null=True
    )
    receptor_uso_cfdi = models.CharField(db_column="Receptor_UsoCFDI", max_length=5, blank=True, null=True)
    concepto_clave_prod_serv = models.CharField(
        db_column="Concepto_ClaveProdServ", max_length=10, blank=True, null=True
    )
    concepto_cantidad = models.DecimalField(
        db_column="Concepto_Cantidad", max_digits=10, decimal_places=2, blank=True, null=True
    )
    concepto_clave_unidad = models.CharField(
        db_column="Concepto_ClaveUnidad", max_length=5, blank=True, null=True
    )
    concepto_descripcion = models.CharField(
        db_column="Concepto_Descripcion", max_length=100, blank=True, null=True
    )
    concepto_objeto_imp = models.CharField(
        db_column="Concepto_ObjetoImp", max_length=5, blank=True, null=True
    )
    concepto_valor_unitario = models.DecimalField(
        db_column="Concepto_ValorUnitario", max_digits=12, decimal_places=2, blank=True, null=True
    )
    concepto_importe = models.DecimalField(
        db_column="Concepto_Importe", max_digits=12, decimal_places=2, blank=True, null=True
    )
    concepto_descuento = models.CharField(
        db_column="Concepto_Descuento", max_length=50, blank=True, null=True
    )
    nomina_version = models.CharField(db_column="Nomina_Version", max_length=5, blank=True, null=True)
    nomina_tipo_nomina = models.CharField(
        db_column="Nomina_TipoNomina", max_length=1, blank=True, null=True
    )
    nomina_fecha_pago = models.DateField(db_column="Nomina_FechaPago", blank=True, null=True)
    nomina_fecha_inicial_pago = models.DateField(
        db_column="Nomina_FechaInicialPago", blank=True, null=True
    )
    nomina_fecha_final_pago = models.DateField(db_column="Nomina_FechaFinalPago", blank=True, null=True)
    nomina_num_dias_pagados = models.CharField(
        db_column="Nomina_NumDiasPagados", max_length=50, blank=True, null=True
    )
    nomina_total_percepciones = models.CharField(
        db_column="Nomina_TotalPercepciones", max_length=50, blank=True, null=True
    )
    nomina_total_deducciones = models.CharField(
        db_column="Nomina_TotalDeducciones", max_length=50, blank=True, null=True
    )
    nomina_total_otros_pagos = models.CharField(
        db_column="Nomina_TotalOtrosPagos", max_length=50, blank=True, null=True
    )
    registro_patronal = models.CharField(
        db_column="RegistroPatronal", max_length=20, blank=True, null=True
    )
    nom_receptor_curp = models.CharField(db_column="NomReceptor_Curp", max_length=18, blank=True, null=True)
    nom_receptor_num_seguridad_social = models.CharField(
        db_column="NomReceptor_NumSeguridadSocial", max_length=20, blank=True, null=True
    )
    nom_receptor_fecha_inicio_rel_laboral = models.CharField(
        db_column="NomReceptor_FechaInicioRelLaboral", max_length=50, blank=True, null=True
    )
    nom_receptor_antiguedad = models.CharField(
        db_column="NomReceptor_Antigüedad", max_length=10, blank=True, null=True
    )
    nom_receptor_tipo_contrato = models.CharField(
        db_column="NomReceptor_TipoContrato", max_length=3, blank=True, null=True
    )
    nom_receptor_sindicalizado = models.CharField(
        db_column="NomReceptor_Sindicalizado", max_length=3, blank=True, null=True
    )
    nom_receptor_tipo_jornada = models.CharField(
        db_column="NomReceptor_TipoJornada", max_length=3, blank=True, null=True
    )
    nom_receptor_tipo_regimen = models.CharField(
        db_column="NomReceptor_TipoRegimen", max_length=3, blank=True, null=True
    )
    nom_receptor_num_empleado = models.CharField(
        db_column="NomReceptor_NumEmpleado", max_length=20, blank=True, null=True
    )
    nom_receptor_departamento = models.CharField(
        db_column="NomReceptor_Departamento", max_length=50, blank=True, null=True
    )
    nom_receptor_puesto = models.CharField(
        db_column="NomReceptor_Puesto", max_length=50, blank=True, null=True
    )
    nom_receptor_riesgo_puesto = models.CharField(
        db_column="NomReceptor_RiesgoPuesto", max_length=2, blank=True, null=True
    )
    nom_receptor_periodicidad_pago = models.CharField(
        db_column="NomReceptor_PeriodicidadPago", max_length=3, blank=True, null=True
    )
    nom_receptor_salario_base_cot_apor = models.CharField(
        db_column="NomReceptor_SalarioBaseCotApor", max_length=50, blank=True, null=True
    )
    nom_receptor_salario_diario_integrado = models.CharField(
        db_column="NomReceptor_SalarioDiarioIntegrado", max_length=50, blank=True, null=True
    )
    nom_receptor_clave_ent_fed = models.CharField(
        db_column="NomReceptor_ClaveEntFed", max_length=5, blank=True, null=True
    )
    percepciones_total_sueldos = models.CharField(
        db_column="Percepciones_TotalSueldos", max_length=50, blank=True, null=True
    )
    percepciones_total_gravado = models.CharField(
        db_column="Percepciones_TotalGravado", max_length=50, blank=True, null=True
    )
    percepciones_total_exento = models.CharField(
        db_column="Percepciones_TotalExento", max_length=50, blank=True, null=True
    )
    percepcion_tipo_percepcion = models.CharField(
        db_column="Percepcion_TipoPercepcion", max_length=3, blank=True, null=True
    )
    percepcion_clave = models.CharField(db_column="Percepcion_Clave", max_length=10, blank=True, null=True)
    percepcion_concepto = models.CharField(
        db_column="Percepcion_Concepto", max_length=100, blank=True, null=True
    )
    percepcion_importe_gravado = models.CharField(
        db_column="Percepcion_ImporteGravado", max_length=50, blank=True, null=True
    )
    percepcion_importe_exento = models.CharField(
        db_column="Percepcion_ImporteExento", max_length=50, blank=True, null=True
    )
    deducciones_total_otras_deducciones = models.CharField(
        db_column="Deducciones_TotalOtrasDeducciones", max_length=50, blank=True, null=True
    )
    deducciones_total_impuestos_retenidos = models.CharField(
        db_column="Deducciones_TotalImpuestosRetenidos", max_length=50, blank=True, null=True
    )
    deduccion_tipo_deduccion = models.CharField(
        db_column="Deduccion_TipoDeduccion", max_length=3, blank=True, null=True
    )
    deduccion_clave = models.CharField(db_column="Deduccion_Clave", max_length=10, blank=True, null=True)
    deduccion_concepto = models.CharField(
        db_column="Deduccion_Concepto", max_length=100, blank=True, null=True
    )
    deduccion_importe = models.CharField(
        db_column="Deduccion_Importe", max_length=50, blank=True, null=True
    )
    otro_pago_tipo_otro_pago = models.CharField(
        db_column="OtroPago_TipoOtroPago", max_length=3, blank=True, null=True
    )
    otro_pago_clave = models.CharField(db_column="OtroPago_Clave", max_length=10, blank=True, null=True)
    otro_pago_concepto = models.CharField(
        db_column="OtroPago_Concepto", max_length=100, blank=True, null=True
    )
    otro_pago_importe = models.CharField(
        db_column="OtroPago_Importe", max_length=50, blank=True, null=True
    )
    subsidio_causado = models.CharField(
        db_column="SubsidioCausado", max_length=50, blank=True, null=True
    )
    timbre_version = models.CharField(db_column="Timbre_Version", max_length=5, blank=True, null=True)
    timbre_uuid = models.CharField(db_column="Timbre_UUID", max_length=50, unique=True, blank=True, null=True)
    timbre_fecha_timbrado = models.DateTimeField(db_column="Timbre_FechaTimbrado", blank=True, null=True)
    timbre_rfc_prov_certif = models.CharField(
        db_column="Timbre_RfcProvCertif", max_length=13, blank=True, null=True
    )
    tipo_factura = models.CharField(max_length=50, blank=True, null=True)
    link_pdf = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_rec_nominas"

    def __str__(self):
        return self.timbre_uuid or str(self.id)


class TesoreriaFlujo(models.Model):
    """id_empleado/id_empleado_reembolso referencian rrhh_empleados.id_empleado
    (rrhh-service, fuera de este esquema) - CharField plano, no ForeignKey
    real (docs/architecture/README.md sec. 11.2 #1)."""

    VALIDACION_PENDIENTE = "PENDIENTE"
    VALIDACION_APROBADA = "APROBADA"
    VALIDACION_RECHAZADA = "RECHAZADA"
    VALIDACION_CHOICES = [
        (VALIDACION_PENDIENTE, "Pendiente"),
        (VALIDACION_APROBADA, "Aprobada"),
        (VALIDACION_RECHAZADA, "Rechazada"),
    ]

    id_flujo = models.CharField(max_length=255, primary_key=True)
    contrato = models.ForeignKey(
        TesoreriaContrato,
        db_column="id_contrato",
        on_delete=models.SET_NULL,
        related_name="flujos",
        blank=True,
        null=True,
    )
    id_empleado = models.CharField(max_length=255, blank=True, null=True)
    id_requisicion = models.CharField(max_length=255, blank=True, null=True)
    fecha_efectiva = models.DateField(blank=True, null=True)
    concepto = models.TextField(blank=True, null=True)
    reembolso = models.BooleanField(blank=True, null=True)
    id_empleado_reembolso = models.CharField(max_length=255, blank=True, null=True)
    cuenta = models.ForeignKey(
        TesoreriaCuenta, db_column="cuenta", on_delete=models.PROTECT, related_name="flujos"
    )
    total_mxp = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    autorizacion = models.BooleanField(blank=True, null=True)
    autorizado_por = models.CharField(max_length=100, blank=True, null=True)
    fecha_autorizacion = models.DateField(blank=True, null=True)
    link_referencia = models.TextField(blank=True, null=True)
    pagado = models.BooleanField(blank=True, null=True)
    fecha_pago = models.DateField(blank=True, null=True)
    fecha_pago_original = models.DateField(blank=True, null=True)
    descripcion_pago = models.CharField(max_length=150, blank=True, null=True)
    link_comprobante_banco = models.TextField(blank=True, null=True)
    factura = models.ForeignKey(
        TesoreriaFactura,
        db_column="factura_uuid",
        to_field="timbre_uuid",
        on_delete=models.SET_NULL,
        related_name="flujos",
        blank=True,
        null=True,
    )
    complemento = models.ForeignKey(
        TesoreriaComplementoPago,
        db_column="complemento_uuid",
        to_field="timbre_uuid",
        on_delete=models.SET_NULL,
        related_name="flujos",
        blank=True,
        null=True,
    )
    nomina = models.ForeignKey(
        TesoreriaRecNomina,
        db_column="nomina_uuid",
        to_field="timbre_uuid",
        on_delete=models.SET_NULL,
        related_name="flujos",
        blank=True,
        null=True,
    )
    estado_cfdi = models.CharField(max_length=50, blank=True, null=True)
    comprobacion_asignada_a = models.CharField(max_length=100, blank=True, null=True)
    aprobacion_lista = models.BooleanField(blank=True, null=True)
    validacion_estado = models.CharField(max_length=20, choices=VALIDACION_CHOICES, blank=True, null=True)
    permiso_enviar_pago = models.CharField(max_length=50, blank=True, null=True)
    informacion_envio = models.TextField(blank=True, null=True)
    ultimo_envio = models.DateTimeField(blank=True, null=True)
    comentarios = models.TextField(blank=True, null=True)
    permiso = models.CharField(max_length=255, blank=True, null=True)
    requiere_complemento = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_flujos"

    def __str__(self):
        return self.id_flujo


class TesoreriaSaldo(models.Model):
    """cuenta es varchar(50) sin FK declarada en el ERD (fk_relationships.csv
    no la lista) - se respeta tal cual, sin inventar una relacion que no
    esta en el esquema de origen."""

    id = models.CharField(max_length=50, primary_key=True)
    fecha = models.DateField()
    cuenta = models.CharField(max_length=50)
    saldo = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    cambio_dinero = models.DecimalField(max_digits=18, decimal_places=2, blank=True, null=True)
    cambio_porcentual = models.DecimalField(max_digits=8, decimal_places=4, blank=True, null=True)
    # Ver docstring de TesoreriaBanco - misma correccion de Actividad 10.
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_saldos"

    def __str__(self):
        return self.id


class FacturaConcepto(models.Model):
    """Sin FK declarada en el ERD hacia tesoreria_facturas (UUID/rfc_propietario
    son referencias logicas de origen ETL, no constraints reales) - se
    respetan como CharField planos."""

    id = models.AutoField(primary_key=True)
    uuid = models.CharField(db_column="UUID", max_length=50, blank=True, null=True)
    clave_prod_serv = models.CharField(db_column="ClaveProdServ", max_length=20, blank=True, null=True)
    no_identificacion = models.CharField(
        db_column="NoIdentificacion", max_length=200, blank=True, null=True
    )
    cantidad = models.DecimalField(
        db_column="Cantidad", max_digits=18, decimal_places=2, blank=True, null=True
    )
    clave_unidad = models.CharField(db_column="ClaveUnidad", max_length=10, blank=True, null=True)
    unidad = models.CharField(db_column="Unidad", max_length=20, blank=True, null=True)
    descripcion = models.TextField(db_column="Descripcion", blank=True, null=True)
    valor_unitario = models.CharField(db_column="ValorUnitario", max_length=50, blank=True, null=True)
    importe = models.CharField(db_column="Importe", max_length=50, blank=True, null=True)
    descuento = models.CharField(db_column="Descuento", max_length=50, blank=True, null=True)
    objeto_imp = models.CharField(db_column="ObjetoImp", max_length=5, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    rfc_propietario = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "factura_conceptos"


class FacturaDoctoRelacionado(models.Model):
    id = models.AutoField(primary_key=True)
    timbre_uuid = models.CharField(db_column="Timbre_UUID", max_length=36, blank=True, null=True)
    id_documento = models.CharField(db_column="IdDocumento", max_length=36, blank=True, null=True)
    serie = models.CharField(db_column="Serie", max_length=25, blank=True, null=True)
    folio = models.CharField(db_column="Folio", max_length=25, blank=True, null=True)
    moneda_dr = models.CharField(db_column="MonedaDR", max_length=5, blank=True, null=True)
    equivalencia_dr = models.CharField(db_column="EquivalenciaDR", max_length=50, blank=True, null=True)
    num_parcialidad = models.IntegerField(db_column="NumParcialidad", blank=True, null=True)
    imp_saldo_ant = models.DecimalField(
        db_column="ImpSaldoAnt", max_digits=18, decimal_places=2, blank=True, null=True
    )
    imp_pagado = models.DecimalField(
        db_column="ImpPagado", max_digits=18, decimal_places=2, blank=True, null=True
    )
    imp_saldo_insoluto = models.DecimalField(
        db_column="ImpSaldoInsoluto", max_digits=18, decimal_places=2, blank=True, null=True
    )
    objeto_imp_dr = models.CharField(db_column="ObjetoImpDR", max_length=5, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    rfc_propietario = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "factura_doctos_relacionados"


class FacturaNotaCredito(models.Model):
    id = models.AutoField(primary_key=True)
    uuid = models.CharField(db_column="uuid", max_length=50, blank=True, null=True)
    uuid_relacionado = models.CharField(max_length=200, blank=True, null=True)
    clave_prod_serv = models.CharField(db_column="ClaveProdServ", max_length=100, blank=True, null=True)
    no_identificacion = models.CharField(
        db_column="NoIdentificacion", max_length=50, blank=True, null=True
    )
    cantidad = models.DecimalField(
        db_column="Cantidad", max_digits=20, decimal_places=6, blank=True, null=True
    )
    clave_unidad = models.CharField(db_column="ClaveUnidad", max_length=50, blank=True, null=True)
    unidad = models.CharField(db_column="Unidad", max_length=50, blank=True, null=True)
    descripcion = models.CharField(db_column="Descripcion", max_length=700, blank=True, null=True)
    valor_unitario = models.DecimalField(
        db_column="ValorUnitario", max_digits=20, decimal_places=6, blank=True, null=True
    )
    importe = models.DecimalField(
        db_column="Importe", max_digits=20, decimal_places=6, blank=True, null=True
    )
    objeto_imp = models.CharField(db_column="ObjetoImp", max_length=50, blank=True, null=True)
    base = models.CharField(db_column="Base", max_length=50, blank=True, null=True)
    impuesto = models.CharField(db_column="Impuesto", max_length=50, blank=True, null=True)
    tipo_factor = models.CharField(db_column="TipoFactor", max_length=50, blank=True, null=True)
    tasa_o_cuota = models.CharField(db_column="TasaOCuota", max_length=50, blank=True, null=True)
    importe_traslado = models.CharField(db_column="ImporteTraslado", max_length=50, blank=True, null=True)
    total_impuestos_trasladados = models.CharField(
        db_column="TotalImpuestosTrasladados", max_length=50, blank=True, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    rfc_propietario = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "factura_notas_credito"


class FacturaTraslado(models.Model):
    id = models.AutoField(primary_key=True)
    uuid = models.CharField(db_column="UUID", max_length=36, blank=True, null=True)
    base = models.CharField(db_column="Base", max_length=50, blank=True, null=True)
    impuesto = models.CharField(db_column="Impuesto", max_length=5, blank=True, null=True)
    tipo_factor = models.CharField(db_column="TipoFactor", max_length=10, blank=True, null=True)
    tasa_o_cuota = models.CharField(db_column="TasaOCuota", max_length=50, blank=True, null=True)
    importe = models.CharField(db_column="Importe", max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    rfc_propietario = models.CharField(max_length=50, blank=True, null=True)

    class Meta:
        db_table = "factura_traslados"
