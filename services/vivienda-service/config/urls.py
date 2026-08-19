from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from vivienda.views import (
    ViviendaListadoViewSet,
    ViviendaProyectoViewSet,
    ViviendaRelExpedienteClienteViewSet,
    ViviendaVentasAsesorViewSet,
    ViviendaVentasExpedienteItemViewSet,
    ViviendaVentasExpedienteViewSet,
)

router = DefaultRouter()
router.register("proyectos", ViviendaProyectoViewSet, basename="viviendaproyecto")
router.register("viviendas", ViviendaListadoViewSet, basename="viviendalistado")
router.register("asesores", ViviendaVentasAsesorViewSet, basename="viviendaasesor")
router.register("expedientes", ViviendaVentasExpedienteViewSet, basename="viviendaexpediente")
router.register(
    "expedientes-clientes", ViviendaRelExpedienteClienteViewSet, basename="viviendaexpedientecliente"
)
router.register(
    "expedientes-items", ViviendaVentasExpedienteItemViewSet, basename="viviendaexpedienteitem"
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
