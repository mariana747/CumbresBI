from django.contrib import admin

from . import models


class TicketsProyectoInline(admin.TabularInline):
    model = models.TicketsProyecto
    extra = 0
    fields = ("denominacion", "responsable", "estado", "vencimiento")


class TicketsProyectoParticipanteInline(admin.TabularInline):
    model = models.TicketsProyectoParticipante
    extra = 0
    fields = ("id_participante", "comentarios")


class TicketsSubproyectoInline(admin.TabularInline):
    model = models.TicketsSubproyecto
    extra = 0
    fields = ("denominacion", "sociedad", "responsable", "estado")


class TicketInline(admin.TabularInline):
    model = models.Ticket
    extra = 0
    fields = ("denominacion", "categoria", "prioridad", "estado", "asignado_a")


class TicketsLogInline(admin.TabularInline):
    model = models.TicketsLog
    extra = 0
    fields = ("accion", "progreso_nuevo", "horas_incurridas", "created_at")
    readonly_fields = ("created_at",)


@admin.register(models.TicketsCentro)
class TicketsCentroAdmin(admin.ModelAdmin):
    list_display = ("denominacion", "id_tickets_centro")
    search_fields = ("denominacion",)
    inlines = [TicketsProyectoInline]


@admin.register(models.TicketsProyecto)
class TicketsProyectoAdmin(admin.ModelAdmin):
    list_display = ("denominacion", "centro", "responsable", "estado", "vencimiento")
    list_filter = ("estado", "centro")
    search_fields = ("denominacion", "responsable")
    inlines = [TicketsProyectoParticipanteInline, TicketsSubproyectoInline]


@admin.register(models.TicketsSubproyecto)
class TicketsSubproyectoAdmin(admin.ModelAdmin):
    list_display = ("denominacion", "id_proyecto", "sociedad", "responsable", "estado")
    list_filter = ("estado", "sociedad")
    search_fields = ("denominacion", "responsable", "sociedad")
    inlines = [TicketInline]


@admin.register(models.Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ("denominacion", "id_subproyecto", "categoria", "prioridad", "estado", "asignado_a")
    list_filter = ("estado", "prioridad")
    search_fields = ("denominacion", "categoria", "asignado_a")
    inlines = [TicketsLogInline]


admin.site.register(models.TicketsProyectoParticipante)
admin.site.register(models.TicketsDependencia)
admin.site.register(models.TicketsLog)
