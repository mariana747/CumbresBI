from rest_framework import serializers

from .models import IamGroup, IamPermission, IamRole, IamUser, IamUserRole


class IamUserSerializer(serializers.ModelSerializer):
    # Roles activos (revoked_at IS NULL) - solo las claves, para el
    # directorio de usuarios; el detalle de alcance (scope_type/scope_id)
    # de cada asignacion no aplica aqui, ver iam_user_roles.
    roles = serializers.SerializerMethodField()
    # Empresa(s) activa(s) (IamGroup, removed_at IS NULL) y su holding
    # (GeneralGrupo), para el filtro de empresa/grupo del directorio.
    empresas = serializers.SerializerMethodField()
    # Reporte de matriz de acceso (Fase 1, Semana 6): a diferencia de
    # "roles" (solo claves), aqui va el detalle de alcance por asignacion
    # activa, para poder armar la tabla usuario x rol x alcance.
    accesos = serializers.SerializerMethodField()

    class Meta:
        model = IamUser
        fields = [
            "user_id",
            "primary_email",
            "display_name",
            "status",
            "access_mode",
            "roles",
            "empresas",
            "accesos",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_roles(self, obj):
        return [
            user_role.role.role_key
            for user_role in obj.user_roles.filter(revoked_at__isnull=True).select_related("role")
        ]

    def get_empresas(self, obj):
        return [
            {"nombre": user_group.group.alias or user_group.group.nombre}
            for user_group in obj.user_groups.filter(removed_at__isnull=True).select_related("group")
        ]

    def get_accesos(self, obj):
        return [
            {
                "role_key": user_role.role.role_key,
                "role_name": user_role.role.role_name,
                "scope_type": user_role.scope_type,
                "scope_id": user_role.scope_id,
            }
            for user_role in obj.user_roles.filter(revoked_at__isnull=True).select_related("role")
        ]


class IamPermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = IamPermission
        fields = ["permission_id", "perm_key", "description"]
        read_only_fields = fields


class IamRoleSerializer(serializers.ModelSerializer):
    # Matriz de permisos (Fase 1, Semana 5): claves de permiso otorgadas a
    # este rol, para que el frontend arme la tabla roles x permisos
    # combinando esto con el catalogo completo de /api/permissions/.
    permisos = serializers.SerializerMethodField()

    class Meta:
        model = IamRole
        fields = ["role_id", "role_key", "role_name", "description", "permisos"]
        read_only_fields = fields

    def get_permisos(self, obj):
        return [
            role_permission.permission.perm_key
            for role_permission in obj.role_permissions.select_related("permission")
        ]


class IamUserRoleSerializer(serializers.ModelSerializer):
    """Otorgar/revocar roles (Fase 1, Semana 5). granted_by queda null por
    ahora - no hay JWT real todavia, asi que no sabemos quien es el actor
    (ver docs/architecture/README.md sec. 8); se completa cuando iam-service
    empiece a emitir/validar tokens."""

    role_key = serializers.CharField(source="role.role_key", read_only=True)
    role_name = serializers.CharField(source="role.role_name", read_only=True)
    # Denormalizado para el reporte de historial de cambios de permisos
    # (Fase 1, Semana 6) - sin esto habria que resolver cada user_id contra
    # /api/users/ desde el frontend solo para mostrar el correo.
    user_email = serializers.EmailField(source="user.primary_email", read_only=True)

    class Meta:
        model = IamUserRole
        fields = [
            "assignment_id",
            "user",
            "user_email",
            "role",
            "role_key",
            "role_name",
            "scope_type",
            "scope_id",
            "granted_at",
            "revoked_at",
        ]
        read_only_fields = [
            "assignment_id",
            "user_email",
            "role_key",
            "role_name",
            "granted_at",
            "revoked_at",
        ]


class IamGroupSerializer(serializers.ModelSerializer):
    """Empresa (IamGroup) para el filtro de empresa del directorio."""

    class Meta:
        model = IamGroup
        fields = ["group_id", "nombre", "alias"]
        read_only_fields = fields
