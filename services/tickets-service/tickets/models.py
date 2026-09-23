import uuid

from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


# Fase 1 del modulo Tickets (22/Sep/2026, ver memoria
# tickets-modulo-jerarquia-sin-construir): solo los primeros 3 niveles de
# la jerarquia de 6 tablas del ERD (20260727_Cumbres_ERD.sql:805-914) -
# Centros -> Proyectos -> Participantes. Subproyectos (primer nivel con
# columna `sociedad`, candidato real a ScopedManager) y Tickets/Log/
# Dependencias quedan para las siguientes fases, cada una en su propio PR
# contra la rama integradora `tickets`.


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
