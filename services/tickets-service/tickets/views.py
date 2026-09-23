from cumbresbi_scope.permissions import require_permission
from rest_framework.filters import SearchFilter
from rest_framework.viewsets import ModelViewSet

from .models import TicketsCentro, TicketsProyecto, TicketsProyectoParticipante
from .pagination import ListadoGrandePagination
from .serializers import (
    TicketsCentroSerializer,
    TicketsProyectoParticipanteSerializer,
    TicketsProyectoSerializer,
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
