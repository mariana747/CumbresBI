from django.contrib import admin

from . import models


class IamUserGroupInline(admin.TabularInline):
    model = models.IamUserGroup
    fk_name = "user"
    extra = 0
    fields = ("group", "removed_at", "created_at")
    readonly_fields = ("created_at",)


class IamUserRoleInline(admin.TabularInline):
    model = models.IamUserRole
    fk_name = "user"
    extra = 0
    fields = ("role", "scope_type", "scope_id", "granted_at", "revoked_at")


class IamIdentityInline(admin.TabularInline):
    model = models.IamIdentity
    extra = 0
    fields = ("provider", "email", "email_verified", "last_login_at")


@admin.register(models.IamUser)
class IamUserAdmin(admin.ModelAdmin):
    list_display = (
        "display_name",
        "primary_email",
        "roles_display",
        "grupo_empresa_display",
        "status",
    )
    search_fields = ("primary_email", "display_name", "user_id")
    inlines = [IamIdentityInline, IamUserRoleInline, IamUserGroupInline]

    @admin.display(description="Rol(es)")
    def roles_display(self, obj):
        vigentes = obj.user_roles.filter(revoked_at__isnull=True).select_related("role")
        return ", ".join(ur.role.role_name for ur in vigentes) or "—"

    @admin.display(description="Grupo/Empresa")
    def grupo_empresa_display(self, obj):
        # Una sola columna: para este cliente el holding (iam_groups/general_grupos)
        # y "la empresa a la que pertenece la persona" son el mismo dato en la
        # practica (ej. Mari pertenece a grupo/empresa CUMBRES). Si mas adelante
        # una persona necesita alcance por SOCIEDAD especifica (RFC) en vez de
        # holding, se agrega ahi tambien - por ahora el grupo es la fuente unica.
        grupos = [ug.group.nombre for ug in obj.user_groups.filter(removed_at__isnull=True).select_related("group")]
        if grupos:
            return ", ".join(grupos)
        rfcs = {
            ur.scope_id
            for ur in obj.user_roles.filter(
                revoked_at__isnull=True, scope_type=models.IamUserRole.SCOPE_SOCIEDAD
            )
        }
        if not rfcs:
            return "—"
        sociedades = models.GeneralSociedad.objects.filter(rfc__in=rfcs)
        return ", ".join(s.razon_social or s.rfc for s in sociedades) or ", ".join(rfcs)


admin.site.register(models.GeneralSociedad)
admin.site.register(models.GeneralGrupo)
admin.site.register(models.IamIdentity)
admin.site.register(models.IamRole)
admin.site.register(models.IamPermission)
admin.site.register(models.IamRolePermission)
admin.site.register(models.IamUserRole)
admin.site.register(models.IamGroup)
admin.site.register(models.IamUserGroup)
