from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from compras_tesoreria.views import (
    CotizacionViewSet,
    OrdenCompraViewSet,
    RecepcionViewSet,
    SolicitudCompraViewSet,
)

router = DefaultRouter()
router.register("solicitudes", SolicitudCompraViewSet, basename="solicitudcompra")
router.register("cotizaciones", CotizacionViewSet, basename="cotizacion")
router.register("ordenes", OrdenCompraViewSet, basename="ordencompra")
router.register("recepciones", RecepcionViewSet, basename="recepcion")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
