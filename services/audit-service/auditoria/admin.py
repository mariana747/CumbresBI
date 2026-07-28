from django.contrib import admin

from .models import BitacoraAuditoria


@admin.register(BitacoraAuditoria)
class BitacoraAuditoriaAdmin(admin.ModelAdmin):
    # La bitacora es append-only: el admin nunca debe ofrecer editar ni borrar,
    # aunque el usuario sea superuser (los triggers BEFORE UPDATE/DELETE la
    # bloquearian a nivel de BD, pero no debe llegarse siquiera a intentarlo).
    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
