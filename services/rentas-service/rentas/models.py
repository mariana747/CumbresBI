import uuid

from cumbresbi_scope.managers import ScopedManager
from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


class RentasUbicacion(models.Model):
    """propietario_rfc referencia general_sociedades.rfc (iam-service, fuera
    de este esquema) - CharField plano, no ForeignKey real (docs/architecture/
    README.md sec. 11.2 #1). created_by/updated_by referencian iam_users
    igual criterio.
    """

    id_ubicacion = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    denominacion = models.CharField(max_length=255)
    calle = models.CharField(max_length=255)
    numero = models.CharField(max_length=50)
    interior = models.CharField(max_length=50, blank=True, null=True)
    colonia = models.CharField(max_length=255)
    municipio = models.CharField(max_length=255)
    estado = models.CharField(max_length=255)
    codigo_postal = models.CharField(max_length=10)
    pais = models.CharField(max_length=255)
    propietario_rfc = models.CharField(max_length=13)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    # 31/Ago/2026 (auditoria de scope): este servicio todavia no tiene
    # views.py/serializers.py/tests.py (solo modelos, sin API expuesta),
    # asi que hoy no hay endpoint vulnerable - se declara el scope de una
    # vez para que quede listo cuando se construya el CRUD, mismo criterio
    # ya aplicado en materiales/vivienda-service.
    SCOPE_FIELD_SOCIEDAD = "propietario_rfc"
    objects = ScopedManager()

    class Meta:
        db_table = "rentas_ubicaciones"

    def __str__(self):
        return self.denominacion


class RentasInmueble(models.Model):
    TIPO_COMERCIAL = "COMERCIAL"
    TIPO_PUBLICIDAD = "PUBLICIDAD"
    TIPO_ESTACIONAMIENTO = "ESTACIONAMIENTO"
    TIPO_OFICINAS = "OFICINAS"
    TIPO_HABITACIONAL = "HABITACIONAL"
    TIPO_CHOICES = [
        (TIPO_COMERCIAL, "Comercial"),
        (TIPO_PUBLICIDAD, "Publicidad"),
        (TIPO_ESTACIONAMIENTO, "Estacionamiento"),
        (TIPO_OFICINAS, "Oficinas"),
        (TIPO_HABITACIONAL, "Habitacional"),
    ]

    id_inmueble = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    ubicacion = models.ForeignKey(
        RentasUbicacion, db_column="id_ubicacion", on_delete=models.PROTECT, related_name="inmuebles"
    )
    denominacion = models.CharField(max_length=255)
    numero_inmueble = models.CharField(max_length=50)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    superficie = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    renta_m2_vigente = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    subtotal_renta = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    genera_iva = models.BooleanField(default=True)
    monto_renta_iva = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    mtto_porc = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    subtotal_mtto = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    monto_mtto_iva = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    publicidad_porc = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    subtotal_publicidad = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    monto_publicidad_iva = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    subtotal_agua = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    monto_agua_iva = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    link_carpeta = models.CharField(max_length=2083, blank=True, null=True)
    link_escrituras = models.CharField(max_length=2083, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "ubicacion__propietario_rfc"
    objects = ScopedManager()

    class Meta:
        db_table = "rentas_inmuebles"

    def __str__(self):
        return self.denominacion


class RentasContrato(models.Model):
    """arrendador referencia general_sociedades.rfc (iam-service). arrendatario
    y fiador referencian tesoreria_contrapartes.id_contraparte (tesoreria-
    service). id_contrato_tesoreria referencia tesoreria_contratos.id_contrato
    (tesoreria-service). Todas fuera de este esquema - CharField plano, no
    ForeignKey real (docs/architecture/README.md sec. 11.2 #1)."""

    ESTADO_BORRADOR = "BORRADOR"
    ESTADO_PENDIENTE_FIRMA = "PENDIENTE FIRMA"
    ESTADO_VIGENTE = "VIGENTE"
    ESTADO_VENCIDO = "VENCIDO"
    ESTADO_RESCINDIDO = "RESCINDIDO"
    ESTADO_CHOICES = [
        (ESTADO_BORRADOR, "Borrador"),
        (ESTADO_PENDIENTE_FIRMA, "Pendiente firma"),
        (ESTADO_VIGENTE, "Vigente"),
        (ESTADO_VENCIDO, "Vencido"),
        (ESTADO_RESCINDIDO, "Rescindido"),
    ]

    id_rentas_contrato = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    id_contrato_tesoreria = models.CharField(max_length=255)
    arrendador = models.CharField(max_length=13)
    arrendatario = models.CharField(max_length=8)
    fiador = models.CharField(max_length=8, blank=True, null=True)
    nombre_comercial = models.CharField(max_length=255)
    giro = models.CharField(max_length=255)
    subtotal_renta_inicial = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    renta_var_porc = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    subtotal_mtto_inicial = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    num_dep_garantia = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    monto_dep_garantia = models.DecimalField(max_digits=10, decimal_places=2)
    num_rentas_ant = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    monto_rentas_ant = models.DecimalField(max_digits=10, decimal_places=2)
    dias_factura = models.IntegerField(blank=True, null=True)
    dias_pago = models.IntegerField(blank=True, null=True)
    fecha_firma = models.DateField(blank=True, null=True)
    fecha_entrega = models.DateField(blank=True, null=True)
    fecha_apertura = models.DateField(blank=True, null=True)
    plazo_arrendador_meses = models.IntegerField(blank=True, null=True)
    fecha_vigencia_arrendador = models.DateField(blank=True, null=True)
    plazo_arrendatario_meses = models.IntegerField(blank=True, null=True)
    fecha_vigencia_arrendatario = models.DateField(blank=True, null=True)
    fecha_rescision = models.DateField(blank=True, null=True)
    fac_uso_cfdi = models.CharField(max_length=10)
    fac_regimen_fiscal = models.CharField(max_length=10)
    fac_metodo_pago = models.CharField(max_length=10)
    fac_forma_pago = models.CharField(max_length=10)
    fac_publico_general = models.BooleanField(blank=True, null=True)
    fac_cp_fiscal = models.CharField(max_length=5, blank=True, null=True)
    fac_email = models.CharField(max_length=100, blank=True, null=True)
    condiciones_local = models.CharField(max_length=500, blank=True, null=True)
    acometida_electrica = models.BooleanField(blank=True, null=True)
    servicio_telefonico = models.CharField(max_length=500, blank=True, null=True)
    agua_drenaje = models.CharField(max_length=500, blank=True, null=True)
    totem = models.BooleanField(blank=True, null=True)
    cobro_agua = models.BooleanField(blank=True, null=True)
    cobro_luz = models.BooleanField(default=False)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_BORRADOR)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "arrendador"
    SCOPE_FIELD_CONTRATO = "id_contrato_tesoreria"
    objects = ScopedManager()

    class Meta:
        db_table = "rentas_contratos"

    def __str__(self):
        return self.nombre_comercial


class RentasInmuebleContrato(models.Model):
    id_rel_inmb_cont = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    inmueble = models.ForeignKey(
        RentasInmueble,
        db_column="id_inmueble",
        on_delete=models.CASCADE,
        related_name="inmuebles_contratos",
    )
    rentas_contrato = models.ForeignKey(
        RentasContrato,
        db_column="id_rentas_contrato",
        on_delete=models.CASCADE,
        related_name="inmuebles_contratos",
    )
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "rentas_contrato__arrendador"
    objects = ScopedManager()

    class Meta:
        db_table = "rentas_inmuebles_contratos"

    def __str__(self):
        return self.id_rel_inmb_cont


class RentasContratoDoc(models.Model):
    STATUS_PENDIENTE = "PENDIENTE"
    STATUS_INCOMPLETO = "INCOMPLETO"
    STATUS_ENTREGADO = "ENTREGADO"
    STATUS_APROBADO = "APROBADO"
    STATUS_CHOICES = [
        (STATUS_PENDIENTE, "Pendiente"),
        (STATUS_INCOMPLETO, "Incompleto"),
        (STATUS_ENTREGADO, "Entregado"),
        (STATUS_APROBADO, "Aprobado"),
    ]

    id_rent_cont_doc = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    rentas_contrato = models.ForeignKey(
        RentasContrato, db_column="id_rentas_contrato", on_delete=models.CASCADE, related_name="documentos"
    )
    denominacion = models.CharField(max_length=250)
    detalles_adicionales = models.CharField(max_length=500, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDIENTE)
    link_documento = models.CharField(max_length=2083, blank=True, null=True)
    fecha_solicitud = models.DateField(blank=True, null=True)
    fecha_limite = models.DateField(blank=True, null=True)
    fecha_entrega = models.DateField(blank=True, null=True)
    fecha_cierre = models.DateField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "rentas_contrato__arrendador"
    objects = ScopedManager()

    class Meta:
        db_table = "rentas_contratos_docs"

    def __str__(self):
        return self.denominacion


class RentasReferenciaPago(models.Model):
    """Sin FK declarada en el ERD (fk_relationships.csv no lista relaciones
    para esta tabla) - se respeta tal cual, sin inventar una relacion que no
    esta en el esquema de origen."""

    id = models.AutoField(primary_key=True)
    referencia_pago = models.CharField(db_column="Referencia_Pago", max_length=50, blank=True, null=True)
    num_local = models.CharField(db_column="Num_Local", max_length=50, blank=True, null=True)
    nombre_comercial = models.CharField(db_column="Nombre_Comercial", max_length=100, blank=True, null=True)
    correo_enviado = models.CharField(db_column="Correo_Enviado", max_length=300, blank=True, null=True)
    estado_referencia = models.IntegerField(db_column="Estado_Referencia", blank=True, null=True)
    rfc_arrendatario = models.CharField(db_column="Rfc_Arrendatario", max_length=50, blank=True, null=True)
    razon_social_arrendatario = models.CharField(
        db_column="Razon_Social_Arrendatario", max_length=150, blank=True, null=True
    )

    class Meta:
        db_table = "rentas_referencias_pago"

    def __str__(self):
        return self.referencia_pago or str(self.id)
