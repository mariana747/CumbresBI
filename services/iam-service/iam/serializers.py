from rest_framework import serializers

from .models import IamRole, IamUser


class IamUserSerializer(serializers.ModelSerializer):
    # Roles activos (revoked_at IS NULL) - solo las claves, para el
    # directorio de usuarios; el detalle de alcance (scope_type/scope_id)
    # de cada asignacion no aplica aqui, ver iam_user_roles.
    roles = serializers.SerializerMethodField()

    class Meta:
        model = IamUser
        fields = [
            "user_id",
            "primary_email",
            "display_name",
            "status",
            "access_mode",
            "roles",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_roles(self, obj):
        return [
            user_role.role.role_key
            for user_role in obj.user_roles.filter(revoked_at__isnull=True).select_related("role")
        ]


class IamRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = IamRole
        fields = ["role_id", "role_key", "role_name", "description"]
        read_only_fields = fields
