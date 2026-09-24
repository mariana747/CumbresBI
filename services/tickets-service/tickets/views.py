from cumbresbi_scope.permissions import require_permission
from django.db import models
from rest_framework.filters import SearchFilter
from rest_framework.viewsets import ModelViewSet

from .models import (
    Ticket,
    TicketsCentro,
    TicketsDependencia,
    TicketsLog,
    TicketsProyecto,
    TicketsProyectoParticipante,
    TicketsSubproyecto,
)
from .pagination import ListadoGrandePagination
from .serializers import (
    TicketSerializer,
    TicketsCentroSerializer,
    TicketsDependenciaSerializer,
    TicketsLogSerializer,
    TicketsProyectoParticipanteSerializer,
    TicketsProyectoSerializer,
    TicketsSubproyectoSerializer,
)


class _PermisosTicketsMixin:
    """Mismo gate de permisos en todos los recursos de este primer corte:
    crear=tickets.crear, editar/borrar=tickets.editar, lectura abierta -
    mismo criterio que _PermisosMaterialesMixin en materiales-service."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("tickets.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("tickets.editar")()]
        return super().get_permissions()

    # created_by/updated_by no se llenan solos (mismo bug real que ya
    # mordio al proyecto en Contraparte, ver memoria
    # bug-identity-user-id-nunca-se-llenaba) - se resuelven del
    # effective_scope del request, nunca del body.
    def perform_create(self, serializer):
        actor = self.request.effective_scope.identity_user_id
        serializer.save(created_by=actor, updated_by=actor)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.effective_scope.identity_user_id)


class TicketsCentroViewSet(_PermisosTicketsMixin, ModelViewSet):
    """Catalogo raiz de Centros - sin ScopedManager (nivel mas alto de la
    jerarquia, sin columna de alcance)."""

    queryset = TicketsCentro.objects.all().order_by("denominacion")
    serializer_class = TicketsCentroSerializer
    filter_backends = [SearchFilter]
    search_fields = ["denominacion"]
    pagination_class = ListadoGrandePagination


class TicketsProyectoViewSet(_PermisosTicketsMixin, ModelViewSet):
    """Sin ScopedManager todavia - el primer nivel con columna `sociedad`
    real es TicketsSubproyecto (fase 2)."""

    queryset = TicketsProyecto.objects.all().order_by("denominacion")
    serializer_class = TicketsProyectoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["denominacion", "responsable"]
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        centro = self.request.query_params.get("centro")
        if centro:
            queryset = queryset.filter(centro_id=centro)
        return queryset


class TicketsProyectoParticipanteViewSet(_PermisosTicketsMixin, ModelViewSet):
    """Tabla puente proyecto<->usuario. Se filtra por proyecto via query
    param (mismo patron que `centro` arriba) en vez de anidar la ruta -
    el frontend siempre la consulta desde el detalle de un Proyecto."""

    queryset = TicketsProyectoParticipante.objects.all().order_by("-created_at")
    serializer_class = TicketsProyectoParticipanteSerializer
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        queryset = super().get_queryset()
        id_proyecto = self.request.query_params.get("id_proyecto")
        if id_proyecto:
            queryset = queryset.filter(id_proyecto=id_proyecto)
        return queryset


class TicketsSubproyectoViewSet(_PermisosTicketsMixin, ModelViewSet):
    """Primer nivel con columna `sociedad` propia - usa ScopedManager real
    (ver TicketsSubproyecto.SCOPE_FIELD_SOCIEDAD en models.py)."""

    serializer_class = TicketsSubproyectoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["denominacion", "responsable"]
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        queryset = TicketsSubproyecto.objects.for_scope(self.request.effective_scope).order_by("denominacion")
        id_proyecto = self.request.query_params.get("id_proyecto")
        if id_proyecto:
            queryset = queryset.filter(id_proyecto=id_proyecto)
        return queryset


class TicketViewSet(_PermisosTicketsMixin, ModelViewSet):
    """La tarea individual - hereda el alcance por sociedad de su
    Subproyecto (ver Ticket.SCOPE_FIELD_SOCIEDAD en models.py)."""

    serializer_class = TicketSerializer
    filter_backends = [SearchFilter]
    search_fields = ["denominacion", "categoria", "asignado_a"]
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        queryset = Ticket.objects.for_scope(self.request.effective_scope).order_by("-created_at")
        id_subproyecto = self.request.query_params.get("id_subproyecto")
        if id_subproyecto:
            queryset = queryset.filter(id_subproyecto=id_subproyecto)
        estado = self.request.query_params.get("estado")
        if estado:
            queryset = queryset.filter(estado=estado)
        asignado_a = self.request.query_params.get("asignado_a")
        if asignado_a:
            queryset = queryset.filter(asignado_a=asignado_a)
        return queryset


class TicketsDependenciaViewSet(_PermisosTicketsMixin, ModelViewSet):
    """Precedencia entre tickets (ESTRICTO/FLEXIBLE, ver
    TicketsDependencia.TIPO_CHOICES) - hereda alcance via predecesora (ver
    TicketsDependencia.SCOPE_FIELD_SOCIEDAD)."""

    serializer_class = TicketsDependenciaSerializer
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        queryset = TicketsDependencia.objects.for_scope(self.request.effective_scope).order_by("-created_at")
        id_ticket = self.request.query_params.get("id_ticket")
        if id_ticket:
            queryset = queryset.filter(models.Q(predecesora=id_ticket) | models.Q(sucesora=id_ticket))
        return queryset


class TicketsLogViewSet(_PermisosTicketsMixin, ModelViewSet):
    """Bitacora de un Ticket - de solo agregar, sin editar/borrar (mismo
    criterio que IamUserRoleViewSet/IamUserGroupViewSet en iam-service:
    http_method_names sin put/patch/delete)."""

    http_method_names = ["get", "post", "head", "options"]
    serializer_class = TicketsLogSerializer
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        queryset = TicketsLog.objects.for_scope(self.request.effective_scope).order_by("-created_at")
        id_ticket = self.request.query_params.get("id_ticket")
        if id_ticket:
            queryset = queryset.filter(id_ticket=id_ticket)
        return queryset

    # TicketsLog si tiene updated_by/updated_at (ver models.py, calzan con
    # el ERD) - perform_create del mixin ya cubre ambos, sin override.
    # http_method_names arriba impide que se usen fuera de la creacion.
