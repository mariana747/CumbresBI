import uuid

from cumbresbi_scope.managers import ScopedManager
from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


# Modulo Tickets (ver memoria tickets-modulo-jerarquia-sin-construir):
# jerarquia de 6 tablas del ERD (20260727_Cumbres_ERD.sql:805-914) -
# Centros -> Proyectos -> Participantes/Subproyectos -> Tickets -> Log/
# Dependencias. Fase 1 (22/Sep/2026): Centros/Proyectos/Participantes.
# Fase 2 (23/Sep/2026): Subproyectos. Fase 3 (24/Sep/2026): Tickets.
# Fase 4 (24/Sep/2026): Dependencias/Log - ultimo nivel de la jerarquia,
# cada una en su propio PR contra la rama integradora `tickets`.


class TicketsCentro(models.Model):
    """Catalogo raiz, sin FK hacia nada mas (nivel mas alto de la
    jerarquia)."""

    id_tickets_centro = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    denominacion = models.CharField(max_length=255)
    descripcion = models.CharField(max_length=500, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "tickets_centros"

    def __str__(self):
        return self.denominacion


class TicketsProyecto(models.Model):
    """`responsable` referencia laxa a iam_users.user_id (servicio
    distinto) - mismo criterio que `asignado_a`/`responsable` en el resto
    del proyecto (ej. materiales_solicitudes.solicitante), sin ForeignKey
    real cruzando servicios."""

    ESTADO_CHOICES = [
        ("PLANEADO", "Planeado"),
        ("EN CURSO", "En curso"),
        ("COMPLETADO", "Completado"),
        ("CANCELADO", "Cancelado"),
    ]

    id_proyecto = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    denominacion = models.CharField(max_length=255)
    descripcion = models.CharField(max_length=500, blank=True, null=True)
    centro = models.ForeignKey(TicketsCentro, on_delete=models.PROTECT, related_name="proyectos")
    carpeta = models.CharField(max_length=2083, blank=True, null=True)
    responsable = models.CharField(max_length=8)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default="PLANEADO")
    vencimiento = models.DateField(blank=True, null=True)
    fecha_inicio = models.DateField(blank=True, null=True)
    fecha_fin = models.DateField(blank=True, null=True)
    progreso = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "tickets_proyectos"

    def __str__(self):
        return self.denominacion


class TicketsProyectoParticipante(models.Model):
    """Tabla puente proyecto<->usuario (M2M). `id_participante` misma
    referencia laxa a iam_users.user_id que `responsable` arriba."""

    id_proyectos_part = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    id_proyecto = models.ForeignKey(TicketsProyecto, on_delete=models.CASCADE, related_name="participantes")
    id_participante = models.CharField(max_length=8)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    class Meta:
        db_table = "tickets_proyectos_participantes"
        constraints = [
            models.UniqueConstraint(
                fields=["id_proyecto", "id_participante"], name="unico_participante_por_proyecto"
            )
        ]

    def __str__(self):
        return f"{self.id_proyecto_id} - {self.id_participante}"


class TicketsSubproyecto(models.Model):
    """Fase 2 del modulo (ver memoria tickets-modulo-jerarquia-sin-construir):
    primer nivel de la jerarquia con columna `sociedad` propia, mismo
    criterio de referencia laxa a general_sociedades.rfc que
    TesoreriaContrato.sociedad."""

    ESTADO_CHOICES = TicketsProyecto.ESTADO_CHOICES

    id_subproyecto = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    denominacion = models.CharField(max_length=255)
    descripcion = models.CharField(max_length=500, blank=True, null=True)
    id_proyecto = models.ForeignKey(TicketsProyecto, on_delete=models.PROTECT, related_name="subproyectos")
    sociedad = models.CharField(max_length=13)
    responsable = models.CharField(max_length=8)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default="PLANEADO")
    vencimiento = models.DateField(blank=True, null=True)
    fecha_inicio = models.DateField(blank=True, null=True)
    fecha_fin = models.DateField(blank=True, null=True)
    progreso = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "sociedad"
    objects = ScopedManager()

    class Meta:
        db_table = "tickets_subproyectos"

    def __str__(self):
        return self.denominacion


class Ticket(models.Model):
    """Fase 3 (24/Sep/2026, ver memoria tickets-modulo-jerarquia-sin-construir):
    la tarea individual. Hereda el alcance por sociedad de su Subproyecto
    (SCOPE_FIELD_SOCIEDAD = "id_subproyecto__sociedad", mismo criterio que
    ConceptoPresupuesto.SCOPE_FIELD_PROYECTO en materiales-service) - Ticket
    no tiene columna `sociedad` propia."""

    PRIORIDAD_CHOICES = [
        ("BAJA", "Baja"),
        ("MEDIA", "Media"),
        ("ALTA", "Alta"),
        ("URGENTE", "Urgente"),
    ]
    ESTADO_CHOICES = [
        ("PENDIENTE", "Pendiente"),
        ("EN CURSO", "En curso"),
        ("EN REVISION", "En revisión"),
        ("COMPLETADO", "Completado"),
        ("CANCELADO", "Cancelado"),
    ]

    id_ticket = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    denominacion = models.CharField(max_length=255)
    descripcion = models.CharField(max_length=500, blank=True, null=True)
    id_subproyecto = models.ForeignKey(TicketsSubproyecto, on_delete=models.PROTECT, related_name="tickets")
    categoria = models.CharField(max_length=100, blank=True, null=True)
    prioridad = models.CharField(max_length=20, choices=PRIORIDAD_CHOICES, default="MEDIA")
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default="PENDIENTE")
    asignado_a = models.CharField(max_length=8, blank=True, null=True)
    fecha_inicio_prog = models.DateField(blank=True, null=True)
    fecha_fin_prog = models.DateField(blank=True, null=True)
    fecha_inicio_real = models.DateField(blank=True, null=True)
    fecha_fin_real = models.DateField(blank=True, null=True)
    estimacion_horas = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    carpeta = models.CharField(max_length=2083, blank=True, null=True)
    instrucciones_entrega = models.CharField(max_length=1000, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "id_subproyecto__sociedad"
    objects = ScopedManager()

    class Meta:
        db_table = "tickets"

    def __str__(self):
        return self.denominacion


class TicketsDependencia(models.Model):
    """Fase 4 (24/Sep/2026): precedencia tipo Gantt entre tickets del MISMO
    modulo - predecesora/sucesora son ambas FK a Ticket (auto-referencia via
    la propia tabla, ver memoria tickets-modulo-jerarquia-sin-construir).
    Hereda alcance via predecesora (mismo criterio que Ticket, ambos
    tickets de una dependencia real siempre caen en la misma sociedad)."""

    TIPO_CHOICES = [
        ("FIN_A_INICIO", "Fin a inicio"),
        ("INICIO_A_INICIO", "Inicio a inicio"),
        ("FIN_A_FIN", "Fin a fin"),
        ("INICIO_A_FIN", "Inicio a fin"),
    ]

    id_dependencia = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    predecesora = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="dependencias_como_predecesora")
    sucesora = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="dependencias_como_sucesora")
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default="FIN_A_INICIO")
    ventaja_desfase_dias = models.IntegerField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "predecesora__id_subproyecto__sociedad"
    objects = ScopedManager()

    class Meta:
        db_table = "tickets_dependencias"
        constraints = [
            models.UniqueConstraint(fields=["predecesora", "sucesora"], name="unica_dependencia_predecesora_sucesora"),
            models.CheckConstraint(
                check=~models.Q(predecesora=models.F("sucesora")), name="dependencia_no_autoreferencia"
            ),
        ]

    def __str__(self):
        return f"{self.predecesora_id} -> {self.sucesora_id}"


class TicketsLog(models.Model):
    """Fase 4 (24/Sep/2026): bitacora de cambios de un Ticket - accion,
    progreso, horas incurridas y evidencia adjunta (Drive), mismo criterio
    de `carpeta`/link suelto que el resto del modulo (sin FK real a
    Drive)."""

    id_log = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    id_ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="log")
    accion = models.CharField(max_length=255)
    progreso_nuevo = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    horas_incurridas = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    evidencia = models.CharField(max_length=2083, blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)

    SCOPE_FIELD_SOCIEDAD = "id_ticket__id_subproyecto__sociedad"
    objects = ScopedManager()

    class Meta:
        db_table = "tickets_log"

    def __str__(self):
        return f"{self.id_ticket_id} - {self.accion}"
