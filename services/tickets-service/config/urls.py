from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from tickets.views import (
    TicketsCentroViewSet,
    TicketsProyectoParticipanteViewSet,
    TicketsProyectoViewSet,
)

router = DefaultRouter()
router.register("centros", TicketsCentroViewSet, basename="ticketscentro")
router.register("proyectos", TicketsProyectoViewSet, basename="ticketsproyecto")
router.register("participantes", TicketsProyectoParticipanteViewSet, basename="ticketsproyectoparticipante")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
