import uuid

from cumbresbi_scope.managers import ScopedManager
from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


# Nota general: la vista/nomenclatura de este servicio reusa a proposito la
# del Excel legado "PORCENTAJE AVANCE_015631.xlsx" en vez de rediseñar la
# tabla desde cero - mismo criterio encabezado (OBRA/LUGAR/CIUDAD), misma
# jerarquia Etapa -> Concepto -> Lote, mismas columnas de captura (%,
# numero de estimacion, % acumulado).
#
# El "proyecto"/scope PROYECTO referencia general_proyectos (iam-service,
# fuera de este esquema) - CharField plano, no ForeignKey real, mismo
# criterio laxo que tesoreria_contratos.sociedad.


class ObraEtapa(models.Model):
    """Catalogo de etapas de construccion - una fila por hoja del Excel
    legado (1.0 Losa Cimentacion, 2.0 Muros y Cast PB, ... Extraordinarios).
    Catalogo fijo y compartido entre proyectos, sin ScopedManager (mismo
    criterio que TesoreriaBanco)."""

    id_etapa = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    numero = models.DecimalField(max_digits=4, decimal_places=1)
    nombre = models.CharField(max_length=100)
    orden = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    class Meta:
        db_table = "obra_etapas"
        ordering = ["orden", "numero"]

    def __str__(self):
        return f"{self.numero} {self.nombre}"


class ObraConcepto(models.Model):
    """Fila del Excel dentro de una etapa (ej. "1.1 Albañilerias: trazo y
    nivelacion..."). `maestro` es el contratista/oficio responsable, texto
    libre igual que en el Excel (columna MAESTRO) - no FK a un catalogo de
    colaboradores todavia (RRHH aun no construido, ver
    rrhh-registro-colaboradores-workspace-y-externos)."""

    id_concepto = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    etapa = models.ForeignKey(
        ObraEtapa, db_column="id_etapa", on_delete=models.PROTECT, related_name="conceptos"
    )
    numero = models.CharField(max_length=10)
    descripcion = models.TextField()
    maestro = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    class Meta:
        db_table = "obra_conceptos"
        ordering = ["etapa", "numero"]

    def __str__(self):
        return f"{self.numero} {self.descripcion[:40]}"


class ObraLote(models.Model):
    """Lote/casa dentro de un proyecto (columna "LOTE N" del Excel).
    Primer modelo con scope real - pertenece a un proyecto especifico
    (SCOPE_FIELD_PROYECTO), mismo criterio que TesoreriaContrato con
    SCOPE_FIELD_SOCIEDAD."""

    id_lote = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    proyecto = models.CharField(max_length=3)
    obra = models.CharField(max_length=100, blank=True, null=True)
    lugar = models.CharField(max_length=100, blank=True, null=True)
    ciudad = models.CharField(max_length=100, blank=True, null=True)
    manzana = models.CharField(max_length=20, blank=True, null=True)
    numero_lote = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "obra_lotes"
        ordering = ["proyecto", "manzana", "numero_lote"]

    def __str__(self):
        return f"{self.proyecto}-{self.numero_lote}"


class ObraEstimacion(models.Model):
    """Fila hija del Excel: un avance capturado un dia dado para un
    concepto+lote. Una fase dura 4 semanas (ver obra-fase-4-semanas-
    estimaciones) y un concepto puede cerrarse en 1 sola estimacion o
    repartirse hasta en 4 (una por semana) dentro de esa ventana -
    `numero_estimacion` es ese contador (1 a 4), no un folio fijo.

    La captura es diaria y en vivo (`fecha_captura`); el corte oficial de
    cada viernes es un snapshot aparte (ver ObraCorteSemanal) con
    validacion manual del Supervisor de Obra - esta tabla es el detalle
    "vivo" del que se arma ese snapshot."""

    id_estimacion = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    concepto = models.ForeignKey(
        ObraConcepto, db_column="id_concepto", on_delete=models.PROTECT, related_name="estimaciones"
    )
    lote = models.ForeignKey(
        ObraLote, db_column="id_lote", on_delete=models.PROTECT, related_name="estimaciones"
    )
    numero_estimacion = models.PositiveSmallIntegerField()
    porcentaje = models.DecimalField(max_digits=5, decimal_places=4)
    fecha_captura = models.DateField()
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    # 31/Ago/2026 (auditoria de scope): tenia el lote (que si tiene
    # proyecto) pero nunca heredaba el filtro - get_queryset() usaba
    # `.all()` sin RLS, mismo patron ya resuelto en TesoreriaFlujo via
    # "contrato__sociedad".
    SCOPE_FIELD_PROYECTO = "lote__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "obra_estimaciones"
        ordering = ["concepto", "lote", "numero_estimacion"]

    def __str__(self):
        return f"{self.concepto_id}-{self.lote_id}-est{self.numero_estimacion}"


class ObraCorteSemanal(models.Model):
    """Snapshot del corte de cada viernes (ver obra-vista-excel-y-envio-
    viernes) - la actualizacion diaria de ObraEstimacion es continua y
    automatica, pero el corte semanal que se envia NO se congela solo:
    requiere validacion manual del Supervisor de Obra (`aprobado_por`/
    `aprobado_en`), mismo patron de segregacion captura/aprobacion que
    PldContraparteKyc en pld-service.

    `semana_de_fase` es 1 a 4 (una fase = 4 semanas, ver obra-fase-4-
    semanas-estimaciones)."""

    ESTADO_BORRADOR = "BORRADOR"
    ESTADO_EN_REVISION = "EN_REVISION"
    ESTADO_APROBADO = "APROBADO"
    ESTADO_CHOICES = [
        (ESTADO_BORRADOR, "Borrador"),
        (ESTADO_EN_REVISION, "En revision"),
        (ESTADO_APROBADO, "Aprobado"),
    ]

    id_corte = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    proyecto = models.CharField(max_length=3)
    fecha_corte = models.DateField()
    semana_de_fase = models.PositiveSmallIntegerField()
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_BORRADOR)
    aprobado_por = models.CharField(max_length=8, blank=True, null=True)
    aprobado_en = models.DateTimeField(blank=True, null=True)
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "obra_cortes_semanales"
        ordering = ["-fecha_corte"]

    def __str__(self):
        return f"{self.proyecto} corte {self.fecha_corte}"


class ObraCorteSemanalDetalle(models.Model):
    """Snapshot REAL del % acumulado por concepto+lote al momento de
    aprobar un ObraCorteSemanal (21/Ago/2026, "el corte semanal no era un
    snapshot real, solo metadata"). Se congela una fila por cada
    concepto+lote del proyecto en `ObraCorteSemanalViewSet.aprobar()`
    (views.py) - despues de eso, si alguien sigue editando
    ObraEstimacion, este detalle NO cambia, es la foto de ese momento.

    Sin ScopedManager propio - siempre se consulta a traves de su corte
    (que si tiene scope PROYECTO), igual criterio que FacturaConcepto en
    tesoreria-service (tabla de detalle sin alcance independiente)."""

    id_detalle = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    corte = models.ForeignKey(
        ObraCorteSemanal, db_column="id_corte", on_delete=models.CASCADE, related_name="detalles"
    )
    concepto = models.ForeignKey(ObraConcepto, db_column="id_concepto", on_delete=models.PROTECT)
    lote = models.ForeignKey(ObraLote, db_column="id_lote", on_delete=models.PROTECT)
    porcentaje_acumulado = models.DecimalField(max_digits=6, decimal_places=4)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "obra_cortes_semanales_detalle"
        unique_together = [("corte", "concepto", "lote")]
        ordering = ["concepto", "lote"]

    def __str__(self):
        return f"{self.corte_id}-{self.concepto_id}-{self.lote_id}"


class ObraEvidencia(models.Model):
    """Foto obligatoria por etapa/concepto+lote (ver minuta_reunion-1.md
    sec. 1 y 2: "Toma de Evidencia" + validacion del Supervisor de Obra) -
    va a vivir en Google Drive (mismo patron que pld-service, ver
    docs/architecture, "archivo se archiva como evidencia"), pero
    TODAVIA NO EXISTE la Unidad compartida de Drive para Obra (21/Ago/2026,
    ver obra-evidencia-fotos-drive-pendiente en memoria del proyecto).

    Mientras no exista esa carpeta, `link_drive` se captura a mano (URL
    pegada desde el frontend) en vez de subir el archivo real - es
    deuda tecnica documentada, no un descuido: cuando exista la carpeta,
    conectar la subida real via drive-service en este mismo campo, sin
    cambiar el modelo."""

    id_evidencia = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    concepto = models.ForeignKey(
        ObraConcepto, db_column="id_concepto", on_delete=models.PROTECT, related_name="evidencias"
    )
    lote = models.ForeignKey(
        ObraLote, db_column="id_lote", on_delete=models.PROTECT, related_name="evidencias"
    )
    link_drive = models.CharField(max_length=2083, blank=True, null=True)
    fecha_captura = models.DateField()
    revisado = models.BooleanField(default=False)
    revisado_por = models.CharField(max_length=8, blank=True, null=True)
    revisado_en = models.DateTimeField(blank=True, null=True)
    comentarios = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8, blank=True, null=True)

    # 31/Ago/2026 (auditoria de scope), mismo criterio que ObraEstimacion
    # arriba - via lote__proyecto.
    SCOPE_FIELD_PROYECTO = "lote__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "obra_evidencias"
        ordering = ["-fecha_captura"]

    def __str__(self):
        return f"{self.concepto_id}-{self.lote_id}-{self.fecha_captura}"
