from rest_framework.filters import SearchFilter
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import IamRole, IamUser
from .serializers import IamRoleSerializer, IamUserSerializer


class IamUserViewSet(ReadOnlyModelViewSet):
    """Solo lectura por ahora - la aplicacion del alcance (cumbresbi_scope)
    y los permisos de escritura llegan en Fase 1, junto con la emision real
    de JWT por iam-service. Esto es la primera API real del sistema, para
    validar Cloud Run + Cloud SQL de punta a punta (Fase 0, Actividad 1).

    Directorio de usuarios (Fase 1): busqueda por correo/nombre via
    ?search=, filtro por estado via ?status=ACTIVE|SUSPENDED|DELETED, y
    filtro por rol activo via ?role=<role_key> (ver iam_user_roles,
    revoked_at IS NULL). Desactivar/reactivar (escritura) sigue pendiente -
    depende de permisos reales, no solo de exponer el campo.
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
        return queryset


class IamRoleViewSet(ReadOnlyModelViewSet):
    """Solo lectura - catalogo de roles para poblar el filtro del directorio
    de usuarios. La gestion de roles (crear/editar) sigue pendiente."""

    queryset = IamRole.objects.all().order_by("role_name")
    serializer_class = IamRoleSerializer
