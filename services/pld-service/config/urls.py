from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from pld.views import (
    PldContraparteDocViewSet,
    PldContraparteKycViewSet,
    PldSolicitudEliminacionDocViewSet,
    PldTicketClienteViewSet,
)

router = DefaultRouter()
router.register("kyc", PldContraparteKycViewSet, basename="pldcontrapartekyc")
router.register("kyc-docs", PldContraparteDocViewSet, basename="pldcontrapartedoc")
router.register("solicitudes-eliminacion-doc", PldSolicitudEliminacionDocViewSet, basename="pldsolicitudeliminaciondoc")
router.register("ticket-cliente", PldTicketClienteViewSet, basename="pldticketcliente")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
