from django.contrib import admin

from . import models

admin.site.register(models.GeneralSociedad)
admin.site.register(models.GeneralGrupo)
admin.site.register(models.IamUser)
admin.site.register(models.IamIdentity)
admin.site.register(models.IamRole)
admin.site.register(models.IamPermission)
admin.site.register(models.IamRolePermission)
admin.site.register(models.IamUserRole)
admin.site.register(models.IamGroup)
admin.site.register(models.IamUserGroup)
