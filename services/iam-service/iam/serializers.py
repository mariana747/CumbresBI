from rest_framework import serializers

from .models import (
    GeneralSociedad,
    IamGroup,
    IamInvitation,
    IamMagicLink,
    IamPermission,
    IamRole,
    IamUser,
    IamUserCentroAccess,
    IamUserContratoAccess,
    IamUserGroup,
    IamUserRole,
)


class IamUserSerializer(serializers.ModelSerializer):
    # Roles activos (revoked_at IS NULL) - solo las claves, para el
    # directorio de usuarios; el detalle de alcance (scope_type/scope_id)
    # de cada asignacion no aplica aqui, ver iam_user_roles.
    roles = serializers.SerializerMethodField()
    # Empresa(s) activa(s) (IamGroup, removed_at IS NULL), para el filtro
    # de empresa del directorio.
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


class GeneralSociedadSerializer(serializers.ModelSerializer):
    """Catalogo real de sociedades (tabla general_sociedades del ERD).
    CRUD real (Fase 1, "Gestion organizacional" - onboarding sec. 7.2),
    ademas de alimentar el autocomplete de RFC en RoleAssignmentDialog.
    `rfc` es la primary key real - no editable despues de creada (crear
    una nueva fila si se necesita cambiar), igual que cualquier PK."""

    class Meta:
        model = GeneralSociedad
        fields = [
            "rfc",
            "razon_social",
            "regimen_mercantil",
            "alias_sociedad",
            "grupo",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["created_at", "updated_at"]


class IamUserGroupSerializer(serializers.ModelSerializer):
    """Otorgar/quitar la empresa de un usuario desde el Directorio (mismo
    criterio interino que IamUserRole: sin permisos reales todavia,
    granted_by null hasta que exista JWT real)."""

    group_nombre = serializers.CharField(source="group.nombre", read_only=True)
    group_alias = serializers.CharField(source="group.alias", read_only=True)
    user_email = serializers.EmailField(source="user.primary_email", read_only=True)

    class Meta:
        model = IamUserGroup
        fields = [
            "id",
            "user",
            "user_email",
            "group",
            "group_nombre",
            "group_alias",
            "created_at",
            "removed_at",
        ]
        read_only_fields = ["id", "user_email", "group_nombre", "group_alias", "created_at", "removed_at"]


class IamUserCentroAccessSerializer(serializers.ModelSerializer):
    """Grant plano de alcance CENTRO (roles-y-permisos.md sec. 1) -
    otorgar/revocar acceso de un usuario a un centro de trabajo especifico."""

    user_email = serializers.EmailField(source="user.primary_email", read_only=True)

    class Meta:
        model = IamUserCentroAccess
        fields = ["id", "user", "user_email", "centro_id", "granted_by", "granted_at", "revoked_at"]
        read_only_fields = ["id", "user_email", "granted_at", "revoked_at"]


class IamUserContratoAccessSerializer(serializers.ModelSerializer):
    """Grant plano de alcance CONTRATO - mismo criterio que
    IamUserCentroAccessSerializer, sobre un contrato individual."""

    user_email = serializers.EmailField(source="user.primary_email", read_only=True)

    class Meta:
        model = IamUserContratoAccess
        fields = ["id", "user", "user_email", "id_contrato", "granted_by", "granted_at", "revoked_at"]
        read_only_fields = ["id", "user_email", "granted_at", "revoked_at"]


class IamMagicLinkSerializer(serializers.ModelSerializer):
    """Magic Link (Fase 1, Semana 4). El token en claro NUNCA sale de este
    serializer salvo en el momento de creacion (ver
    IamMagicLinkViewSet.create, modo dev sin envio de correo real) - de ahi
    en adelante solo existe su hash en la base de datos."""

    class Meta:
        model = IamMagicLink
        fields = [
            "magic_link_id",
            "email",
            "recurso_tipo",
            "recurso_id",
            "issued_at",
            "issued_by",
            "expires_at",
            "max_uses",
            "uses_count",
            "first_used_at",
            "last_used_at",
            "revoked_at",
        ]
        read_only_fields = [
            "magic_link_id",
            "issued_at",
            "uses_count",
            "first_used_at",
            "last_used_at",
            "revoked_at",
        ]
        extra_kwargs = {
            # Calculado en IamMagicLinkViewSet.create a partir de
            # expires_in_minutes (request data) - no se recibe directo del
            # cliente para forzar que siempre pase por esa validacion.
            "expires_at": {"required": False}
        }


class IamInvitationSerializer(serializers.ModelSerializer):
    """Invitación formal de empleado nuevo (gate de _upsert_identity, ver
    auth_views.py). invited_by_email denormalizado por lo mismo que
    user_email en IamUserRoleSerializer - evitar que el frontend resuelva
    cada user_id contra /api/users/ solo para mostrar el correo del
    admin que invitó."""

    invited_by_email = serializers.EmailField(source="invited_by.primary_email", read_only=True)

    class Meta:
        model = IamInvitation
        fields = [
            "invitation_id",
            "email",
            "invited_by",
            "invited_by_email",
            "invited_at",
            "accepted_at",
            "revoked_at",
        ]
        read_only_fields = ["invitation_id", "invited_by_email", "invited_at", "accepted_at", "revoked_at"]
