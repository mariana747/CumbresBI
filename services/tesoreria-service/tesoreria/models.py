import hashlib
import uuid

from cumbresbi_scope.managers import ScopedManager
from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


# Categoria de gasto: permite clasificar y rastrear movimientos de dinero
# por area (ej. Oficina vs. RRHH vs. Equipo de Computo). Se reusa EXACTO el
# catalogo que ya existia solo en TesoreriaTicketReembolsoConcepto (mismos
# 9 valores, sin agregar ninguno nuevo por ahora) y se extiende a
# TesoreriaFlujo/TesoreriaFactura/TesoreriaSolicitudPago para que TODO
# movimiento de dinero, no solo los reembolsos, se pueda clasificar igual.
#
# Deliberadamente NO es una tabla/catalogo en BD (serian los mismos 9
# valores fijos en 4 lugares via choices=, un solo lugar de verdad) - mas
# simple y de menor riesgo que migrar el campo ya vivo de Reembolsos a una
# FK nueva. Candidato a futuro (anotado, no implementado): alinear estos
# valores contra el Codigo Agrupador de Cuentas del SAT (Anexo 24) si algun
# dia existe un catalogo de cuentas contables real - hoy no aplica.
CATEGORIA_GASTO_VIATICOS = "VIATICOS"
CATEGORIA_GASTO_PAPELERIA = "PAPELERIA"
CATEGORIA_GASTO_TRANSPORTE = "TRANSPORTE"
CATEGORIA_GASTO_ALIMENTOS = "ALIMENTOS"
CATEGORIA_GASTO_HOSPEDAJE = "HOSPEDAJE"
CATEGORIA_GASTO_ADMINISTRACION = "ADMINISTRACION"
CATEGORIA_GASTO_RECURSOSHUMANOS = "RECURSOSHUMANOS"
CATEGORIA_GASTO_LEGAL = "LEGAL"
CATEGORIA_GASTO_EXTRAORDINARIOS = "EXTRAORDINARIOS"
CATEGORIA_GASTO_CHOICES = [
    (CATEGORIA_GASTO_VIATICOS, "Viáticos"),
    (CATEGORIA_GASTO_PAPELERIA, "Papelería"),
    (CATEGORIA_GASTO_TRANSPORTE, "Transporte"),
    (CATEGORIA_GASTO_ALIMENTOS, "Alimentos"),
    (CATEGORIA_GASTO_HOSPEDAJE, "Hospedaje"),
    (CATEGORIA_GASTO_ADMINISTRACION, "Administración"),
    (CATEGORIA_GASTO_RECURSOSHUMANOS, "Recursos Humanos"),
    (CATEGORIA_GASTO_LEGAL, "Legal"),
    (CATEGORIA_GASTO_EXTRAORDINARIOS, "Extraordinarios"),
]


# Catalogo real del SAT (c_MetodoPago del CFDI) - solo estos 2 valores
# existen: PUE (Pago en una sola exhibicion) o PPD (Pago en parcialidades
# o diferido). 18/Sep/2026: antes comprobante_metodo_pago era texto libre
# sin choices en TesoreriaFactura/TesoreriaNotaCredito (confirmado sin
# datos reales fuera de estos 2 valores/NULL antes de restringir).
METODO_PAGO_CHOICES = [
    ("PUE", "Pago en una sola exhibición"),
    ("PPD", "Pago en parcialidades o diferido"),
]


# Nota general: este servicio agrupa Tesoreria + CFDI/Facturacion + el
# maestro de Contrapartes (tesoreria_contrapartes) en un solo esquema, tal
# como estaba documentado en /README.md sec. 1.1 - separado
# de compras-tesoreria-service (que se queda sin tablas de negocio propias
# hasta que exista el dominio real de Compras en Fase 4, ver su models.py).


class TesoreriaBanco(models.Model):
    """Columnas de auditoria agregadas en Fase 0 (tabla heredada de AppSheet
    sin ellas). created_by/updated_by en char(8) para coincidir con
    iam_users.user_id."""

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
    # Pensado originalmente para alta minima (solo nombre, el resto se
    # completa despues via link publico) pero quedo roto desde que
    # email/tipo_persona volvieron a ser obligatorios para origen=manual.
    # Origen propio (no "ia", que es semanticamente distinto - conciliacion
    # bancaria automatica, no un analista escribiendo un nombre a mano)
    # para que la auditoria distinga las 3 vias de alta minima.
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
    # Obligatorio, vuelve al ERD original (se habia relajado a blank/null
    # temporalmente para permitir alta minima con solo razon_social).
    # EXCEPCION: cuando origen=ia (ver campo abajo), el serializer permite
    # dejarlo vacio - la IA de conciliacion bancaria no tiene forma de
    # inventar un correo real. La constraint de BD se relaja a blank/null;
    # quien impone "obligatorio salvo IA" es el serializer, no el modelo.
    email = models.CharField(max_length=100, blank=True, null=True)
    # Se descarto un campo "sucursal" de texto libre para distinguir
    # unidades de negocio de una misma contraparte (ej. IZEL Acuario vs
    # IZEL Restaurante) - una contraparte puede tener VARIAS sucursales, no
    # una sola fija por registro. La division real quedo resuelta por
    # SOLICITUD (ver TesoreriaTicketProveedor.subir_factura: subcarpeta
    # Tesoreria/Facturas/FacturasProveedores/<id_contraparte>/<id_ticket>),
    # no por un campo en la contraparte.
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
        """Sigue la cadena de fusiones hasta el registro vigente (sin
        fusionado_en). Guard anti-loop por si acaso; un ciclo real no
        deberia ocurrir."""
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
    # RENDIMIENTOS en el reporte diario de saldos (ver Finance Module:
    # "In case the account type is investment, the user will have the
    # option to add a transaction record with the description
    # 'RENDIMIENTOS'..."). Default CHEQUES porque es lo que ya tienen todas
    # las cuentas existentes (ninguna tenia un campo de tipo antes de esto).
    TIPO_CHEQUES = "CHEQUES"
    TIPO_INVERSION = "INVERSION"
    TIPO_NOMINA = "NOMINA"
    TIPO_PAGARE = "PAGARE"
    TIPO_OTRA = "OTRA"
    TIPO_CHOICES = [
        (TIPO_CHEQUES, "Cheques"),
        (TIPO_INVERSION, "Inversión"),
        (TIPO_NOMINA, "Nómina"),
        # PAGARE (23/Sep/2026) - categoria propia, distinta de Inversion
        # aunque tambien es un instrumento financiero.
        (TIPO_PAGARE, "Pagaré"),
        (TIPO_OTRA, "Otra"),
    ]

    id_cuenta_bancaria = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    rfc_razon_social = models.CharField(max_length=50, blank=True, null=True)
    # Referencia laxa a general_sociedades.rfc (iam-service, fuera de este
    # esquema) - mismo criterio que TesoreriaContrato.sociedad (26/Ago/2026,
    # se agrega para poder filtrar el reporte diario de saldos "por
    # empresa (seleccion multiple)", ver Finance Module). Nullable a proposito:
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

    # Categoria del contrato, distinto de TIPO_CHOICES (interno/externo, no
    # dice nada de la naturaleza del gasto). Nullable/opcional a proposito:
    # solo aplica a contratos nuevos, los que ya existian se quedan sin
    # categoria (no se hizo backfill).
    CATEGORIA_FORMAL_RECURRENTE = "FORMAL_RECURRENTE"
    CATEGORIA_GASTO_SUELTO = "GASTO_SUELTO"
    CATEGORIA_REEMBOLSO_EMPLEADO = "REEMBOLSO_EMPLEADO"
    CATEGORIA_COMPRA_ADQUISICION = "COMPRA_ADQUISICION"
    CATEGORIA_CHOICES = [
        (CATEGORIA_FORMAL_RECURRENTE, "Formal / recurrente"),
        (CATEGORIA_GASTO_SUELTO, "Gasto suelto / consumo único"),
        (CATEGORIA_REEMBOLSO_EMPLEADO, "Reembolso de empleado"),
        (CATEGORIA_COMPRA_ADQUISICION, "Compra / adquisición"),
    ]

    id_contrato = models.CharField(max_length=255, primary_key=True)
    categoria = models.CharField(max_length=20, choices=CATEGORIA_CHOICES, blank=True, null=True)
    fecha_generacion = models.DateField(blank=True, null=True)
    fecha_vencimiento = models.DateField(blank=True, null=True)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, blank=True, null=True)
    contraparte = models.ForeignKey(
        TesoreriaContraparte, db_column="id_contraparte", on_delete=models.PROTECT, related_name="contratos"
    )
    # Nullable (23/Sep/2026, "Sin sociedad") - contratos que no pertenecen a
    # ninguna sociedad en particular (gasto corporativo compartido). Vacio
    # queda FUERA del filtro de alcance por sociedad (ScopedQuerySet.for_scope,
    # "sociedad__in" nunca hace match con NULL) - solo alcance GLOBAL los ve,
    # a proposito.
    sociedad = models.CharField(max_length=13, blank=True, null=True)
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
    # CENTRO/CONTRATO ya existian como claim en el JWT
    # (IamUserCentroAccess/IamUserContratoAccess, scope_utils.py) pero
    # ningun modelo real los consumia todavia. CENTRO es texto libre
    # (mismo campo `centro`, sin catalogo real); CONTRATO es
    # auto-referencia (un usuario con acceso solo a un contrato especifico
    # ve ese contrato, no toda su sociedad).
    SCOPE_FIELD_CENTRO = "centro"
    SCOPE_FIELD_CONTRATO = "id_contrato"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_contratos"

    def __str__(self):
        return self.id_contrato


CONTRAPARTE_NOMINA_ID = "GENNOM"
CONTRATO_NOMINA_PREFIJO = "GEN-NOMINA-"


def contrato_generico_nomina(sociedad: str) -> "TesoreriaContrato":
    """Contrato generico obligatorio para Flujos de nomina, uno POR
    SOCIEDAD (mismo criterio que contrato_generico_reembolso) para que el
    filtro por empresa en Flujos/Reportes siga funcionando. get_or_create
    es idempotente."""
    TesoreriaContraparte.objects.get_or_create(
        id_contraparte=CONTRAPARTE_NOMINA_ID,
        defaults={"razon_social": "Nómina interna (genérico)"},
    )
    id_contrato = f"{CONTRATO_NOMINA_PREFIJO}{sociedad}"
    contrato, _ = TesoreriaContrato.objects.get_or_create(
        id_contrato=id_contrato,
        defaults={
            "sociedad": sociedad,
            "tipo": TesoreriaContrato.TIPO_INTERNO,
            "contraparte_id": CONTRAPARTE_NOMINA_ID,
            "concepto_factura": "Nómina",
            "status": TesoreriaContrato.STATUS_ACTIVO,
            "requiere_factura": False,
        },
    )
    return contrato


CONTRATO_REEMBOLSO_PREFIJO = "GEN-REEMBOLSOS-"


def _id_contraparte_reembolso(sociedad: str) -> str:
    """id_contraparte determinista por sociedad, corto (CharField(8), ver
    TesoreriaContraparte.id_contraparte) - "GENREEMB" + sociedad no cabe,
    de ahi el hash: mismo sociedad siempre da el mismo id (necesario para
    que get_or_create sea idempotente)."""
    return "RE" + hashlib.sha1(sociedad.encode()).hexdigest()[:6].upper()


def contrato_generico_reembolso(sociedad: str) -> "TesoreriaContrato":
    """Contrato Y Contraparte genericos de reembolso, uno POR SOCIEDAD
    (18/Sep/2026, corrige el criterio viejo de una sola Contraparte
    GENREEMB compartida por todas las sociedades) - mismo criterio que
    contrato_generico_nomina para el Contrato. Los reembolsos de una
    sociedad son un gasto de ESA sociedad, no deben mezclarse con los de
    otra en la misma Contraparte generica.

    Nota: esto NO cambia el criterio general de Contraparte - una
    Contraparte real (proveedor externo) SI puede seguir trabajando con
    una o mas sociedades a la vez (eso vive en Contrato.sociedad, no en
    Contraparte). Este prefijo por sociedad aplica solo a esta
    Contraparte generica/placeholder de reembolsos, no al catalogo en
    general.

    get_or_create es idempotente."""
    id_contraparte = _id_contraparte_reembolso(sociedad)
    TesoreriaContraparte.objects.get_or_create(
        id_contraparte=id_contraparte,
        defaults={"razon_social": f"Reembolsos a empleados (genérico) - {sociedad}"},
    )
    id_contrato = f"{CONTRATO_REEMBOLSO_PREFIJO}{sociedad}"
    contrato, _ = TesoreriaContrato.objects.get_or_create(
        id_contrato=id_contrato,
        defaults={
            "sociedad": sociedad,
            "tipo": TesoreriaContrato.TIPO_INTERNO,
            "contraparte_id": id_contraparte,
            "concepto_factura": "Reembolsos a empleados",
            "status": TesoreriaContrato.STATUS_ACTIVO,
            "requiere_factura": False,
        },
    )
    return contrato


class TesoreriaNomina(models.Model):
    """Periodo/agrupador de nomina, NO el CFDI (ver TesoreriaRecNomina). Se
    desglosa en N TesoreriaFlujo, uno por empleado. Fase 1: captura manual
    del empleado (rrhh-service aun sin API de Puestos)."""

    TIPO_QUINCENAL = "QUINCENAL"
    TIPO_SEMANAL = "SEMANAL"
    TIPO_CHOICES = [
        (TIPO_QUINCENAL, "Quincenal (corporativo)"),
        (TIPO_SEMANAL, "Semanal (obra)"),
    ]

    STATUS_ACTIVO = "ACTIVO"
    STATUS_CERRADA = "CERRADA"
    STATUS_CHOICES = [(STATUS_ACTIVO, "Activa"), (STATUS_CERRADA, "Cerrada")]

    id_nomina = models.CharField(max_length=255, primary_key=True)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    # sociedades (14/Sep/2026, "porque no se puede poner dos sociedades, ya
    # que pueden estar contratados por dos sociedades" - un empleado puede
    # tener Puestos vigentes en mas de una sociedad a la vez) - reemplaza el
    # viejo CharField `sociedad` unico (migracion 0048) por una relacion
    # real (TesoreriaNominaSociedad), no un CharField/JSON denormalizado,
    # para que el alcance (ScopedManager, ver SCOPE_FIELD_SOCIEDAD abajo)
    # siga siendo una consulta real y no un truco de substring.
    # proyecto solo aplica tipicamente a SEMANAL/obra - queda libre para
    # QUINCENAL/corporativo. A diferencia de TesoreriaContrato.proyecto
    # (CharField suelto de 3, sin catalogo real - hueco heredado que
    # Contratos/Obra siguen teniendo), aqui SI se liga al catalogo real:
    # vivienda-service.ViviendaProyecto.id_proyecto (los proyectos de
    # nomina son los mismos que los de Vivienda/Obra) - CharField plano
    # de 8 (mismo largo que id_proyecto),
    # no ForeignKey real (cruza de servicio, ver /README.md
    # sec. 11.2 #1). El frontend resuelve alias/denominacion llamando a
    # vivienda-service (ver listProyectos en frontend/src/lib/vivienda.ts).
    proyecto = models.CharField(max_length=8, blank=True, null=True)
    centro = models.CharField(max_length=100, blank=True, null=True)
    # serie: "Q1 2026", "S1 2026" (texto libre, no hay calculo de fechas
    # automatico) - tambien es el concepto default de los Flujos hijos.
    serie = models.CharField(max_length=50)
    fecha_inicio = models.DateField(blank=True, null=True)
    fecha_fin = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVO)
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    # sociedades__sociedad (14/Sep/2026) - filtra a traves de la relacion
    # inversa hacia TesoreriaNominaSociedad; ScopedQuerySet.for_scope hace
    # `sociedades__sociedad__in=scope.sociedad_rfcs`, que Django resuelve
    # con un JOIN normal. TesoreriaNominaViewSet.get_queryset agrega
    # .distinct() para no duplicar filas cuando 2+ sociedades de la misma
    # Nomina caen dentro del alcance del usuario a la vez.
    SCOPE_FIELD_SOCIEDAD = "sociedades__sociedad"
    SCOPE_FIELD_CENTRO = "centro"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_nominas"

    def __str__(self):
        return self.id_nomina


class TesoreriaNominaSociedad(models.Model):
    """Una sociedad de una TesoreriaNomina (empleados con doble sociedad) -
    relacion real en vez de CharField/JSON denormalizado; resuelve el
    contrato generico GEN-NOMINA-<sociedad> de cada Flujo."""

    nomina = models.ForeignKey(TesoreriaNomina, related_name="sociedades", on_delete=models.CASCADE)
    sociedad = models.CharField(max_length=13)

    class Meta:
        db_table = "tesoreria_nominas_sociedades"
        constraints = [
            models.UniqueConstraint(fields=["nomina", "sociedad"], name="unique_nomina_sociedad"),
        ]

    def __str__(self):
        return f"{self.nomina_id} — {self.sociedad}"


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
    # drive_file_id/mime_type (08/Sep/2026, "subir el extracto original a
    # Drive" - antes `link` se pegaba a mano; ahora, cuando el corte se crea
    # desde TesoreriaMovimientoBancarioViewSet.importar, se sube el archivo
    # real a drive-service y aqui queda el ID real (permite reemplazarlo
    # despues sin duplicar, mismo patron que TesoreriaFlujo.drive_file_id_comprobante).
    # Siguen NULL para un corte creado a mano con solo `link` pegado.
    drive_file_id = models.CharField(max_length=255, blank=True, null=True)
    mime_type = models.CharField(max_length=100, blank=True, null=True)
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
    # Documentos reales desde Drive (10/Sep/2026) - mismo patron que
    # TesoreriaFactura: drive_file_id_pdf/xml son la fuente real cuando el
    # archivo se selecciono via Motor Documental; link_pdf/link_xml se
    # llenan solos con el web_view_link para el boton "Abrir en Drive".
    link_pdf = models.TextField(blank=True, null=True)
    drive_file_id_pdf = models.TextField(blank=True, null=True)
    mime_type_pdf = models.CharField(max_length=100, blank=True, null=True)
    link_xml = models.TextField(blank=True, null=True)
    drive_file_id_xml = models.TextField(blank=True, null=True)
    mime_type_xml = models.CharField(max_length=100, blank=True, null=True)
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
    # Estado del proceso de revision, distinto del estado fiscal del CFDI ante el SAT
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
    # Ticket de proveedor de donde vino el archivo (09/Sep/2026, "los
    # documentos ya estan en Drive deben traerse de ahi") - el proveedor ya
    # subio el PDF real a Drive desde su ticket publico; sin este vinculo,
    # el apartado de Documentos solo mostraba el archivo si el analista
    # volvia a correr el Motor Documental justo al crear la factura -
    # ahora perform_create() copia drive_file_id_pdf del ticket si el
    # analista no mando uno nuevo explicito.
    ticket_origen = models.ForeignKey(
        "TesoreriaTicketProveedor",
        on_delete=models.SET_NULL,
        related_name="facturas",
        blank=True,
        null=True,
    )
    # categoria_gasto (09/Sep/2026) - ver comentario junto a
    # CATEGORIA_GASTO_CHOICES (junto a _short_id). El analista la captura
    # al confirmar la factura; permite reportar "en que se gasto mas" antes
    # incluso de que exista el Flujo que la paga.
    categoria_gasto = models.CharField(
        max_length=20, choices=CATEGORIA_GASTO_CHOICES, blank=True, null=True
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
    # comprobante_iva (10/Sep/2026, "en facturas se requiere el sub total
    # e IVA y total") - antes solo se guardaban Subtotal y Total; sin este
    # campo no habia forma de saber cuanto de un CFDI era IVA.
    comprobante_iva = models.DecimalField(
        db_column="Comprobante_IVA", max_digits=18, decimal_places=2, blank=True, null=True
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
        db_column="Comprobante_MetodoPago", max_length=5, blank=True, null=True, choices=METODO_PAGO_CHOICES
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
    # link_pdf/link_xml (07/Sep/2026, hueco real cerrado): antes eran solo
    # texto libre pegado a mano, sin ningun camino que los llenara solo -
    # ni el ticket publico del proveedor ni el Motor Documental los
    # escribian nunca (ver TesoreriaFacturaViewSet.CAMPOS_CONFIRMABLES,
    # nunca los incluyo). Ahora drive_file_id_pdf/xml son la fuente real
    # cuando el archivo se selecciono via Motor Documental (carpeta
    # Tesoreria/Facturas/<uuid> o FacturasProveedores/<contraparte>) -
    # confirmar_extraccion los llena con el archivo que de verdad se
    # analizo. link_pdf/link_xml se quedan (compatibilidad con lo pegado a
    # mano historicamente) pero ahora TAMBIEN se llenan solos con el
    # web_view_link de Drive cuando hay drive_file_id, para que el boton
    # "Abrir en pestaña nueva" del frontend siga funcionando igual.
    link_pdf = models.TextField(blank=True, null=True)
    drive_file_id_pdf = models.TextField(blank=True, null=True)
    mime_type_pdf = models.CharField(max_length=100, blank=True, null=True)
    # Vista previa (PDF) y comprobante fiscal digital (XML) son los dos
    # archivos esenciales que se piden para poder aceptar la factura (ver
    # ESTADO_CHOICES arriba).
    link_xml = models.TextField(blank=True, null=True)
    drive_file_id_xml = models.TextField(blank=True, null=True)
    mime_type_xml = models.CharField(max_length=100, blank=True, null=True)
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
        db_column="Comprobante_MetodoPago", max_length=5, blank=True, null=True, choices=METODO_PAGO_CHOICES
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
    # Documentos reales desde Drive (10/Sep/2026) - mismo patron que
    # TesoreriaFactura/TesoreriaComplementoPago.
    link_pdf = models.TextField(blank=True, null=True)
    drive_file_id_pdf = models.TextField(blank=True, null=True)
    mime_type_pdf = models.CharField(max_length=100, blank=True, null=True)
    link_xml = models.TextField(blank=True, null=True)
    drive_file_id_xml = models.TextField(blank=True, null=True)
    mime_type_xml = models.CharField(max_length=100, blank=True, null=True)
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
    # comprobante (11/Sep/2026, "subir comprobante no XML") - distinto de
    # link_pdf de arriba (ese es el PDF del CFDI timbrado). Aqui va la
    # evidencia de pago real (recibo firmado, foto, etc.), mismo patron que
    # TesoreriaSolicitudPago.link_comprobante.
    link_comprobante = models.TextField(blank=True, null=True)
    drive_file_id_comprobante = models.TextField(blank=True, null=True)
    mime_type_comprobante = models.CharField(max_length=100, blank=True, null=True)
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
    real (/README.md sec. 11.2 #1)."""

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
    # categoria_gasto (09/Sep/2026) - mismo catalogo compartido que ya
    # usaba Reembolsos (ver CATEGORIA_GASTO_CHOICES junto a _short_id), aqui
    # para poder reportar "en que se gasto mas" sobre TODOS los flujos, no
    # solo los que vienen de un ticket de reembolso.
    categoria_gasto = models.CharField(
        max_length=20, choices=CATEGORIA_GASTO_CHOICES, blank=True, null=True
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
    # Referencia (23/Sep/2026, "en flujos, referencia no deben ser los
    # flujos asociados, sino subir un pdf llamado referencia") - mismo
    # patron que link_comprobante_banco/drive_file_id_comprobante abajo:
    # link_referencia guarda el web_view_link, drive_file_id_referencia el
    # ID del archivo (permite reemplazarlo sin duplicar).
    link_referencia = models.TextField(blank=True, null=True)
    drive_file_id_referencia = models.TextField(blank=True, null=True)
    pagado = models.BooleanField(blank=True, null=True)
    fecha_pago = models.DateField(blank=True, null=True)
    fecha_pago_original = models.DateField(blank=True, null=True)
    descripcion_pago = models.CharField(max_length=150, blank=True, null=True)
    # link_comprobante_banco se llenaba pegando la URL a mano; desde
    # subir_comprobante() (Finance Module, decision 26/Ago/2026: "upload
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
    # periodo_nomina (10/Sep/2026, modulo de Nominas Fase 1) - distinto de
    # `nomina` de arriba (ese es el CFDI/recibo timbrado individual, este es
    # el agrupador/periodo de TesoreriaNomina). Un Flujo de nomina es la
    # linea de pago a UN empleado dentro de ese periodo - ver
    # TesoreriaNomina docstring.
    periodo_nomina = models.ForeignKey(
        TesoreriaNomina,
        db_column="id_nomina_periodo",
        on_delete=models.PROTECT,
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
    # `contrato` es obligatorio (Finance Module, "General Notes": "No
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
        # Guardrail (10/Sep/2026): un flujo pagado solo puede llegar ahi
        # habiendo pasado por aprobar() (autorizacion=True + validacion_estado
        # APROBADA se ponen juntos, ver TesoreriaFlujoViewSet.aprobar/
        # registrar_pago) - un registro con pagado=True y validacion_estado
        # distinto de APROBADA es dato inconsistente (encontrado en un seed
        # de demo, ver migracion 0045_fix_validacion_estado_flujos_pagados).
        constraints = [
            models.CheckConstraint(
                check=~models.Q(pagado=True) | models.Q(validacion_estado="APROBADA"),
                name="tesoreria_flujo_pagado_requiere_aprobada",
            ),
        ]

    def __str__(self):
        return self.id_flujo


class TesoreriaMovimientoBancario(models.Model):
    """Linea del estado de cuenta, importada de CSV/Excel: lado "banco" de
    la conciliacion, distinto de TesoreriaFlujo (registro interno). `flujo`
    null significa sin conciliar todavia."""

    id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    cuenta = models.ForeignKey(
        TesoreriaCuenta, db_column="cuenta", on_delete=models.CASCADE, related_name="movimientos_bancarios"
    )
    # Corte/EDC del que se importo esta linea (el archivo real vive ahi,
    # ver TesoreriaCorteEdc.link) - null si el registro se creo a mano en
    # vez de por importacion.
    corte_edc = models.ForeignKey(
        TesoreriaCorteEdc,
        db_column="corte_edc",
        on_delete=models.SET_NULL,
        related_name="movimientos",
        blank=True,
        null=True,
    )
    fecha = models.DateField()
    descripcion = models.CharField(max_length=255, blank=True, null=True)
    referencia = models.CharField(max_length=100, blank=True, null=True)
    cargo = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    abono = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    saldo = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    flujo = models.ForeignKey(
        TesoreriaFlujo,
        db_column="flujo",
        on_delete=models.SET_NULL,
        related_name="movimientos_bancarios",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)

    # Alcance por sociedad via la cuenta relacionada, mismo criterio que
    # TesoreriaFlujo.SCOPE_FIELD_SOCIEDAD via contrato.
    SCOPE_FIELD_SOCIEDAD = "cuenta__sociedad"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_movimientos_bancarios"
        ordering = ["-fecha"]

    def __str__(self):
        return str(self.id)


class TesoreriaDiaFestivo(models.Model):
    """Cache local de festivos oficiales de MX (Nager.Date), usada para
    calcular dias habiles de reembolsos (ver reembolso_utils). Se
    sincroniza sola (perezosa) o a mano; editable por si la fuente externa
    falla."""

    fecha = models.DateField(primary_key=True)
    descripcion = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_dias_festivos"
        ordering = ["fecha"]

    def __str__(self):
        return f"{self.fecha} ({self.descripcion})"


class TesoreriaTicketReembolso(models.Model):
    """Ticket de reembolso del empleado (pantalla provisional MiCumbres,
    puente mientras no existe el portal real). El empleado solo CREA; una
    vez creado, solo Tesoreria lo edita. Flujo: PENDIENTE ->
    APROBADO/RECHAZADO -> VINCULADO al ligarse a una TesoreriaFactura real.
    id_empleado es el identity_user_id, no FK real a rrhh_empleados."""

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

    # El ticket original no traia a que empresa/area se carga el gasto ni
    # en que moneda - solo se asumia MXP y no se podia reportar por
    # categoria/sociedad. El empleado los llena al crear; `sociedad` es
    # inmutable despues (ver comentario en el campo mas abajo) - si se
    # equivoca de sociedad se rechaza el ticket completo, no se corrige.
    # Promovido a constante compartida a nivel de modulo
    # (CATEGORIA_GASTO_CHOICES, ver comentario junto a _short_id arriba) -
    # los alias de clase se quedan por compatibilidad con codigo/migraciones
    # viejas que referencian TesoreriaTicketReembolso.CATEGORIA_*.
    CATEGORIA_VIATICOS = CATEGORIA_GASTO_VIATICOS
    CATEGORIA_PAPELERIA = CATEGORIA_GASTO_PAPELERIA
    CATEGORIA_TRANSPORTE = CATEGORIA_GASTO_TRANSPORTE
    CATEGORIA_ALIMENTOS = CATEGORIA_GASTO_ALIMENTOS
    CATEGORIA_HOSPEDAJE = CATEGORIA_GASTO_HOSPEDAJE
    CATEGORIA_ADMINISTRACION = CATEGORIA_GASTO_ADMINISTRACION
    CATEGORIA_RECURSOSHUMANOS = CATEGORIA_GASTO_RECURSOSHUMANOS
    CATEGORIA_LEGAL = CATEGORIA_GASTO_LEGAL
    CATEGORIA_EXTRAORDINARIOS = CATEGORIA_GASTO_EXTRAORDINARIOS
    CATEGORIA_CHOICES = CATEGORIA_GASTO_CHOICES
    MONEDA_CHOICES = [("MXP", "MXP"), ("USD", "USD"), ("EUR", "EUR")]
    # centro (lista cerrada de areas) se elimino, sin reemplazo aqui -
    # `proyecto` (division por proyecto) es de Solicitud de Pago, no de
    # Reembolso.

    id_ticket = models.CharField(max_length=255, primary_key=True)
    id_empleado = models.CharField(max_length=255)
    # Nota general del ticket completo (opcional) - el detalle real vive en
    # los conceptos (TesoreriaTicketReembolsoConcepto), uno por gasto
    # individual. Antes este campo era obligatorio y unico por ticket; se
    # movio descripcion/monto/categoria_gasto a una lista de conceptos,
    # mismo patron que CotizacionLinea en compras-tesoreria-service - un
    # ticket ahora es "un comprobante, N conceptos", no "un comprobante,
    # un gasto".
    descripcion = models.TextField(blank=True, null=True)
    # Inmutable tras crear, igual que `sociedad` mas abajo - cualquier
    # error de sociedad o moneda al capturar el ticket no se corrige,
    # se rechaza - se descarta en TesoreriaTicketReembolsoSerializer.update.
    moneda = models.CharField(max_length=5, choices=MONEDA_CHOICES, default="MXP")
    fecha_gasto = models.DateField()
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    # Referencia laxa a general_sociedades.rfc (iam-service, fuera de este
    # esquema) - mismo criterio que TesoreriaContrato.sociedad. A que
    # empresa se le carga el gasto, no necesariamente la unica sociedad
    # del empleado (puede tener acceso a mas de una).
    # Inmutable tras crear (03/Sep/2026, ver comentario arriba) - se
    # descarta en el serializer para que ni el empleado ni Tesoreria lo
    # puedan corregir via PATCH; un ticket con la sociedad equivocada se
    # rechaza entero.
    sociedad = models.CharField(max_length=13, blank=True, null=True)
    # Foto/comprobante del ticket - sube el empleado al crear.
    link_ticket = models.TextField(blank=True, null=True)
    drive_file_id_ticket = models.TextField(blank=True, null=True)
    # mime_type_* (04/Sep/2026, "usa lo mismo que en pld" - ver
    # PldContraparteDoc.mime_type/PldContraparteDocViewSet.ver): el
    # endpoint de descarga de drive-service siempre regresa
    # application/octet-stream, no conoce el tipo real - se captura aqui
    # al subir (resultado["mime_type"] de driveclient.upload_bytes) para
    # poder servir el archivo con el Content-Type correcto y que el
    # navegador lo previsualice en vez de forzar la descarga.
    mime_type_ticket = models.CharField(max_length=100, blank=True, null=True)
    # Staging del PDF de la factura real, antes de darla de alta formal -
    # lo sube Tesoreria (no el empleado) para poder analizarlo con el
    # Motor Documental y prellenar el alta de TesoreriaFactura.
    link_factura_pdf = models.TextField(blank=True, null=True)
    drive_file_id_factura = models.TextField(blank=True, null=True)
    mime_type_factura = models.CharField(max_length=100, blank=True, null=True)
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
    # Quien aprobo el ticket (paso "autorizar antes de pagar" de la minuta,
    # 03/Sep/2026) y cuando - antes aprobar() solo cambiaba el estado sin
    # dejar rastro de quien lo hizo, a diferencia de TesoreriaFlujo.aprobar
    # que si lo registraba. Se resuelve del JWT en la accion, no del body.
    autorizado_por = models.CharField(max_length=255, blank=True, null=True)
    fecha_autorizacion = models.DateField(blank=True, null=True)
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=255, blank=True, null=True)

    # 31/Ago/2026 (auditoria de scope, caso real: colaborador externo tipo
    # contador/abogado que solo debe ver los tickets de SU sociedad, no
    # todos) - este modelo ya tenia columna `sociedad` propia (agregada el
    # mismo dia) pero nunca declaro ScopedManager, quedando en lectura
    # abierta para cualquiera con tesoreria.editar. SCOPE_FIELD_IDENTITY
    # reemplaza el filtro manual que antes vivia en
    # TesoreriaTicketReembolsoViewSet.get_queryset (empleado ve solo lo
    # suyo) - ahora es el mismo mecanismo de RLS que el resto del proyecto,
    # combinado por OR con sociedad (ScopedQuerySet.for_scope).
    # SCOPE_FIELD_CENTRO se elimino junto con el campo `centro` (03/Sep/2026,
    # ver comentario arriba) - un colaborador externo scoped por centro deja
    # de tener ese filtro extra en este modelo; sociedad/id_empleado siguen
    # cubriendo el resto de los casos de alcance ya probados.
    SCOPE_FIELD_SOCIEDAD = "sociedad"
    SCOPE_FIELD_IDENTITY = "id_empleado"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_tickets_reembolso"
        ordering = ["-created_at"]

    def __str__(self):
        return self.id_ticket


class TesoreriaTicketReembolsoConcepto(models.Model):
    """Un gasto individual dentro de un ticket de reembolso (mismo patron
    que CotizacionLinea). categoria_gasto vive por concepto, no en el
    ticket, porque un comprobante puede mezclar categorias."""

    CATEGORIA_CHOICES = TesoreriaTicketReembolso.CATEGORIA_CHOICES

    id_concepto = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    ticket = models.ForeignKey(
        TesoreriaTicketReembolso, db_column="id_ticket", on_delete=models.CASCADE, related_name="conceptos"
    )
    descripcion = models.CharField(max_length=250)
    monto = models.DecimalField(max_digits=14, decimal_places=2)
    categoria_gasto = models.CharField(max_length=20, choices=CATEGORIA_CHOICES, blank=True, null=True)

    class Meta:
        db_table = "tesoreria_tickets_reembolso_conceptos"

    def __str__(self):
        return f"{self.descripcion} (${self.monto})"


class TesoreriaSolicitudPago(models.Model):
    """Solicitud de pago de servicios/licencias, por proyecto. Distinta de
    Reembolso: requiere el permiso `solicitud-pago.crear`, no abierto a
    cualquier empleado. Comprobante/factura OPCIONAL (puede no haber CFDI
    formal), por eso no hay estado VINCULADO como en Reembolso. Flujo:
    PENDIENTE -> APROBADO/RECHAZADO -> PAGADO."""

    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_APROBADO = "APROBADO"
    ESTADO_RECHAZADO = "RECHAZADO"
    ESTADO_PAGADO = "PAGADO"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_APROBADO, "Aprobado — pendiente de pago"),
        (ESTADO_RECHAZADO, "Rechazado"),
        (ESTADO_PAGADO, "Pagado"),
    ]

    TIPO_SERVICIO = "SERVICIO"
    TIPO_LICENCIA = "LICENCIA"
    TIPO_RENOVACION = "RENOVACION"
    TIPO_OTRO = "OTRO"
    TIPO_CHOICES = [
        (TIPO_SERVICIO, "Servicio"),
        (TIPO_LICENCIA, "Licencia"),
        (TIPO_RENOVACION, "Renovación"),
        (TIPO_OTRO, "Otro"),
    ]

    MONEDA_CHOICES = [("MXP", "MXP"), ("USD", "USD"), ("EUR", "EUR")]

    id_solicitud = models.CharField(max_length=255, primary_key=True)
    # Referencia laxa al mismo catalogo de proyectos que usa Compras/Obra
    # (ej. SolicitudCompra.proyecto) - "se dividira por proyecto" (minuta).
    proyecto = models.CharField(max_length=8)
    # A que empresa se le carga el pago - mismo criterio que
    # TesoreriaTicketReembolso.sociedad, tambien inmutable tras crear (ver
    # serializer) por el mismo criterio de "cualquier error... no se
    # aceptara" aplicado ahi.
    sociedad = models.CharField(max_length=13, blank=True, null=True)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    # categoria_gasto (09/Sep/2026) - ver comentario junto a
    # CATEGORIA_GASTO_CHOICES (junto a _short_id), mismo catalogo que
    # Reembolsos/Facturas/Flujos.
    categoria_gasto = models.CharField(
        max_length=20, choices=CATEGORIA_GASTO_CHOICES, blank=True, null=True
    )
    descripcion = models.TextField()
    monto = models.DecimalField(max_digits=14, decimal_places=2)
    moneda = models.CharField(max_length=5, choices=MONEDA_CHOICES, default="MXP")
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    # Quien solicita - identity_user_id del EffectiveScope, resuelto en
    # perform_create (igual que TesoreriaTicketReembolso.id_empleado), no
    # lo que mande el body.
    solicitado_por = models.CharField(max_length=255)
    # Quien autoriza y cuando - se resuelve del JWT en aprobar(), igual que
    # TesoreriaTicketReembolso.autorizado_por ("la persona que lo autorizo
    # debe hacerlo manualmente", minuta).
    autorizado_por = models.CharField(max_length=255, blank=True, null=True)
    fecha_autorizacion = models.DateField(blank=True, null=True)
    # Comprobante OPCIONAL (ver docstring de la clase) - mismo patron de
    # staging que TesoreriaTicketReembolso.link_factura_pdf/factura, pero
    # aqui nunca es requisito para llegar a PAGADO.
    link_comprobante = models.TextField(blank=True, null=True)
    drive_file_id_comprobante = models.TextField(blank=True, null=True)
    # Content-Type real (ver ver_comprobante/_servir_documento_drive) -
    # mismo criterio que mime_type_ticket/mime_type_factura en Reembolso.
    mime_type_comprobante = models.CharField(max_length=100, blank=True, null=True)
    factura = models.ForeignKey(
        TesoreriaFactura,
        db_column="factura_uuid",
        to_field="timbre_uuid",
        on_delete=models.SET_NULL,
        related_name="solicitudes_pago",
        blank=True,
        null=True,
    )
    # Se liga cuando Tesoreria procesa el pago real - estado pasa a PAGADO.
    flujo = models.ForeignKey(
        TesoreriaFlujo,
        db_column="id_flujo",
        on_delete=models.SET_NULL,
        related_name="solicitudes_pago",
        blank=True,
        null=True,
    )
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=255, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=255, blank=True, null=True)

    SCOPE_FIELD_PROYECTO = "proyecto"
    SCOPE_FIELD_SOCIEDAD = "sociedad"
    SCOPE_FIELD_IDENTITY = "solicitado_por"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_solicitudes_pago"
        ordering = ["-created_at"]

    def __str__(self):
        return self.id_solicitud


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
    """Checklist de documentos requeridos por contrato; cada renglon es un
    documento que se marca `recibido` al subirse a Drive. No reemplaza
    link_carpeta/link_contrato (el contrato firmado en si). `nombre` es
    catalogo fijo; NOMBRE_OTRO + `comentarios` cubren casos fuera de
    catalogo."""

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
    """Ticket publico sin login por UN documento del checklist: el cliente
    sube el archivo via magic link. Mismo patron que
    TesoreriaTicketProveedor (token_hash SHA-256, sin sesion), pero un
    ticket = un documento, nunca reusado."""

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
    """Ticket publico de un solo uso para que un proveedor suba su factura
    sin cuenta ni login (mismo patron que PldTicketCliente, modelo propio
    de este servicio). No emite sesion al canjearse; token_hash es
    SHA-256, nunca el token en claro."""

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
    # contraparte es un catalogo compartido sin sociedad propia, asi que
    # no hay de donde heredar el alcance para filtrar tickets por
    # sociedad/proyecto; el analista que emite el ticket lo declara
    # explicito (igual criterio que TesoreriaTicketReembolso.sociedad/centro).
    sociedad = models.CharField(max_length=13, blank=True, null=True)
    proyecto = models.CharField(max_length=3, blank=True, null=True)
    # Archivo real ya subido a Drive por el proveedor (09/Sep/2026, "los
    # documentos ya estan en Drive deben traerse de ahi") - subir_factura
    # ya subia el PDF a Drive pero nunca guardaba el file_id en ningun
    # lado, asi que "ver documento" solo funcionaba hasta que el analista
    # corria el Motor Documental. Con esto el boton de ver puede funcionar
    # apenas se recibe, sin esperar a nadie mas.
    drive_file_id_pdf = models.CharField(max_length=100, blank=True, null=True)
    mime_type_pdf = models.CharField(max_length=100, blank=True, null=True)
    # XML (09/Sep/2026, "que el ticket del proveedor tambien acepte subir
    # el XML" - antes solo se subia el PDF, el XML siempre caia al link
    # manual pegado a mano). Mismo criterio que drive_file_id_pdf.
    drive_file_id_xml = models.CharField(max_length=100, blank=True, null=True)
    mime_type_xml = models.CharField(max_length=100, blank=True, null=True)

    SCOPE_FIELD_SOCIEDAD = "sociedad"
    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "tesoreria_ticket_proveedor"
        ordering = ["-issued_at"]

    def __str__(self):
        return self.id_ticket
