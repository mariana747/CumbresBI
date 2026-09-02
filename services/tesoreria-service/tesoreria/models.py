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
    # X (02/Sep/2026, pedido explicito: "el campo clave que debes validar
    # primero es la CURP. Al extraer la letra de la posicion 15 de la
    # CURP (que solo puede ser H, M o X)...") - la CURP real solo permite
    # esas 3 letras en esa posicion (H=Hombre, M=Mujer, X=el valor que usa
    # RENAPO para personas extranjeras o casos sin la clasificacion H/M
    # estandar), faltaba la tercera opcion para poder derivar el genero
    # automaticamente de una CURP real sin dejar casos sin representar.
    GENERO_X = "X"
    GENERO_CHOICES = [
        (GENERO_MUJER, "Mujer"),
        (GENERO_HOMBRE, "Hombre"),
        (GENERO_X, "No binario"),  # el VALOR guardado sigue siendo "X"
    ]

    ORIGEN_MANUAL = "manual"
    ORIGEN_IA = "ia"
    # Alta automatica desde el expediente KYC autonomo de PLD (Opcion B,
    # ver pld-service/pld/models.py::PldContraparteKyc) - el analista crea
    # el expediente sin elegir contraparte del catalogo; en vez de que PLD
    # invente un id local que nunca existe aqui (huerfano garantizado,
    # hallazgo 02/Sep/2026 al cerrar la reconciliacion contraparte
    # maestra), pld-service crea el registro real aqui primero con
    # razon_social provisional - el cliente completa los datos reales
    # despues via el link publico de PLD, mismo patron de "completar
    # despues" que origen=ia ya usa para la conciliacion bancaria.
    ORIGEN_PLD = "pld"
    # "selector" (02/Sep/2026, hallazgo real: "no me deja crear desde
    # aqui" al usar el ContraparteSelector compartido -PLD/Ventas/Flujos-
    # con solo el nombre) - ese componente esta disenado desde el
    # principio para alta minima ("créala aquí mismo con solo el nombre.
    # El resto de sus datos los llena él después, desde el link público
    # que le mandes") pero nunca se actualizo cuando email/tipo_persona
    # volvieron a ser obligatorios para origen=manual (28/Ago/2026,
    # decision de Mariana) - quedo roto desde entonces. Origen propio
    # (no "ia", que es semanticamente distinto - conciliacion bancaria
    # automatica, no un analista escribiendo un nombre a mano) para que
    # la auditoria distinga las 3 vias de alta minima.
    ORIGEN_SELECTOR = "selector"
    ORIGEN_CHOICES = [
        (ORIGEN_MANUAL, "Alta manual"),
        (ORIGEN_IA, "Alta automatica por IA"),
        (ORIGEN_PLD, "Alta automatica desde PLD (expediente autónomo)"),
        (ORIGEN_SELECTOR, "Alta mínima desde selector (pendiente completar por ticket)"),
    ]

    id_contraparte = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    rfc = models.CharField(max_length=13, unique=True, blank=True, null=True)
    razon_social = models.CharField(max_length=100)
    contacto = models.CharField(max_length=100, blank=True, null=True)
    telefono_sms = models.CharField(max_length=10, blank=True, null=True)
    # Obligatorio de nuevo (28/Ago/2026, pedido explicito de Mariana, vuelve
    # al ERD original) - habia sido blank/null=True desde el 19/Ago/2026
    # ("contraparte maestra unica", alta minima con solo razon_social). Se
    # revierte esa relajacion: email es obligatorio otra vez. EXCEPCION:
    # cuando origen=ia (ver campo abajo), el serializer permite dejarlo
    # vacio - la IA de conciliacion bancaria no tiene forma de inventar un
    # correo real (ver memoria "tesoreria-flujos-registro-y-conciliacion-
    # ia-plan"). La constraint de BD se relaja a blank/null; quien impone
    # "obligatorio salvo IA" es el serializer, no el modelo.
    email = models.CharField(max_length=100, blank=True, null=True)
    # Marca si esta contraparte se dio de alta a mano (pantalla de
    # Contrapartes, exige email/tipo_persona) o automaticamente por la IA de
    # conciliacion de comprobantes bancarios (los permite vacios). Default
    # manual: toda alta existente y toda alta futura por la pantalla normal
    # queda con la validacion completa de siempre.
    origen = models.CharField(max_length=10, choices=ORIGEN_CHOICES, default=ORIGEN_MANUAL)
    comentarios = models.TextField(blank=True, null=True)
    permiso = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    autorizado_por = models.CharField(max_length=100, blank=True, null=True)
    apellido_paterno = models.CharField(max_length=100, blank=True, null=True)
    apellido_materno = models.CharField(max_length=100, blank=True, null=True)
    # Obligatorio de nuevo (28/Ago/2026) - ver comentario de "email" arriba,
    # mismo criterio y misma fecha de reversion. Misma excepcion origen=ia.
    tipo_persona = models.CharField(max_length=20, choices=TIPO_PERSONA_CHOICES, blank=True, null=True)
    genero = models.CharField(max_length=20, choices=GENERO_CHOICES, blank=True, null=True)
    cliente = models.BooleanField(default=False)
    proveedor = models.BooleanField(default=False)
    # Fusion de contrapartes duplicadas (02/Sep/2026, cierre real de la
    # reconciliacion contraparte maestra) - PLD y Ventas pueden crear cada
    # uno su propia contraparte de forma autonoma (ver origen=pld/manual
    # arriba); cuando mas tarde se le asigna el mismo RFC real a dos
    # registros distintos (el dato unico que de verdad identifica a la
    # misma persona/empresa), en vez de tronar con un IntegrityError se
    # fusionan automaticamente - ver TesoreriaContraparteSerializer.save()
    # y _fusionar_en(). Este campo, cuando NO es null, marca que ESTE
    # registro "perdio" la fusion: es un alias/tumba que ya no es el
    # catalogo vigente, apunta al sobreviviente real. self-FK, no CASCADE
    # (un alias no debe desaparecer si el sobreviviente se borra, aunque en
    # la practica un sobreviviente referenciado por Contrato/Factura/etc
    # con PROTECT tampoco se puede borrar).
    fusionado_en = models.ForeignKey(
        "self",
        db_column="fusionado_en",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="alias_fusionados",
    )

    class Meta:
        db_table = "tesoreria_contrapartes"

    def __str__(self):
        return self.razon_social

    def resolver_sobreviviente(self):
        """Sigue la cadena de fusiones hasta el registro vigente real (el
        que ya no tiene fusionado_en) - normalmente un solo salto, pero se
        seguiria mas de uno si alguna vez se fusiona un alias que a su vez
        ya era alias de otro (guard anti-loop por si acaso, un ciclo real
        no deberia poder ocurrir con la logica de _fusionar_en)."""
        visitados = set()
        actual = self
        while actual.fusionado_en_id and actual.fusionado_en_id not in visitados:
            visitados.add(actual.pk)
            actual = actual.fusionado_en
        return actual


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
    # Catalogo real del ERD, no libre - INVERSION habilita la accion
    # RENDIMIENTOS en el reporte diario de saldos (ver finanzas.md:
    # "In case the account type is investment, the user will have the
    # option to add a transaction record with the description
    # 'RENDIMIENTOS'..."). Default CHEQUES porque es lo que ya tienen todas
    # las cuentas existentes (ninguna tenia un campo de tipo antes de esto).
    TIPO_CHEQUES = "CHEQUES"
    TIPO_INVERSION = "INVERSION"
    TIPO_NOMINA = "NOMINA"
    TIPO_OTRA = "OTRA"
    TIPO_CHOICES = [
        (TIPO_CHEQUES, "Cheques"),
        (TIPO_INVERSION, "Inversión"),
        (TIPO_NOMINA, "Nómina"),
        (TIPO_OTRA, "Otra"),
    ]

    id_cuenta_bancaria = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    rfc_razon_social = models.CharField(max_length=50, blank=True, null=True)
    # Referencia laxa a general_sociedades.rfc (iam-service, fuera de este
    # esquema) - mismo criterio que TesoreriaContrato.sociedad (26/Ago/2026,
    # se agrega para poder filtrar el reporte diario de saldos "por
    # empresa (seleccion multiple)", ver finanzas.md). Nullable a proposito:
    # las cuentas existentes antes de este cambio no tienen este dato
    # capturado todavia.
    sociedad = models.CharField(max_length=13, blank=True, null=True)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default=TIPO_CHEQUES)
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
    # 31/Ago/2026 (pendiente Sem 21 del cronograma, ver memoria de sesion
    # "tesoreria-fase4-adelanto-y-pendientes"): CENTRO/CONTRATO ya existian
    # como claim en el JWT (IamUserCentroAccess/IamUserContratoAccess,
    # scope_utils.py) pero ningun modelo real los consumia todavia. CENTRO
    # es texto libre (mismo campo `centro`, sin catalogo real - ver
    # "centro-proyecto-no-son-catalogo-generico"); CONTRATO es auto-
    # referencia (un usuario con acceso solo a un contrato especifico ve
    # ese contrato, no toda su sociedad).
    SCOPE_FIELD_CENTRO = "centro"
    SCOPE_FIELD_CONTRATO = "id_contrato"
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
    # Vinculo real con el catalogo maestro de contrapartes (25/Ago/2026,
    # "vista por proveedor") - se llena automatico al capturar/confirmar
    # extraccion buscando una TesoreriaContraparte cuyo rfc == emisor_rfc
    # (aqui el emisor del CFDI es siempre el proveedor, Cumbres es el
    # receptor - ver TesoreriaComplementoPagoViewSet._vincular_contraparte).
    # Nullable a proposito: si el RFC del emisor no esta dado de alta como
    # contraparte (o el CFDI no trae RFC valido todavia), el registro sigue
    # existiendo sin vinculo, no se bloquea la captura por esto.
    contraparte = models.ForeignKey(
        TesoreriaContraparte,
        db_column="id_contraparte",
        on_delete=models.PROTECT,
        related_name="complementos_pago",
        blank=True,
        null=True,
    )
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
    # Estado del proceso de revision (24/Ago/2026, pedido explicito de
    # Mariana) - distinto del estado fiscal del CFDI ante el SAT
    # (vigente/cancelada, que hoy tambien vive en este mismo campo como
    # texto libre para las facturas ya capturadas antes de este cambio).
    # Pasar a ACEPTADA exige tener cargados los dos archivos esenciales
    # (link_pdf + link_xml, ver TesoreriaFacturaViewSet.marcar_estado) -
    # sin eso no hay forma de comprobar despues que el CFDI es el correcto.
    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_EN_PROCESO = "EN_PROCESO"
    ESTADO_ACEPTADA = "ACEPTADA"
    ESTADO_RECHAZADA = "RECHAZADA"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_EN_PROCESO, "En proceso"),
        (ESTADO_ACEPTADA, "Aceptada"),
        (ESTADO_RECHAZADA, "Rechazada"),
    ]

    id = models.AutoField(primary_key=True)
    # Ver comentario equivalente en TesoreriaComplementoPago - mismo motivo
    # y mismo criterio de auto-llenado por emisor_rfc.
    contraparte = models.ForeignKey(
        TesoreriaContraparte,
        db_column="id_contraparte",
        on_delete=models.PROTECT,
        related_name="facturas",
        blank=True,
        null=True,
    )
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
    # Vista previa (PDF) y comprobante fiscal digital (XML) son los dos
    # archivos esenciales que se piden para poder aceptar la factura (ver
    # ESTADO_CHOICES arriba) - se pegan a mano igual que link_pdf mientras
    # no exista una integracion real de subida de archivo para este flujo.
    link_xml = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)
    estado = models.CharField(
        max_length=50, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE, blank=True, null=True
    )

    class Meta:
        db_table = "tesoreria_facturas"

    def __str__(self):
        return self.timbre_uuid


class TesoreriaNotaCredito(models.Model):
    id = models.AutoField(primary_key=True)
    # Ver comentario equivalente en TesoreriaComplementoPago - mismo motivo
    # y mismo criterio de auto-llenado por emisor_rfc.
    contraparte = models.ForeignKey(
        TesoreriaContraparte,
        db_column="id_contraparte",
        on_delete=models.PROTECT,
        related_name="notas_credito_emitidas",
        blank=True,
        null=True,
    )
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
        on_delete=models.PROTECT,
        related_name="flujos",
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
    # link_comprobante_banco se llenaba pegando la URL a mano; desde
    # subir_comprobante() (finanzas.md, decision 26/Ago/2026: "upload
    # receipts/references from their computer") se llena con el
    # web_view_link real que regresa drive-service, y drive_file_id_comprobante
    # guarda el ID del archivo (permite reemplazarlo despues sin duplicar).
    link_comprobante_banco = models.TextField(blank=True, null=True)
    drive_file_id_comprobante = models.TextField(blank=True, null=True)
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

    # Alcance por sociedad (24/Ago/2026, Sem 21 del cronograma) via el
    # contrato relacionado - TesoreriaFlujo no tiene su propia columna de
    # sociedad (viene heredado de AppSheet asi), pero ScopedQuerySet.for_scope
    # soporta lookups con doble guion bajo (ver libs/cumbresbi-scope).
    # `contrato` es obligatorio (finanzas.md sec. "General Notes": "No
    # transaction can be registered without a linked contract", decision
    # 26/Ago/2026: sin excepcion, incluyendo reembolsos - estos usan un
    # contrato generico de la misma plantilla, ver migracion 0011), asi que
    # ya no hay flujos fuera de alcance por sociedad.
    SCOPE_FIELD_SOCIEDAD = "contrato__sociedad"
    # 31/Ago/2026, mismo criterio que TesoreriaContrato.SCOPE_FIELD_CENTRO/
    # CONTRATO arriba - via el contrato relacionado, igual que sociedad.
    SCOPE_FIELD_CENTRO = "contrato__centro"
    SCOPE_FIELD_CONTRATO = "contrato_id"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_flujos"

    def __str__(self):
        return self.id_flujo


class TesoreriaTicketReembolso(models.Model):
    """Ticket de reembolso subido por el empleado (pantalla PROVISIONAL
    "MiCumbres" /mi-cumbres/tickets, 27/Ago/2026) - puente minimo mientras
    no existe el portal MiCumbres real ni rrhh-service tiene API (Fase 5,
    sin arrancar, ver memoria de sesion "rrhh-mi-cumbres-y-modulo-pendiente").
    El empleado solo puede CREAR (subir su ticket); una vez creado, solo
    Tesoreria (tesoreria.editar) puede editarlo.

    Flujo real (27/Ago/2026, pedido explicito de Mariana): PENDIENTE ->
    Tesoreria revisa -> APROBADO o RECHAZADO. Solo si se aprueba se
    procede a facturar - subir el/los archivos (PDF, corren por el Motor
    Documental como staging antes de dar de alta la factura formal, mismo
    patron que la "bandeja de entrada" de Facturas) y LIGAR el ticket a un
    TesoreriaFactura real ya creado (`factura`, no un blob suelto) -> el
    ticket pasa a VINCULADO. `link_factura_pdf`/`drive_file_id_factura`
    siguen existiendo como staging previo a esa formalizacion (el PDF que
    se analiza con el Motor antes de llenar el alta de factura), no
    reemplazan el vinculo real.
    id_empleado es el identity_user_id del EffectiveScope (self-service),
    no una FK real a rrhh_empleados (no existe todavia)."""

    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_APROBADO = "APROBADO"
    ESTADO_VINCULADO = "VINCULADO"
    ESTADO_RECHAZADO = "RECHAZADO"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_APROBADO, "Aprobado — pendiente de facturar"),
        (ESTADO_VINCULADO, "Facturado y vinculado"),
        (ESTADO_RECHAZADO, "Rechazado"),
    ]

    # Campos agregados 31/Ago/2026 (hallazgo de la comparacion contra
    # Tesoreria2.pdf, ver memoria de sesion
    # "tesoreria-diseno-vs-construido-tesoreria2-pdf"): el ticket original
    # no traia a que empresa/area se carga el gasto ni en que moneda -
    # solo se asumia MXP y no se podia reportar por categoria/sociedad.
    # El empleado los llena al crear (igual que descripcion/monto/
    # fecha_gasto); solo Tesoreria los puede corregir despues.
    CATEGORIA_VIATICOS = "VIATICOS"
    CATEGORIA_PAPELERIA = "PAPELERIA"
    CATEGORIA_TRANSPORTE = "TRANSPORTE"
    CATEGORIA_ALIMENTOS = "ALIMENTOS"
    CATEGORIA_HOSPEDAJE = "HOSPEDAJE"
    CATEGORIA_OTRO = "OTRO"
    CATEGORIA_CHOICES = [
        (CATEGORIA_VIATICOS, "Viáticos"),
        (CATEGORIA_PAPELERIA, "Papelería"),
        (CATEGORIA_TRANSPORTE, "Transporte"),
        (CATEGORIA_ALIMENTOS, "Alimentos"),
        (CATEGORIA_HOSPEDAJE, "Hospedaje"),
        (CATEGORIA_OTRO, "Otro"),
    ]
    MONEDA_CHOICES = [("MXP", "MXP"), ("USD", "USD"), ("EUR", "EUR")]
    # Lista cerrada, no catalogo real (pedido explicito de Mariana
    # 31/Ago/2026: "centro de costo, ponlo como lista desplegable") -
    # distinto de TesoreriaContrato.centro (texto libre) porque ahi no se
    # pidio lo mismo; aqui se prefirio una lista fija de areas genericas
    # de la empresa en vez de dejarlo libre.
    CENTRO_ADMINISTRACION = "ADMINISTRACION"
    CENTRO_OBRA = "OBRA"
    CENTRO_VENTAS = "VENTAS"
    CENTRO_TESORERIA = "TESORERIA"
    CENTRO_RRHH = "RRHH"
    CENTRO_OTRO = "OTRO"
    CENTRO_CHOICES = [
        (CENTRO_ADMINISTRACION, "Administración"),
        (CENTRO_OBRA, "Obra"),
        (CENTRO_VENTAS, "Ventas"),
        (CENTRO_TESORERIA, "Tesorería"),
        (CENTRO_RRHH, "RRHH"),
        (CENTRO_OTRO, "Otro"),
    ]

    id_ticket = models.CharField(max_length=255, primary_key=True)
    id_empleado = models.CharField(max_length=255)
    descripcion = models.TextField()
    monto = models.DecimalField(max_digits=14, decimal_places=2)
    moneda = models.CharField(max_length=5, choices=MONEDA_CHOICES, default="MXP")
    fecha_gasto = models.DateField()
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    # Referencia laxa a general_sociedades.rfc (iam-service, fuera de este
    # esquema) - mismo criterio que TesoreriaContrato.sociedad. A que
    # empresa se le carga el gasto, no necesariamente la unica sociedad
    # del empleado (puede tener acceso a mas de una).
    sociedad = models.CharField(max_length=13, blank=True, null=True)
    centro = models.CharField(max_length=20, choices=CENTRO_CHOICES, blank=True, null=True)
    categoria_gasto = models.CharField(max_length=20, choices=CATEGORIA_CHOICES, blank=True, null=True)
    # Foto/comprobante del ticket - sube el empleado al crear.
    link_ticket = models.TextField(blank=True, null=True)
    drive_file_id_ticket = models.TextField(blank=True, null=True)
    # Staging del PDF de la factura real, antes de darla de alta formal -
    # lo sube Tesoreria (no el empleado) para poder analizarlo con el
    # Motor Documental y prellenar el alta de TesoreriaFactura.
    link_factura_pdf = models.TextField(blank=True, null=True)
    drive_file_id_factura = models.TextField(blank=True, null=True)
    # Vinculo real a la factura formal ya dada de alta (Facturas > Nueva
    # factura) - se llena en vincular_factura(), solo si estado=APROBADO.
    factura = models.ForeignKey(
        TesoreriaFactura,
        db_column="factura_uuid",
        to_field="timbre_uuid",
        on_delete=models.SET_NULL,
        related_name="tickets_reembolso",
        blank=True,
        null=True,
    )
    # Se liga cuando Tesoreria procesa el pago real (tesoreria_flujos.reembolso).
    flujo = models.ForeignKey(
        TesoreriaFlujo,
        db_column="id_flujo",
        on_delete=models.SET_NULL,
        related_name="tickets_reembolso",
        blank=True,
        null=True,
    )
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=255, blank=True, null=True)

    # 31/Ago/2026 (auditoria de scope, caso real: colaborador externo tipo
    # contador/abogado que solo debe ver los tickets de SU sociedad, no
    # todos) - este modelo ya tenia columnas `sociedad`/`centro` propias
    # (agregadas el mismo dia) pero nunca declaro ScopedManager, quedando
    # en lectura abierta para cualquiera con tesoreria.editar. SCOPE_FIELD_
    # IDENTITY reemplaza el filtro manual que antes vivia en
    # TesoreriaTicketReembolsoViewSet.get_queryset (empleado ve solo lo
    # suyo) - ahora es el mismo mecanismo de RLS que el resto del proyecto,
    # combinado por OR con sociedad/centro (ScopedQuerySet.for_scope).
    SCOPE_FIELD_SOCIEDAD = "sociedad"
    SCOPE_FIELD_CENTRO = "centro"
    SCOPE_FIELD_IDENTITY = "id_empleado"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_tickets_reembolso"
        ordering = ["-created_at"]

    def __str__(self):
        return self.id_ticket


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


class TesoreriaContratoDocumento(models.Model):
    """Checklist de documentos/info requeridos por contrato (diseño
    manuscrito Tesoreria2.pdf, 28/Ago/2026: "Liga archivo - todavia no esta
    implementado en BD. Pedir checklist de documentos/info"). Cada renglon
    es UN documento que ese contrato en particular necesita (ej. "Poliza de
    arrendamiento", "Identificacion oficial del fiador") - se define al
    dar de alta el contrato (o despues) y se marca `recibido` conforme se
    va juntando, con el link real al archivo en Drive una vez subido.

    No reemplaza `link_carpeta`/`link_contrato` de TesoreriaContrato (esos
    siguen siendo el contrato firmado en si) - esto es la lista de soporte
    adicional que el contrato exige antes de poder operarlo (ej. antes de
    aprobar su primer Flujo).

    `nombre` es un catalogo fijo (28/Ago/2026, pedido explicito de Mariana:
    "que sea una lista desplegable de las opciones") - no texto libre, para
    que el checklist sea consistente entre contratos. NOMBRE_OTRO existe
    como valvula de escape para el documento que no encaja en el catalogo
    (se especifica en `comentarios`)."""

    NOMBRE_CONTRATO_FIRMADO = "CONTRATO_FIRMADO"
    NOMBRE_IDENTIFICACION_OFICIAL = "IDENTIFICACION_OFICIAL"
    NOMBRE_COMPROBANTE_DOMICILIO = "COMPROBANTE_DOMICILIO"
    NOMBRE_CONSTANCIA_SITUACION_FISCAL = "CONSTANCIA_SITUACION_FISCAL"
    NOMBRE_ACTA_CONSTITUTIVA = "ACTA_CONSTITUTIVA"
    NOMBRE_PODER_NOTARIAL = "PODER_NOTARIAL"
    NOMBRE_POLIZA_SEGURO = "POLIZA_SEGURO"
    NOMBRE_REFERENCIAS_BANCARIAS = "REFERENCIAS_BANCARIAS"
    NOMBRE_OTRO = "OTRO"
    NOMBRE_CHOICES = [
        (NOMBRE_CONTRATO_FIRMADO, "Contrato firmado (PDF)"),
        (NOMBRE_IDENTIFICACION_OFICIAL, "Identificación oficial del representante legal"),
        (NOMBRE_COMPROBANTE_DOMICILIO, "Comprobante de domicilio"),
        (NOMBRE_CONSTANCIA_SITUACION_FISCAL, "Constancia de situación fiscal (RFC)"),
        (NOMBRE_ACTA_CONSTITUTIVA, "Acta constitutiva"),
        (NOMBRE_PODER_NOTARIAL, "Poder notarial del representante legal"),
        (NOMBRE_POLIZA_SEGURO, "Póliza de seguro"),
        (NOMBRE_REFERENCIAS_BANCARIAS, "Referencias bancarias"),
        (NOMBRE_OTRO, "Otro (especificar en comentarios)"),
    ]

    id = models.AutoField(primary_key=True)
    contrato = models.ForeignKey(
        TesoreriaContrato,
        db_column="id_contrato",
        on_delete=models.CASCADE,
        related_name="documentos_requeridos",
    )
    nombre = models.CharField(max_length=50, choices=NOMBRE_CHOICES)
    obligatorio = models.BooleanField(default=True)
    recibido = models.BooleanField(default=False)
    # Mismo patron que link_comprobante_banco en TesoreriaFlujo - se llena
    # con el web_view_link real que regresa drive-service al subir el
    # archivo, no una URL pegada a mano.
    link_archivo = models.TextField(blank=True, null=True)
    drive_file_id = models.TextField(blank=True, null=True)
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_contrato_documentos"
        ordering = ["contrato", "id"]

    def __str__(self):
        return f"{self.contrato_id} - {self.nombre}"


class TesoreriaDocumentoTicket(models.Model):
    """Ticket publico de un solo documento del checklist, sin login (28/Ago/2026,
    pedido explicito de Mariana: "esos [archivos] los subira el cliente...
    mediante una magic link por doc faltante" - el analista de Tesoreria ya
    NO sube el archivo el mismo, ver TesoreriaContratoDocumentoViewSet.
    subir_archivo, ahora gateado a tesoreria.aprobar como excepcion manual).
    Mismo patron que TesoreriaTicketProveedor (token en claro solo una vez,
    token_hash SHA-256 en BD, sin emitir sesion) pero ligado a UN renglon
    especifico del checklist en vez de a la contraparte en general - un
    ticket = un documento, generado uno por cada documento faltante al
    llamar TesoreriaContratoViewSet.enviar_recordatorio_documentos (nunca se
    reusa el mismo ticket para varios documentos)."""

    id_ticket = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    documento = models.ForeignKey(
        TesoreriaContratoDocumento,
        on_delete=models.CASCADE,
        related_name="tickets",
    )
    email = models.EmailField(max_length=254)
    token_hash = models.CharField(max_length=64, unique=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.CharField(max_length=8, blank=True, null=True)
    expires_at = models.DateTimeField()
    max_uses = models.IntegerField(default=1)
    uses_count = models.IntegerField(default=0)
    first_used_at = models.DateTimeField(blank=True, null=True)
    last_used_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "tesoreria_documento_tickets"
        ordering = ["-issued_at"]

    def __str__(self):
        return self.id_ticket


class TesoreriaTicketProveedor(models.Model):
    """Ticket publico de un solo uso para que un PROVEEDOR externo suba su
    factura sin necesitar cuenta ni login (27/Ago/2026, pedido de Mariana:
    "el proveedor sube su factura" - mismo patron de codigo que
    PldTicketCliente en pld-service, independiente - cada servicio
    mantiene su propio modelo, ver memoria de sesion
    "micumbres-tickets-reembolso-provisional"). Al canjearse NO emite
    sesion (a diferencia de IamMagicLink) - "validar" regresa el ticket
    directamente, protegido por reCAPTCHA en la subida real.

    token_hash: SHA-256 del token, nunca el token en claro (ver
    ticket_utils.py)."""

    id_ticket = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    contraparte = models.ForeignKey(
        TesoreriaContraparte,
        on_delete=models.CASCADE,
        db_column="id_contraparte",
        related_name="tickets_proveedor",
    )
    email = models.EmailField(max_length=254)
    token_hash = models.CharField(max_length=64, unique=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    # FK laxa a iam_users.user_id (iam-service), mismo criterio que
    # PldTicketCliente.issued_by.
    issued_by = models.CharField(max_length=8)
    expires_at = models.DateTimeField()
    max_uses = models.IntegerField()
    uses_count = models.IntegerField(default=0)
    first_used_at = models.DateTimeField(blank=True, null=True)
    last_used_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)
    # 31/Ago/2026 (pedido de Mariana: "los tickets de cliente si se filtran
    # automaticamente?" -> "hay que hacer ese filtro por sociedad y
    # proyecto") - contraparte es un catalogo compartido sin sociedad
    # propia, asi que no hay de donde heredar el alcance; el analista que
    # emite el ticket lo declara explicito (igual criterio que
    # TesoreriaTicketReembolso.sociedad/centro, agregados el mismo dia).
    sociedad = models.CharField(max_length=13, blank=True, null=True)
    proyecto = models.CharField(max_length=3, blank=True, null=True)

    SCOPE_FIELD_SOCIEDAD = "sociedad"
    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_ticket_proveedor"
        ordering = ["-issued_at"]

    def __str__(self):
        return self.id_ticket
