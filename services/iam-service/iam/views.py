from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import IamUser
from .serializers import IamUserSerializer


class IamUserViewSet(ReadOnlyModelViewSet):
    """Solo lectura por ahora - la aplicacion del alcance (cumbresbi_scope)
    y los permisos de escritura llegan en Fase 1, junto con la emision real
    de JWT por iam-service. Esto es la primera API real del sistema, para
    validar Cloud Run + Cloud SQL de punta a punta (Fase 0, Actividad 1)."""

    queryset = IamUser.objects.all().order_by("primary_email")
    serializer_class = IamUserSerializer
