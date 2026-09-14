import uuid

from cumbresbi_scope.managers import ScopedManager
from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


class ViviendaProyecto(models.Model):
    """propietario referencia general_sociedades.rfc (iam-service, fuera de
    este esquema) - CharField plano, no ForeignKey real (docs/architecture/
    README.md sec. 11.2 #1). created_by/updated_by referencian iam_users
    igual criterio.
    """

    id_proyecto = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    alias_proyecto = models.CharField(max_length=5, blank=True, null=True)
    denominacion = models.CharField(max_length=250, blank=True, null=True)
    propietario = models.CharField(max_length=13, blank=True, null=True)
    dom_calle = models.CharField(max_length=150)
    dom_numero_ext = models.CharField(max_length=50)
    dom_numero_int = models.CharField(max_length=50)
    dom_colonia = models.CharField(max_length=100)
    dom_municipio_alcaldia = models.CharField(max_length=255)
    dom_estado = models.CharField(max_length=255)
    dom_cp = models.CharField(max_length=10)
    dom_pais = models.CharField(max_length=100)
    link_carpeta = models.CharField(max_length=2083, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    # 31/Ago/2026 (auditoria de scope): este servicio nunca declaro
    # ScopedManager pese a que roles-y-permisos.md sec. 4 lo cita como
    # ejemplo explicito de alcance PROYECTO ("WHERE proyecto IN (...) via
    # join a vivienda_proyectos"). id_proyecto es autoreferencia (mismo
    # criterio que TesoreriaContrato.SCOPE_FIELD_CONTRATO = "id_contrato").
    SCOPE_FIELD_PROYECTO = "id_proyecto"
    SCOPE_FIELD_SOCIEDAD = "propietario"
    objects = ScopedManager()

    class Meta:
        db_table = "vivienda_proyectos"

    def __str__(self):
        return self.denominacion or self.id_proyecto


class ViviendaListado(models.Model):
    id_vivienda = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    proyecto = models.ForeignKey(
        ViviendaProyecto, db_column="id_proyecto", on_delete=models.CASCADE, related_name="viviendas"
    )
    num_oficial = models.CharField(max_length=25, blank=True, null=True)
    etapa = models.CharField(max_length=25, blank=True, null=True)
    balcones_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    bodega_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    habitaciones = models.IntegerField(blank=True, null=True)
    cajones_est = models.DecimalField(max_digits=14, decimal_places=0, blank=True, null=True)
    calle = models.TextField(blank=True, null=True)
    cuv = models.CharField(max_length=255, blank=True, null=True)
    denominacion = models.CharField(max_length=255, blank=True, null=True)
    disponible = models.BooleanField(blank=True, null=True)
    fachada = models.CharField(max_length=255, blank=True, null=True)
    fondo_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    frente_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    lote = models.CharField(max_length=255, blank=True, null=True)
    modelo = models.CharField(max_length=255, blank=True, null=True)
    muestra = models.BooleanField(blank=True, null=True)
    mz = models.CharField(max_length=255, blank=True, null=True)
    patio_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    piso = models.CharField(max_length=255, blank=True, null=True)
    precio_lista = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    sup_const_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    sup_terreno_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    terraza_m2 = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    tipo = models.CharField(max_length=255, blank=True, null=True)
    torre = models.CharField(max_length=255, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "proyecto_id"
    SCOPE_FIELD_SOCIEDAD = "proyecto__propietario"
    objects = ScopedManager()

    class Meta:
        db_table = "vivienda_listado"

    def __str__(self):
        return self.denominacion or self.id_vivienda


class ViviendaVentasAsesor(models.Model):
    id_asesor = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    nombre = models.CharField(max_length=100)
    telefono_sms = models.CharField(max_length=10, blank=True, null=True)
    email = models.CharField(max_length=100)
    contacto = models.CharField(max_length=100, blank=True, null=True)
    persona_moral = models.BooleanField()
    razon_social = models.CharField(max_length=100, blank=True, null=True)
    porc_comision = models.DecimalField(max_digits=2, decimal_places=2)
    rfc_afiliacion = models.CharField(max_length=13, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "vivienda_ventas_asesores"

    def __str__(self):
        return self.nombre


class ViviendaVentasExpediente(models.Model):
    """id_contrato referencia tesoreria_contratos.id_contrato (tesoreria-
    service, fuera de este esquema) - CharField plano, no ForeignKey real."""

    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_EN_PROCESO = "EN PROCESO"
    ESTADO_CONCLUIDO = "CONCLUIDO"
    ESTADO_CANCELADO = "CANCELADO"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_EN_PROCESO, "En proceso"),
        (ESTADO_CONCLUIDO, "Concluido"),
        (ESTADO_CANCELADO, "Cancelado"),
    ]

    id_expediente = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    vivienda = models.ForeignKey(
        ViviendaListado, db_column="id_vivienda", on_delete=models.CASCADE, related_name="expedientes"
    )
    asesor = models.ForeignKey(
        ViviendaVentasAsesor,
        db_column="id_asesor",
        on_delete=models.CASCADE,
        related_name="expedientes",
    )
    id_contrato = models.CharField(max_length=255)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    fecha_cierre = models.DateField(blank=True, null=True)
    link_expediente = models.CharField(max_length=2083, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "vivienda__proyecto_id"
    SCOPE_FIELD_SOCIEDAD = "vivienda__proyecto__propietario"
    objects = ScopedManager()

    class Meta:
        db_table = "vivienda_ventas_expedientes"

    def __str__(self):
        return self.id_expediente


class ViviendaRelExpedienteCliente(models.Model):
    """id_contraparte referencia tesoreria_contrapartes.id_contraparte
    (contrapartes-service, fuera de este esquema) - CharField plano."""

    TIPO_ACREDITADO = "ACREDITADO"
    TIPO_COACREDITADO = "COACREDITADO"
    TIPO_CHOICES = [
        (TIPO_ACREDITADO, "Acreditado"),
        (TIPO_COACREDITADO, "Coacreditado"),
    ]

    id_rel_viv_exp_cliente = models.CharField(
        max_length=8, primary_key=True, default=_short_id, editable=False
    )
    expediente = models.ForeignKey(
        ViviendaVentasExpediente,
        db_column="id_expediente",
        on_delete=models.CASCADE,
        related_name="clientes",
    )
    id_contraparte = models.CharField(max_length=8)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default=TIPO_ACREDITADO)
    emp_razon_social = models.CharField(max_length=100, blank=True, null=True)
    emp_contacto_empleador = models.CharField(max_length=100, blank=True, null=True)
    emp_telefono_empleador = models.CharField(max_length=10, blank=True, null=True)
    emp_email_empleador = models.CharField(max_length=100, blank=True, null=True)
    emp_antiguedad_anos = models.DecimalField(max_digits=2, decimal_places=0, blank=True, null=True)
    emp_antiguedad_meses = models.DecimalField(max_digits=2, decimal_places=0, blank=True, null=True)
    emp_dom_calle = models.CharField(max_length=150, blank=True, null=True)
    emp_dom_colonia = models.CharField(max_length=100, blank=True, null=True)
    emp_dom_cp = models.CharField(max_length=10, blank=True, null=True)
    emp_dom_estado = models.CharField(max_length=255, blank=True, null=True)
    emp_dom_municipio_alcaldia = models.CharField(max_length=255, blank=True, null=True)
    emp_dom_numero_ext = models.CharField(max_length=50, blank=True, null=True)
    emp_dom_numero_int = models.CharField(max_length=50, blank=True, null=True)
    emp_puesto = models.CharField(max_length=100, blank=True, null=True)
    nss = models.CharField(max_length=11, blank=True, null=True)
    dependientes_econ = models.IntegerField(blank=True, null=True)
    ingreso_men_honorarios = models.DecimalField(
        max_digits=14, decimal_places=2, blank=True, null=True
    )
    ingreso_men_nomina = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    ingreso_men_otros = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    nombre_referencia = models.CharField(max_length=100, blank=True, null=True)
    email_referencia = models.CharField(max_length=100, blank=True, null=True)
    telefono_referencia = models.CharField(max_length=10, blank=True, null=True)
    tipo_credito_prin = models.CharField(max_length=255, blank=True, null=True)
    tipo_credito_sec = models.CharField(max_length=255, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "expediente__vivienda__proyecto_id"
    objects = ScopedManager()

    class Meta:
        db_table = "vivienda_rel_expediente_clientes"

    def __str__(self):
        return self.id_rel_viv_exp_cliente


class ViviendaVentasExpedienteItem(models.Model):
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

    id_item = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    expediente = models.ForeignKey(
        ViviendaVentasExpediente, db_column="id_expediente", on_delete=models.CASCADE, related_name="items"
    )
    denominacion = models.CharField(max_length=250, blank=True, null=True)
    detalles_adicionales = models.CharField(max_length=500, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDIENTE)
    link_documento = models.CharField(max_length=2083, blank=True, null=True)
    fecha_solicitud = models.DateField(blank=True, null=True)
    fecha_limite = models.DateField()
    fecha_entrega = models.DateField(blank=True, null=True)
    fecha_cierre = models.DateField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "expediente__vivienda__proyecto_id"
    objects = ScopedManager()

    class Meta:
        db_table = "vivienda_ventas_expedientes_items"

    def __str__(self):
        return self.id_item
