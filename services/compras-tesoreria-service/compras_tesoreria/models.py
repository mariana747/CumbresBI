import uuid

from cumbresbi_scope.managers import ScopedManager
from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


# Fase 4B - Compras (02/Sep/2026, primer corte real de modelos - antes solo
# el esqueleto de Fase 0, sin tablas propias). Fuente: docs/architecture/
# README.md sec. 3 fila "Compras (nueva)" y docs/CumbresBI_V2_Plan_de_
# Trabajo_y_Cronograma.md Fase 4 Sem 17: "Modelos de Compras: proveedores,
# solicitudes de compra, ordenes de compra, recepcion de materiales" +
# "reutilizacion del Motor Documental para Compras: cotizaciones de
# proveedor, facturas" (los prompts "compras.cotizacion"/
# "compras.factura_proveedor" ya existian en document-intelligence-service/
# docint/prompts.py desde antes, sin consumidor real todavia).
#
# Decision de diseno: NO hay tabla de "proveedores" propia aqui - se
# reutiliza tesoreria_contrapartes (TesoreriaContraparte.proveedor=True)
# como catalogo maestro unico, mismo criterio ya aplicado en
# MaterialCatalogo.proveedor (materiales-service): un CharField(8) laxo al
# id_contraparte, resuelto en el frontend con el ContraparteSelector
# compartido (mismo componente que usan PLD/Ventas/Tesoreria), sin llamada
# servicio-a-servicio desde el backend. Evita inventar un segundo catalogo
# de proveedores que competiria con la contraparte maestra ya cerrada (ver
# memoria "tesoreria-fase4-adelanto-y-pendientes").
#
# Ninguna FK cruza a otro servicio - CharField planos de referencia laxa
# (proyecto, requisicion, proveedor), mismo criterio que el resto del
# proyecto (ej. TesoreriaContrato.sociedad, MaterialCatalogo.proveedor).


class SolicitudCompra(models.Model):
    """Cabecera del proceso de compra. Puede nacer de una Requisicion ya
    autorizada en materiales-service (`requisicion`, referencia laxa a
    materiales_requisiciones.id_requisicion - "es la que dispara la
    compra", ver Requisicion.__doc__ en ese servicio) o levantarse suelta
    (compras que no vienen de una requisicion de obra, ej. insumos de
    oficina) - por eso `requisicion` es opcional."""

    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_EN_COTIZACION = "EN_COTIZACION"
    ESTADO_ORDEN_GENERADA = "ORDEN_GENERADA"
    ESTADO_CERRADA = "CERRADA"
    ESTADO_CANCELADA = "CANCELADA"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_EN_COTIZACION, "En cotización"),
        (ESTADO_ORDEN_GENERADA, "Orden generada"),
        (ESTADO_CERRADA, "Cerrada"),
        (ESTADO_CANCELADA, "Cancelada"),
    ]

    id_solicitud = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    proyecto = models.CharField(max_length=8)
    requisicion = models.CharField(max_length=8, blank=True, null=True)
    descripcion = models.CharField(max_length=250)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    solicitado_por = models.CharField(max_length=8, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "compras_solicitudes"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.id_solicitud} ({self.descripcion})"


class Cotizacion(models.Model):
    """Cotizacion de un proveedor contra una SolicitudCompra - una
    solicitud puede tener varias (se comparan, una se marca GANADORA al
    generar la orden). `proveedor` es CharField laxo a
    tesoreria_contrapartes.id_contraparte (ver nota del modulo); mientras
    el analista no lo asigna via ContraparteSelector, `proveedor_nombre`
    guarda el texto tal como lo extrajo la IA del documento (mismo patron
    que TesoreriaFlujo.confirmar_conciliacion/contraparte_nombre).

    Campos alineados al prompt "compras.cotizacion" de docint/prompts.py
    (ya existia, sin consumidor real hasta este corte) para que
    confirmar_extraccion pueda volcar el resultado casi sin traduccion."""

    ESTADO_PENDIENTE_REVISION = "PENDIENTE_REVISION"
    ESTADO_CONFIRMADA = "CONFIRMADA"
    ESTADO_GANADORA = "GANADORA"
    ESTADO_DESCARTADA = "DESCARTADA"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE_REVISION, "Pendiente de revisión"),
        (ESTADO_CONFIRMADA, "Confirmada"),
        (ESTADO_GANADORA, "Ganadora"),
        (ESTADO_DESCARTADA, "Descartada"),
    ]

    id_cotizacion = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    solicitud = models.ForeignKey(
        SolicitudCompra, db_column="id_solicitud", on_delete=models.CASCADE, related_name="cotizaciones"
    )
    proveedor = models.CharField(max_length=8, blank=True, null=True)
    proveedor_nombre = models.CharField(max_length=200, blank=True, null=True)
    fecha_cotizacion = models.DateField(blank=True, null=True)
    vigencia_dias = models.PositiveIntegerField(blank=True, null=True)
    moneda = models.CharField(max_length=10, blank=True, null=True)
    subtotal = models.DecimalField(max_digits=16, decimal_places=2, blank=True, null=True)
    iva = models.DecimalField(max_digits=16, decimal_places=2, blank=True, null=True)
    total = models.DecimalField(max_digits=16, decimal_places=2, blank=True, null=True)
    # Evidencia del documento origen en Drive - mismo criterio "se captura a
    # mano hasta que exista la Unidad compartida" que ObraEvidencia/
    # EvidenciaRecepcion (ver camara-y-drive-pendiente-varios-modulos).
    link_drive = models.CharField(max_length=2083, blank=True, null=True)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE_REVISION)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "solicitud__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "compras_cotizaciones"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.id_cotizacion} ({self.proveedor_nombre or self.proveedor})"


class CotizacionLinea(models.Model):
    """Una fila de la cotizacion - snapshot de lo que el proveedor cotizo
    (descripcion/cantidad/precio_unitario/importe, mismos nombres que el
    campo "conceptos" del prompt compras.cotizacion)."""

    id_linea = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    cotizacion = models.ForeignKey(
        Cotizacion, db_column="id_cotizacion", on_delete=models.CASCADE, related_name="lineas"
    )
    descripcion = models.CharField(max_length=250)
    cantidad = models.DecimalField(max_digits=14, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=14, decimal_places=2)
    importe = models.DecimalField(max_digits=16, decimal_places=2)

    class Meta:
        db_table = "compras_cotizacion_lineas"

    def __str__(self):
        return f"{self.cotizacion_id}-{self.descripcion}"


class OrdenCompra(models.Model):
    """Orden de compra generada a partir de la cotizacion ganadora
    (`OrdenCompraViewSet.generar_desde_cotizacion`, PROTECT: no se puede
    borrar una cotizacion que ya genero una orden). `proveedor`/
    `proveedor_nombre` son snapshot de la cotizacion al momento de generar
    la orden (mismo criterio que RequisicionLinea.proveedor_cotizacion) -
    si despues cambia el proveedor de la cotizacion, la orden ya emitida no
    se ve afectada."""

    ESTADO_BORRADOR = "BORRADOR"
    ESTADO_ENVIADA = "ENVIADA"
    ESTADO_RECIBIDA_PARCIAL = "RECIBIDA_PARCIAL"
    ESTADO_RECIBIDA_TOTAL = "RECIBIDA_TOTAL"
    ESTADO_CANCELADA = "CANCELADA"
    ESTADO_CHOICES = [
        (ESTADO_BORRADOR, "Borrador"),
        (ESTADO_ENVIADA, "Enviada al proveedor"),
        (ESTADO_RECIBIDA_PARCIAL, "Recibida parcial"),
        (ESTADO_RECIBIDA_TOTAL, "Recibida total"),
        (ESTADO_CANCELADA, "Cancelada"),
    ]

    id_orden = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    folio = models.CharField(max_length=40, unique=True, editable=False)
    proyecto = models.CharField(max_length=8)
    solicitud = models.ForeignKey(
        SolicitudCompra, db_column="id_solicitud", on_delete=models.PROTECT, related_name="ordenes"
    )
    cotizacion = models.ForeignKey(
        Cotizacion, db_column="id_cotizacion", on_delete=models.PROTECT, related_name="ordenes"
    )
    proveedor = models.CharField(max_length=8, blank=True, null=True)
    proveedor_nombre = models.CharField(max_length=200, blank=True, null=True)
    fecha_orden = models.DateField(auto_now_add=True)
    monto_total = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_BORRADOR)
    autorizado_por = models.CharField(max_length=8, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "compras_ordenes"
        ordering = ["-created_at"]

    def __str__(self):
        return self.folio


class OrdenCompraLinea(models.Model):
    """Una fila de la orden - snapshot de CotizacionLinea al generar la
    orden. `cantidad_recibida` se acumula desde RecepcionLinea (nunca se
    edita a mano) para saber si la orden ya se recibio completa."""

    id_linea = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    orden = models.ForeignKey(
        OrdenCompra, db_column="id_orden", on_delete=models.CASCADE, related_name="lineas"
    )
    descripcion = models.CharField(max_length=250)
    cantidad = models.DecimalField(max_digits=14, decimal_places=2)
    cantidad_recibida = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    precio_unitario = models.DecimalField(max_digits=14, decimal_places=2)
    importe = models.DecimalField(max_digits=16, decimal_places=2)

    class Meta:
        db_table = "compras_orden_lineas"

    def __str__(self):
        return f"{self.orden_id}-{self.descripcion}"


class Recepcion(models.Model):
    """Bitacora de recepcion de mercancia contra una OrdenCompra - puede
    haber varias entradas por orden (entregas parciales), mismo patron que
    EvidenciaRecepcion en materiales-service."""

    id_recepcion = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    orden = models.ForeignKey(
        OrdenCompra, db_column="id_orden", on_delete=models.PROTECT, related_name="recepciones"
    )
    fecha = models.DateField()
    hora = models.TimeField()
    recibido_por = models.CharField(max_length=8, blank=True, null=True)
    link_drive = models.CharField(max_length=2083, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_PROYECTO = "orden__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "compras_recepciones"
        ordering = ["-fecha", "-hora"]

    def __str__(self):
        return f"{self.id_recepcion} ({self.orden_id})"


class RecepcionLinea(models.Model):
    """Cuanto se recibio de cada linea de la orden en esta recepcion
    especifica - `RecepcionViewSet.perform_create` es quien acumula esto
    en OrdenCompraLinea.cantidad_recibida y decide si la orden pasa a
    RECIBIDA_PARCIAL o RECIBIDA_TOTAL."""

    id_linea = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    recepcion = models.ForeignKey(
        Recepcion, db_column="id_recepcion", on_delete=models.CASCADE, related_name="lineas"
    )
    orden_linea = models.ForeignKey(
        OrdenCompraLinea, db_column="id_orden_linea", on_delete=models.PROTECT, related_name="recepciones"
    )
    cantidad_recibida = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        db_table = "compras_recepcion_lineas"

    def __str__(self):
        return f"{self.recepcion_id}-{self.orden_linea_id}"
