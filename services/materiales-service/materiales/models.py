import uuid

from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


# Esqueleto de modelos (19/Ago/2026) - servicio nuevo, planeado en
# docs/architecture/README.md sec. 1.1.2 como "materiales-service (futuro)":
# catalogo de materiales + motor de presupuesto/conceptos automatizado,
# construido de forma AUTONOMA dentro de Fase 3 (Ventas/Vivienda) y
# extendido/reconciliado despues por Compras (Fase 4) - mismo principio de
# "autonomia de modulos con dependencias diferidas" que ya se aplico a
# Contrapartes (PLD/Ventas/Tesoreria).
#
# Fuente de los campos: docs/CumbresBI_V2_Plan_de_Trabajo_y_Cronograma.md,
# Fase 3 Semana 13, y docs/architecture/README.md sec. 3 (tabla de
# refactorizacion, fila "Conceptos y Firmas (nueva)"). Solo modelos +
# migraciones en este primer corte - sin serializers/views/tests todavia
# (mismo orden que se siguio en tesoreria-service: modelos heredados
# primero, CRUD despues).
#
# Ninguna FK cruza a otro servicio (vivienda-service, tesoreria-service) -
# se usan CharField planos de referencia laxa, mismo criterio que
# tesoreria_contratos.sociedad o vivienda_ventas_expedientes.id_contrato.


class MaterialCatalogo(models.Model):
    """Campos base segun el documento de Ruben (Plan de Trabajo, Fase 3
    Semana 13): material, unidad de medida, cantidad disponible, precio
    unitario, proveedor, cotizacion/fecha de vigencia. `proveedor`
    referencia laxa a tesoreria_contrapartes.id_contraparte (servicio
    distinto, mismo criterio que vivienda_rel_expediente_clientes.id_contraparte)."""

    id_material = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    material = models.CharField(max_length=200)
    unidad_medida = models.CharField(max_length=20)
    cantidad_disponible = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    precio_unitario = models.DecimalField(max_digits=14, decimal_places=2)
    proveedor = models.CharField(max_length=8, blank=True, null=True)
    cotizacion_fecha_vigencia = models.DateField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "materiales_catalogo"

    def __str__(self):
        return self.material


class ManoObraCatalogo(models.Model):
    """Catalogo de mano de obra vinculado a etapas de construccion (ej.
    "muro de planta baja", Plan de Trabajo Fase 3 Semana 13)."""

    id_mano_obra = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    etapa_constructiva = models.CharField(max_length=150)
    descripcion = models.CharField(max_length=250)
    costo_unitario = models.DecimalField(max_digits=14, decimal_places=2)
    unidad_medida = models.CharField(max_length=20)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "materiales_mano_obra_catalogo"

    def __str__(self):
        return f"{self.etapa_constructiva} - {self.descripcion}"


class Presupuesto(models.Model):
    """Cabecera del presupuesto de un proyecto (agrupa los conceptos de
    abajo). Entidad INFERIDA - no viene nombrada asi en ninguna fuente
    (README.md sec. 3 solo documenta conceptos_presupuesto y
    presupuesto_firmas sueltas); se agrega como cabecera minima porque
    presupuesto_firmas requiere "una referencia al presupuesto" y sin
    cabecera no hay a que apuntar. Revisar con el documento de Ruben si el
    negocio ya tiene un concepto equivalente antes de construir la capa de
    negocio encima. `proyecto` referencia laxa a
    vivienda_proyectos.id_proyecto (servicio distinto en el ERD logico,
    mismo servicio fisico solo por coincidencia de fase - materiales-service
    es un servicio propio, ver README.md sec. 1.1.2)."""

    ESTADO_BORRADOR = "BORRADOR"
    ESTADO_EN_REVISION = "EN_REVISION"
    ESTADO_APROBADO = "APROBADO"
    ESTADO_CHOICES = [
        (ESTADO_BORRADOR, "Borrador"),
        (ESTADO_EN_REVISION, "En revision"),
        (ESTADO_APROBADO, "Aprobado"),
    ]

    id_presupuesto = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    proyecto = models.CharField(max_length=8)
    denominacion = models.CharField(max_length=250, blank=True, null=True)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_BORRADOR)
    monto_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "materiales_presupuestos"

    def __str__(self):
        return self.denominacion or self.id_presupuesto


class ConceptoPresupuesto(models.Model):
    """etapa constructiva -> concepto, con FK a Material para el precio
    unitario (README.md sec. 3: "Tabla conceptos_presupuesto generada por
    el motor etapa constructiva -> concepto, con FK a materiales para el
    precio unitario"). El "motor" que genera estas filas automaticamente a
    partir de la etapa constructiva no esta construido todavia - este
    modelo es solo donde quedaria el resultado."""

    id_concepto = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    presupuesto = models.ForeignKey(
        Presupuesto, db_column="id_presupuesto", on_delete=models.CASCADE, related_name="conceptos"
    )
    etapa_constructiva = models.CharField(max_length=150)
    concepto = models.CharField(max_length=250)
    material = models.ForeignKey(
        MaterialCatalogo,
        db_column="id_material",
        on_delete=models.PROTECT,
        related_name="conceptos_presupuesto",
        blank=True,
        null=True,
    )
    mano_obra = models.ForeignKey(
        ManoObraCatalogo,
        db_column="id_mano_obra",
        on_delete=models.PROTECT,
        related_name="conceptos_presupuesto",
        blank=True,
        null=True,
    )
    cantidad = models.DecimalField(max_digits=14, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=14, decimal_places=2)
    importe = models.DecimalField(max_digits=16, decimal_places=2)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "materiales_conceptos_presupuesto"

    def __str__(self):
        return self.concepto


class PresupuestoFirma(models.Model):
    """firmante, cargo, fecha, referencia al presupuesto (README.md sec.
    3). Pendiente definir si se integra a Firmenti/DocuSeal o se queda como
    registro interno simple (mismo README, misma nota sin resolver) - por
    ahora, registro interno simple, sin firma electronica real."""

    id_firma = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    presupuesto = models.ForeignKey(
        Presupuesto, db_column="id_presupuesto", on_delete=models.CASCADE, related_name="firmas"
    )
    firmante = models.CharField(max_length=100)
    cargo = models.CharField(max_length=100, blank=True, null=True)
    fecha = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "materiales_presupuesto_firmas"

    def __str__(self):
        return f"{self.firmante} ({self.presupuesto_id})"


class SolicitudMaterial(models.Model):
    """Solicitud de material conta <-> almacen (Plan de Trabajo Fase 3
    Semana 13: "Registro de recepcion de material y proceso de solicitud
    de material; descuento automatico de material disponible contra lo
    presupuestado"). Esqueleto: el descuento automatico contra
    MaterialCatalogo.cantidad_disponible al aprobar/entregar es logica de
    negocio pendiente (senal o vista dedicada), NO implementada en este
    primer corte - este modelo solo registra la solicitud."""

    ESTADO_SOLICITADO = "SOLICITADO"
    ESTADO_APROBADO = "APROBADO"
    ESTADO_ENTREGADO = "ENTREGADO"
    ESTADO_RECHAZADO = "RECHAZADO"
    ESTADO_CHOICES = [
        (ESTADO_SOLICITADO, "Solicitado"),
        (ESTADO_APROBADO, "Aprobado"),
        (ESTADO_ENTREGADO, "Entregado"),
        (ESTADO_RECHAZADO, "Rechazado"),
    ]

    id_solicitud = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    proyecto = models.CharField(max_length=8)
    material = models.ForeignKey(
        MaterialCatalogo, db_column="id_material", on_delete=models.PROTECT, related_name="solicitudes"
    )
    cantidad_solicitada = models.DecimalField(max_digits=14, decimal_places=2)
    solicitado_por = models.CharField(max_length=8)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_SOLICITADO)
    fecha_solicitud = models.DateField(auto_now_add=True)
    fecha_entrega = models.DateField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "materiales_solicitudes"

    def __str__(self):
        return self.id_solicitud
