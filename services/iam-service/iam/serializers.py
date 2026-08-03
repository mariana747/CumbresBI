from rest_framework import serializers

from .models import IamGroup, IamRole, IamUser, IamUserRole


class IamUserSerializer(serializers.ModelSerializer):
    # Roles activos (revoked_at IS NULL) - solo las claves, para el
    # directorio de usuarios; el detalle de alcance (scope_type/scope_id)
    # de cada asignacion no aplica aqui, ver iam_user_roles.
    roles = serializers.SerializerMethodField()
    # Empresa(s) activa(s) (IamGroup, removed_at IS NULL) y su holding
    # (GeneralGrupo), para el filtro de empresa/grupo del directorio.
    empresas = serializers.SerializerMethodField()

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


class IamRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = IamRole
        fields = ["role_id", "role_key", "role_name", "description"]
        read_only_fields = fields


class IamUserRoleSerializer(serializers.ModelSerializer):
    """Otorgar/revocar roles (Fase 1, Semana 5). granted_by queda null por
    ahora - no hay JWT real todavia, asi que no sabemos quien es el actor
    (ver docs/architecture/README.md sec. 8); se completa cuando iam-service
    empiece a emitir/validar tokens."""

    role_key = serializers.CharField(source="role.role_key", read_only=True)
    role_name = serializers.CharField(source="role.role_name", read_only=True)

    class Meta:
        model = IamUserRole
        fields = [
            "assignment_id",
            "user",
            "role",
            "role_key",
            "role_name",
            "scope_type",
            "scope_id",
            "granted_at",
            "revoked_at",
        ]
        read_only_fields = ["assignment_id", "role_key", "role_name", "granted_at", "revoked_at"]


class IamGroupSerializer(serializers.ModelSerializer):
    """Empresa (IamGroup) para el filtro de empresa del directorio."""

    class Meta:
        model = IamGroup
        fields = ["group_id", "nombre", "alias"]
        read_only_fields = fields
