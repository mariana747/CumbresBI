import uuid

from cumbresbi_scope.managers import ScopedManager
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

    # 31/Ago/2026 (auditoria de scope): este servicio nunca declaro
    # ScopedManager pese a tener `proyecto` como columna propia desde el
    # inicio - lectura abierta real, mismo criterio ya resuelto en
    # ObraLote (obra-service).
    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

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

    # 31/Ago/2026, hereda el proyecto del presupuesto (mismo criterio que
    # TesoreriaFlujo.SCOPE_FIELD_SOCIEDAD = "contrato__sociedad").
    SCOPE_FIELD_PROYECTO = "presupuesto__proyecto"
    objects = ScopedManager()

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

    SCOPE_FIELD_PROYECTO = "presupuesto__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "materiales_presupuesto_firmas"

    def __str__(self):
        return f"{self.firmante} ({self.presupuesto_id})"


class SolicitudMaterial(models.Model):
    """Solicitud de material conta <-> almacen (Plan de Trabajo Fase 3
    Semana 13: "Registro de recepcion de material y proceso de solicitud
    de material; descuento automatico de material disponible contra lo
    presupuestado"). Es SOLO para pedir contra lo que ya hay en almacen,
    NO una requisicion de compra (decision de Mariana 21/Ago/2026) - por
    eso el serializer valida que cantidad_solicitada no exceda
    MaterialCatalogo.cantidad_disponible al crear, y
    SolicitudMaterialViewSet.entregar hace el descuento real (con
    select_for_update).

    Flujo de 3 estados (decision de Mariana 21/Ago/2026: "tendremos
    Entregado, Solicitado, Rechazado" - sin paso intermedio de Aprobado):
    SOLICITADO -> ENTREGADO o SOLICITADO -> RECHAZADO. `entregar` exige
    ademas al menos una EvidenciaRecepcion con foto (ver
    SolicitudMaterialViewSet.entregar)."""

    ESTADO_SOLICITADO = "SOLICITADO"
    ESTADO_ENTREGADO = "ENTREGADO"
    ESTADO_RECHAZADO = "RECHAZADO"
    ESTADO_CHOICES = [
        (ESTADO_SOLICITADO, "Solicitado"),
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

    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "materiales_solicitudes"

    def __str__(self):
        return f"{self.id_solicitud} ({self.estado})"


class EvidenciaRecepcion(models.Model):
    """Bitacora de recepcion de material contra una SolicitudMaterial: foto +
    fecha/hora de cuando llego el material (pedido de Mariana 21/Ago/2026,
    "falta evidencia de recepcion... debe poder mandar foto, anotar fecha,
    hora... es una bitacora" - puede haber varias entradas por solicitud,
    ej. entregas parciales).

    Mismo patron que ObraEvidencia en obra-service: `link_drive` se captura
    a mano (URL pegada desde el frontend) mientras no exista la Unidad
    compartida de Drive para esto - cuando exista, conectar la subida real
    via drive-service en este mismo campo, sin cambiar el modelo."""

    id_evidencia = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    solicitud = models.ForeignKey(
        SolicitudMaterial, db_column="id_solicitud", on_delete=models.PROTECT, related_name="evidencias"
    )
    link_drive = models.CharField(max_length=2083, blank=True, null=True)
    fecha = models.DateField()
    hora = models.TimeField()
    registrado_por = models.CharField(max_length=8)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "solicitud__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "materiales_evidencias_recepcion"
        ordering = ["-fecha", "-hora"]

    def __str__(self):
        return f"{self.solicitud_id}-{self.fecha}-{self.hora}"


class Requisicion(models.Model):
    """Requisicion de materiales: documento formal por proyecto+etapa que
    jala los ConceptoPresupuesto ya presupuestados y ES la que dispara la
    COMPRA - distinta de SolicitudMaterial ("Salida de almacen", esa es
    para pedir contra lo que YA hay en almacen, ver su docstring).
    Decision de Mariana 21/Ago/2026: "en requisicion es donde se va a
    pedir material". Diseno del documento (folio, presupuesto asignado,
    viviendas que comprende, etapa constructiva con sus conceptos,
    3 firmas) aprobado 17/Ago/2026 sobre el mockup original de Ruben.

    V1 (21/Ago/2026): las lineas (RequisicionLinea) son un SNAPSHOT tomado
    de ConceptoPresupuesto al crear la requisicion - `cantidad` de
    ConceptoPresupuesto se interpreta aqui como cantidad POR VIVIENDA,
    multiplicada por `num_viviendas` para la cantidad total. Pendiente:
    generar el archivo .xlsx real con el formato de Ruben (hoy solo se
    expone la data via API) y conectar `autorizo_compra_por`/`valido_por`
    a informacion real de quien firma (hoy son ids de usuario simples, sin
    firma electronica - mismo criterio que PresupuestoFirma)."""

    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_AUTORIZADA = "AUTORIZADA"
    ESTADO_RECHAZADA = "RECHAZADA"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente de autorización"),
        (ESTADO_AUTORIZADA, "Autorizada"),
        (ESTADO_RECHAZADA, "Rechazada"),
    ]

    id_requisicion = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    folio = models.CharField(max_length=40, unique=True, editable=False)
    proyecto = models.CharField(max_length=8)
    presupuesto = models.ForeignKey(
        Presupuesto, db_column="id_presupuesto", on_delete=models.PROTECT, related_name="requisiciones"
    )
    etapa_constructiva = models.CharField(max_length=150)
    empresa = models.CharField(max_length=200, blank=True, null=True)
    responsable = models.CharField(max_length=150, blank=True, null=True)
    num_viviendas = models.PositiveIntegerField(default=1)
    presupuesto_asignado = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    solicito_por = models.CharField(max_length=8, blank=True, null=True)
    valido_por = models.CharField(max_length=8, blank=True, null=True)
    autorizo_compra_por = models.CharField(max_length=8, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "materiales_requisiciones"
        ordering = ["-created_at"]

    def __str__(self):
        return self.folio


class RequisicionLinea(models.Model):
    """Una fila de la requisicion - snapshot de un ConceptoPresupuesto al
    momento de generar el documento (precio/cantidad pueden variar despues
    en el presupuesto sin afectar una requisicion ya generada)."""

    id_linea = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    requisicion = models.ForeignKey(
        Requisicion, db_column="id_requisicion", on_delete=models.CASCADE, related_name="lineas"
    )
    concepto = models.ForeignKey(
        ConceptoPresupuesto,
        db_column="id_concepto",
        on_delete=models.SET_NULL,
        related_name="lineas_requisicion",
        blank=True,
        null=True,
    )
    concepto_nombre = models.CharField(max_length=250)
    material = models.ForeignKey(
        MaterialCatalogo,
        db_column="id_material",
        on_delete=models.PROTECT,
        related_name="lineas_requisicion",
        blank=True,
        null=True,
    )
    cantidad_por_vivienda = models.DecimalField(max_digits=14, decimal_places=4)
    cantidad_total = models.DecimalField(max_digits=14, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=14, decimal_places=2)
    importe = models.DecimalField(max_digits=16, decimal_places=2)
    proveedor_cotizacion = models.CharField(max_length=200, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "materiales_requisicion_lineas"
        ordering = ["concepto_nombre"]

    def __str__(self):
        return f"{self.requisicion_id}-{self.concepto_nombre}"
