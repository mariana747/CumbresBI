from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .models import IamGroup, IamRole, IamUser, IamUserRole
from .serializers import IamGroupSerializer, IamRoleSerializer, IamUserRoleSerializer, IamUserSerializer


class IamUserViewSet(ReadOnlyModelViewSet):
    """Solo lectura por ahora - la aplicacion del alcance (cumbresbi_scope)
    y los permisos de escritura llegan en Fase 1, junto con la emision real
    de JWT por iam-service. Esto es la primera API real del sistema, para
    validar Cloud Run + Cloud SQL de punta a punta (Fase 0, Actividad 1).

    Directorio de usuarios (Fase 1): busqueda por correo/nombre via
    ?search=, filtro por estado via ?status=ACTIVE|SUSPENDED|DELETED, filtro
    por rol activo via ?role=<role_key> (ver iam_user_roles, revoked_at IS
    NULL) y filtro por empresa via ?group=<group_id> (IamGroup - membresia
    activa, removed_at IS NULL). Desactivar/reactivar (escritura) sigue
    pendiente - depende de permisos reales, no solo de exponer el campo.
    """

    queryset = IamUser.objects.all().order_by("primary_email")
    serializer_class = IamUserSerializer
    filter_backends = [SearchFilter]
    search_fields = ["primary_email", "display_name"]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param.upper())
        role_param = self.request.query_params.get("role")
        if role_param:
            queryset = queryset.filter(
                user_roles__role__role_key=role_param, user_roles__revoked_at__isnull=True
            ).distinct()
        group_param = self.request.query_params.get("group")
        if group_param:
            queryset = queryset.filter(
                user_groups__group_id=group_param, user_groups__removed_at__isnull=True
            ).distinct()
        return queryset


class IamRoleViewSet(ReadOnlyModelViewSet):
    """Solo lectura - catalogo de roles para poblar el filtro del directorio
    de usuarios. La gestion de roles (crear/editar) sigue pendiente."""

    queryset = IamRole.objects.all().order_by("role_name")
    serializer_class = IamRoleSerializer


class IamGroupViewSet(ReadOnlyModelViewSet):
    """Solo lectura - catalogo de "empresas" (IamGroup, equipos internos que
    en la practica se nombran como la empresa/sociedad del colaborador, ej.
    'CUMBRES', 'TIZARA CAPITAL') para poblar el filtro de empresa del
    directorio de usuarios."""

    queryset = IamGroup.objects.all().order_by("nombre")
    serializer_class = IamGroupSerializer


class IamUserRoleViewSet(ModelViewSet):
    """Otorgar y revocar roles (Fase 1, Semana 5: "logica de asignacion de
    roles con alcance"). Sin permisos reales todavia (pendiente JWT/scope de
    iam-service) - cualquiera puede otorgar/revocar por ahora, ver nota en
    serializers.py. Filtra por ?user=<user_id> para listar las asignaciones
    de un usuario especifico.

    DELETE no esta permitido a proposito: una asignacion nunca se borra, se
    revoca (revoked_at) para conservar el historial - usa
    POST /api/user-roles/{id}/revoke/.
    """

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamUserRole.objects.select_related("role", "user").order_by("-granted_at")
    serializer_class = IamUserRoleSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        user_param = self.request.query_params.get("user")
        if user_param:
            queryset = queryset.filter(user_id=user_param)
        active_only = self.request.query_params.get("active")
        if active_only == "true":
            queryset = queryset.filter(revoked_at__isnull=True)
        return queryset

    def perform_create(self, serializer):
        serializer.save(granted_at=timezone.now())

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        user_role = self.get_object()
        if user_role.revoked_at is None:
            user_role.revoked_at = timezone.now()
            user_role.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(user_role).data)
