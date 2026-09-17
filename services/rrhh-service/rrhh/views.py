import uuid

from cumbresbi_scope.permissions import require_permission
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import RrhhEmpleado, RrhhPuesto
from .serializers import RrhhEmpleadoSerializer, RrhhPuestoSerializer


def _short_id():
    # id_empleado/id_puesto no traen valor de negocio legible (a diferencia
    # de FLJ-###### o NOM-######) - mismo criterio que
    # TesoreriaMovimientoBancario._short_id en tesoreria-service.
    return uuid.uuid4().hex[:8]


class _PermisosRrhhMixin:
    """Gate de permisos comun a Empleados/Puestos: crear=rrhh.crear,
    editar/borrar=rrhh.editar, lectura abierta a quien tenga rrhh.leer (via
    ScopedManager). Mismo criterio que _PermisosMaterialesMixin."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("rrhh.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("rrhh.editar")()]
        return super().get_permissions()


class RrhhEmpleadoViewSet(_PermisosRrhhMixin, ModelViewSet):
    """El alcance real llega via la relacion inversa con Puestos
    (SCOPE_FIELD_SOCIEDAD = "puestos__sociedad"), por eso .distinct(): un
    empleado con mas de un Puesto que matchea el scope saldria duplicado."""

    serializer_class = RrhhEmpleadoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_empleado", "nombres", "apellido_paterno", "apellido_materno", "curp", "rfc"]

    def get_queryset(self):
        return RrhhEmpleado.objects.for_scope(self.request.effective_scope).distinct().order_by(
            "apellido_paterno", "nombres"
        )

    def perform_create(self, serializer):
        serializer.save(id_empleado=_short_id())


class RrhhPuestoViewSet(_PermisosRrhhMixin, ModelViewSet):
    """El historial de sueldo se logra dando de baja el Puesto vigente y
    creando uno nuevo con el sueldo actualizado (ver dar_de_baja) - nunca se
    edita salario_diario de un Puesto ya usado en nomina.

    Filtros por query param: ?empleado=, ?sociedad=, ?proyecto=, ?vigente=true
    (solo puestos sin fecha_baja)."""

    serializer_class = RrhhPuestoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_puesto", "puesto", "departamento"]

    def get_queryset(self):
        queryset = RrhhPuesto.objects.for_scope(self.request.effective_scope).select_related(
            "empleado"
        ).order_by("-fecha_alta")
        empleado_id = self.request.query_params.get("empleado")
        if empleado_id:
            queryset = queryset.filter(empleado_id=empleado_id)
        sociedad = self.request.query_params.get("sociedad")
        if sociedad:
            queryset = queryset.filter(sociedad=sociedad)
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        if self.request.query_params.get("vigente") == "true":
            queryset = queryset.filter(fecha_baja__isnull=True)
        return queryset

    def perform_create(self, serializer):
        serializer.save(id_puesto=_short_id())

    @action(detail=True, methods=["post"])
    def dar_de_baja(self, request, pk=None):
        """Cierra este Puesto - paso previo a crear el Puesto nuevo con el
        sueldo actualizado (el frontend hace ambas llamadas seguidas)."""
        puesto = self.get_object()
        puesto.fecha_baja = request.data.get("fecha_baja") or timezone.now().date()
        motivo_fin = request.data.get("motivo_fin")
        if motivo_fin:
            puesto.motivo_fin = motivo_fin
        puesto.save(update_fields=["fecha_baja", "motivo_fin", "updated_at"])
        return Response(self.get_serializer(puesto).data)
