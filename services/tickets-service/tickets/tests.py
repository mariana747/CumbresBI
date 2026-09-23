"""Primera suite del servicio (Fase 1, 23/Sep/2026) - cubre lo minimo con
logica real: permisos por accion en los 3 niveles de esta fase (Centro,
Proyecto, Participante). Mismo patron que materiales-service/tests.py."""

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .models import TicketsCentro, TicketsProyecto
from .views import TicketsCentroViewSet, TicketsProyectoParticipanteViewSet, TicketsProyectoViewSet


class TicketsCentroCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post("/api/centros/", {"denominacion": "Obras corporativas"}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TicketsCentroViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tickets_crear(self):
        request = self.factory.post(
            "/api/centros/",
            {"denominacion": "Obras corporativas"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketsCentroViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["denominacion"], "Obras corporativas")
        self.assertEqual(response.data["created_by"], "u001")

    def test_lectura_sin_permiso_especial(self):
        TicketsCentro.objects.create(denominacion="TI", created_by="u001", updated_by="u001")
        request = self.factory.get("/api/centros/")
        request.effective_scope = EffectiveScope.anonymous()
        view = TicketsCentroViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)


class TicketsProyectoCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.centro = TicketsCentro.objects.create(denominacion="TI", created_by="u001", updated_by="u001")

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/proyectos/",
            {"denominacion": "Migracion ERP", "centro": self.centro.pk, "responsable": "u001"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TicketsProyectoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tickets_crear(self):
        request = self.factory.post(
            "/api/proyectos/",
            {
                "denominacion": "Migracion ERP",
                "centro": self.centro.pk,
                "responsable": "u001",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketsProyectoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["estado"], "PLANEADO")
        self.assertEqual(response.data["created_by"], "u001")

    def test_filtro_por_centro(self):
        otro_centro = TicketsCentro.objects.create(denominacion="RRHH", created_by="u001", updated_by="u001")
        TicketsProyecto.objects.create(
            denominacion="Migracion ERP", centro=self.centro, responsable="u001", created_by="u001", updated_by="u001"
        )
        TicketsProyecto.objects.create(
            denominacion="Onboarding", centro=otro_centro, responsable="u001", created_by="u001", updated_by="u001"
        )
        request = self.factory.get(f"/api/proyectos/?centro={self.centro.pk}")
        request.effective_scope = EffectiveScope.anonymous()
        view = TicketsProyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["denominacion"], "Migracion ERP")


class TicketsProyectoParticipanteCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        centro = TicketsCentro.objects.create(denominacion="TI", created_by="u001", updated_by="u001")
        self.proyecto = TicketsProyecto.objects.create(
            denominacion="Migracion ERP", centro=centro, responsable="u001", created_by="u001", updated_by="u001"
        )

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/participantes/",
            {"id_proyecto": self.proyecto.pk, "id_participante": "u002"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TicketsProyectoParticipanteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tickets_crear(self):
        request = self.factory.post(
            "/api/participantes/",
            {
                "id_proyecto": self.proyecto.pk,
                "id_participante": "u002",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketsProyectoParticipanteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id_participante"], "u002")
        self.assertEqual(response.data["created_by"], "u001")
