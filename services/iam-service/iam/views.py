from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .magic_link_utils import generate_token, hash_token, issue_external_jwt
from .models import IamGroup, IamMagicLink, IamPermission, IamRole, IamUser, IamUserRole
from .serializers import (
    IamGroupSerializer,
    IamMagicLinkSerializer,
    IamPermissionSerializer,
    IamRoleSerializer,
    IamUserRoleSerializer,
    IamUserSerializer,
)

MAGIC_LINK_DEFAULT_EXPIRATION_DAYS = 7


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
    de usuarios y, via el campo "permisos" del serializer, la matriz de
    permisos roles x permisos (Fase 1, Semana 5). La gestion de roles
    (crear/editar) sigue pendiente."""

    queryset = IamRole.objects.all().order_by("role_name")
    serializer_class = IamRoleSerializer


class IamPermissionViewSet(ReadOnlyModelViewSet):
    """Solo lectura - catalogo completo de permisos (Fase 1, Semana 5), para
    que el frontend arme las columnas de la matriz de permisos combinando
    esto con el campo "permisos" de cada IamRole."""

    queryset = IamPermission.objects.all().order_by("perm_key")
    serializer_class = IamPermissionSerializer


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

    Reporte de historial de cambios de permisos (Fase 1, Semana 6): esta
    misma lista, sin el filtro ?user=, ya es el historial completo
    (otorgamientos y revocaciones, mas recientes primero) - no hace falta
    un endpoint de reporte aparte.
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


class IamMagicLinkViewSet(ModelViewSet):
    """Magic Links de un solo uso para usuarios externos (Fase 1, Semana 4;
    docs/architecture/README.md sec. 6.2). Sin permisos reales todavia
    (mismo estado que el resto de iam-service, pendiente JWT/scope real).

    MODO DEV: no hay envio de correo real todavia (pendiente confirmar con
    Arturo el envio desde una cuenta de Workspace) - por eso "crear" regresa
    el token en claro y el link completo en la respuesta, en vez de solo
    enviarlo por correo. Quitar ese campo de la respuesta es el unico
    cambio necesario cuando exista el envio real (ver magic_link_utils.py).

    DELETE no esta permitido: un magic link no se borra, se revoca (mismo
    criterio que iam_user_roles) - usa POST /api/magic-links/{id}/revocar/.
    """

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamMagicLink.objects.all().order_by("-issued_at")
    serializer_class = IamMagicLinkSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        email_param = self.request.query_params.get("email")
        if email_param:
            queryset = queryset.filter(email__iexact=email_param)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token, token_hash = generate_token()
        expires_in_days = int(request.data.get("expires_in_days") or MAGIC_LINK_DEFAULT_EXPIRATION_DAYS)
        magic_link = serializer.save(
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(days=expires_in_days),
        )

        data = self.get_serializer(magic_link).data
        # Modo dev sin correo real (ver docstring de la clase) - remover
        # "token" y "magic_link_url" de aqui cuando exista el envio real.
        data["token"] = token
        data["magic_link_url"] = f"/magic-link/{token}"
        return Response(data, status=201)

    @action(detail=False, methods=["post"])
    def validar(self, request):
        """Valida un token en claro (recibido en el link) y, si es valido,
        emite el JWT de alcance externo limitado. No requiere autenticacion
        - es el punto de entrada publico del flujo de Magic Link."""
        token = request.data.get("token")
        if not token:
            return Response({"token": ["Este campo es requerido."]}, status=400)

        try:
            magic_link = IamMagicLink.objects.get(token_hash=hash_token(token))
        except IamMagicLink.DoesNotExist:
            return Response({"detail": "Token invalido."}, status=404)

        now = timezone.now()
        if magic_link.revoked_at is not None:
            return Response({"detail": "Token revocado."}, status=410)
        if magic_link.expires_at < now:
            return Response({"detail": "Token expirado."}, status=410)
        if magic_link.uses_count >= magic_link.max_uses:
            return Response({"detail": "Token ya alcanzo su limite de usos."}, status=410)

        # Firmar primero: si esto falla, el link no debe darse por usado
        # (evita "quemar" un uso valido por un error de firma).
        jwt_token = issue_external_jwt(magic_link)

        magic_link.uses_count += 1
        magic_link.last_used_at = now
        if magic_link.first_used_at is None:
            magic_link.first_used_at = now
        magic_link.save(update_fields=["uses_count", "last_used_at", "first_used_at"])

        return Response(
            {
                "magic_link": self.get_serializer(magic_link).data,
                "jwt": jwt_token,
            }
        )

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        magic_link = self.get_object()
        if magic_link.revoked_at is None:
            magic_link.revoked_at = timezone.now()
            magic_link.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(magic_link).data)

    @action(detail=True, methods=["post"])
    def reenviar(self, request, pk=None):
        """Revoca el link actual y crea uno nuevo con el mismo
        email/recurso (mismo criterio de "reenvio" que pide el plan de
        trabajo Fase 1 Semana 4) - nunca se reutiliza el token viejo."""
        anterior = self.get_object()
        if anterior.revoked_at is None:
            anterior.revoked_at = timezone.now()
            anterior.save(update_fields=["revoked_at"])

        token, token_hash = generate_token()
        nuevo = IamMagicLink.objects.create(
            email=anterior.email,
            recurso_tipo=anterior.recurso_tipo,
            recurso_id=anterior.recurso_id,
            token_hash=token_hash,
            issued_by=anterior.issued_by,
            expires_at=timezone.now() + timedelta(days=MAGIC_LINK_DEFAULT_EXPIRATION_DAYS),
            max_uses=anterior.max_uses,
        )
        data = self.get_serializer(nuevo).data
        data["token"] = token
        data["magic_link_url"] = f"/magic-link/{token}"
        return Response(data, status=201)
