from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from pld.views import (
    PldContraparteDocViewSet,
    PldContraparteKycViewSet,
    PldDocumentoTicketViewSet,
    PldRepresentanteLegalViewSet,
    PldSolicitudEliminacionDocViewSet,
    PldTicketClienteViewSet,
)

router = DefaultRouter()
router.register("kyc", PldContraparteKycViewSet, basename="pldcontrapartekyc")
router.register("kyc-docs", PldContraparteDocViewSet, basename="pldcontrapartedoc")
router.register("representantes-legales", PldRepresentanteLegalViewSet, basename="pldrepresentantelegal")
router.register("solicitudes-eliminacion-doc", PldSolicitudEliminacionDocViewSet, basename="pldsolicitudeliminaciondoc")
router.register("ticket-cliente", PldTicketClienteViewSet, basename="pldticketcliente")
# basename requerido (04/Sep/2026): PldDocumentoTicketViewSet es un ViewSet
# plano sin queryset, DefaultRouter no puede inferirlo solo. "documento-
# tickets" (plural) mismo criterio que tesoreria-service/config/urls.py.
router.register("documento-tickets", PldDocumentoTicketViewSet, basename="plddocumentoticket")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
