from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from tickets.views import (
    TicketsCentroViewSet,
    TicketsDependenciaViewSet,
    TicketsLogViewSet,
    TicketsProyectoParticipanteViewSet,
    TicketsProyectoViewSet,
    TicketsSubproyectoViewSet,
    TicketViewSet,
)

router = DefaultRouter()
router.register("centros", TicketsCentroViewSet, basename="ticketscentro")
router.register("proyectos", TicketsProyectoViewSet, basename="ticketsproyecto")
router.register("participantes", TicketsProyectoParticipanteViewSet, basename="ticketsproyectoparticipante")
router.register("subproyectos", TicketsSubproyectoViewSet, basename="ticketssubproyecto")
router.register("tickets", TicketViewSet, basename="ticket")
router.register("dependencias", TicketsDependenciaViewSet, basename="ticketsdependencia")
router.register("log", TicketsLogViewSet, basename="ticketslog")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
