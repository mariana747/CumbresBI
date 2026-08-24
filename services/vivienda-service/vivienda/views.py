import logging

import requests
from cumbresbi_scope import forward_auth_headers
from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from rest_framework import status
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
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


logger = logging.getLogger(__name__)


def _existe_contraparte_en_tesoreria(id_contraparte, headers, cookies):
    """Verifica contra el catalogo maestro real (tesoreria-service) que
    `id_contraparte` exista (24/Ago/2026, cierre de la reconciliacion
    contraparte maestra - ver docs/CumbresBI_V2_Plan_de_Trabajo_y_Cronograma.md
    Semana 19, mismo criterio ya usado en
    pld-service/pld/views.py::_existe_contraparte_en_tesoreria).
    ContraparteSelector en el frontend siempre manda un id real, pero nada
    impedia hasta ahora que llegara uno inventado. Fail-open si
    tesoreria-service no responde - un problema de red entre servicios no
    debe bloquear el alta de un cliente real."""
    try:
        upstream = requests.get(
            f"{settings.TESORERIA_SERVICE_URL}/api/contrapartes/{id_contraparte}/",
            headers=headers,
            cookies=cookies,
            timeout=10,
        )
    except requests.RequestException:
        logger.warning(
            "tesoreria-service no respondio al validar id_contraparte %s", id_contraparte, exc_info=True
        )
        return True

    if upstream.status_code == 404:
        return False
    if upstream.status_code != 200:
        logger.warning(
            "tesoreria-service respondio %s al validar id_contraparte %s",
            upstream.status_code,
            id_contraparte,
        )
    return True


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

    def create(self, request, *args, **kwargs):
        """Valida contra el catalogo real de tesoreria-service antes de
        crear (24/Ago/2026, ver _existe_contraparte_en_tesoreria) - mismo
        criterio que PldContraparteKycViewSet.create en pld-service."""
        id_contraparte = request.data.get("id_contraparte")
        if id_contraparte:
            headers, cookies = forward_auth_headers(request)
            if not _existe_contraparte_en_tesoreria(id_contraparte, headers, cookies):
                return Response(
                    {"id_contraparte": "No existe esa contraparte en el catálogo de Tesorería."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().create(request, *args, **kwargs)


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
