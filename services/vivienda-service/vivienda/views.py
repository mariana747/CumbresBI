from cumbresbi_scope.permissions import require_permission
from rest_framework.filters import SearchFilter
from rest_framework.viewsets import ModelViewSet

from .models import (
    ViviendaListado,
    ViviendaProyecto,
    ViviendaRelExpedienteCliente,
    ViviendaVentasAsesor,
    ViviendaVentasExpediente,
    ViviendaVentasExpedienteItem,
)
from .serializers import (
    ViviendaListadoSerializer,
    ViviendaProyectoSerializer,
    ViviendaRelExpedienteClienteSerializer,
    ViviendaVentasAsesorSerializer,
    ViviendaVentasExpedienteItemSerializer,
    ViviendaVentasExpedienteSerializer,
)


class _PermisosVentasViviendaMixin:
    """Mismo gate de permisos en los 6 recursos de este primer corte de
    Fase 3 (arranque de exposicion CRUD, 19/Ago/2026): crear=
    ventas-vivienda.crear, editar/borrar=ventas-vivienda.editar, lectura
    abierta - ninguno de estos modelos tiene ScopedManager todavia (queda
    pendiente declarar SCOPE_FIELD_PROYECTO, ver docs/CumbresBI_estado.md
    linea 168 y serializers.py). Mismo criterio que
    _PermisosCatalogoTesoreriaMixin en tesoreria-service, un solo lugar
    para no repetir el mismo bloque 6 veces."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("ventas-vivienda.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("ventas-vivienda.editar")()]
        return super().get_permissions()


class ViviendaProyectoViewSet(_PermisosVentasViviendaMixin, ModelViewSet):
    """Proyectos de vivienda. Busqueda de texto libre (?search=) sobre
    denominacion/alias_proyecto. DELETE es fisico (sin soft-delete en el
    ERD real) - usar con cuidado, mismo criterio que TesoreriaContraparte."""

    queryset = ViviendaProyecto.objects.all().order_by("denominacion")
    serializer_class = ViviendaProyectoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["denominacion", "alias_proyecto"]


class ViviendaListadoViewSet(_PermisosVentasViviendaMixin, ModelViewSet):
    """Catalogo de unidades por proyecto. Filtrable por ?proyecto=<id> desde
    la pantalla de un proyecto especifico."""

    serializer_class = ViviendaListadoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["num_oficial", "denominacion", "modelo", "torre"]

    def get_queryset(self):
        queryset = ViviendaListado.objects.select_related("proyecto").order_by("-created_at")
        proyecto_id = self.request.query_params.get("proyecto")
        if proyecto_id:
            queryset = queryset.filter(proyecto_id=proyecto_id)
        return queryset


class ViviendaVentasAsesorViewSet(_PermisosVentasViviendaMixin, ModelViewSet):
    """Catalogo de asesores de venta. Mismo criterio de permisos que Proyecto."""

    queryset = ViviendaVentasAsesor.objects.all().order_by("nombre")
    serializer_class = ViviendaVentasAsesorSerializer
    filter_backends = [SearchFilter]
    search_fields = ["nombre", "email", "razon_social"]


class ViviendaVentasExpedienteViewSet(_PermisosVentasViviendaMixin, ModelViewSet):
    """Expedientes de venta. Filtrable por ?vivienda=<id> o ?asesor=<id>
    desde sus pantallas respectivas."""

    serializer_class = ViviendaVentasExpedienteSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_expediente", "id_contrato"]

    def get_queryset(self):
        queryset = ViviendaVentasExpediente.objects.select_related("vivienda", "asesor").order_by(
            "-created_at"
        )
        vivienda_id = self.request.query_params.get("vivienda")
        if vivienda_id:
            queryset = queryset.filter(vivienda_id=vivienda_id)
        asesor_id = self.request.query_params.get("asesor")
        if asesor_id:
            queryset = queryset.filter(asesor_id=asesor_id)
        return queryset


class ViviendaRelExpedienteClienteViewSet(_PermisosVentasViviendaMixin, ModelViewSet):
    """Datos del cliente/acreditado de un expediente. Filtrable por
    ?expediente=<id> desde la vista de detalle del expediente."""

    serializer_class = ViviendaRelExpedienteClienteSerializer

    def get_queryset(self):
        queryset = ViviendaRelExpedienteCliente.objects.select_related("expediente").order_by(
            "-created_at"
        )
        expediente_id = self.request.query_params.get("expediente")
        if expediente_id:
            queryset = queryset.filter(expediente_id=expediente_id)
        return queryset


class ViviendaVentasExpedienteItemViewSet(_PermisosVentasViviendaMixin, ModelViewSet):
    """Checklist de documentos de un expediente. Filtrable por
    ?expediente=<id> desde la vista de detalle del expediente."""

    serializer_class = ViviendaVentasExpedienteItemSerializer

    def get_queryset(self):
        queryset = ViviendaVentasExpedienteItem.objects.select_related("expediente").order_by(
            "-created_at"
        )
        expediente_id = self.request.query_params.get("expediente")
        if expediente_id:
            queryset = queryset.filter(expediente_id=expediente_id)
        return queryset
