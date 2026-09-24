"""Primera suite del servicio (Fase 1, 23/Sep/2026) - cubre lo minimo con
logica real: permisos por accion en los 3 niveles de esta fase (Centro,
Proyecto, Participante). Mismo patron que materiales-service/tests.py."""

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .models import Ticket, TicketsCentro, TicketsProyecto, TicketsSubproyecto
from .views import (
    TicketsCentroViewSet,
    TicketsDependenciaViewSet,
    TicketsLogViewSet,
    TicketsProyectoParticipanteViewSet,
    TicketsProyectoViewSet,
    TicketsSubproyectoViewSet,
    TicketViewSet,
)


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


class TicketsSubproyectoCrudTests(TestCase):
    """Fase 2 (23/Sep/2026) - primer nivel con ScopedManager real, mismo
    patron que PresupuestoViewSet en materiales-service."""

    def setUp(self):
        self.factory = APIRequestFactory()
        centro = TicketsCentro.objects.create(denominacion="TI", created_by="u001", updated_by="u001")
        self.proyecto = TicketsProyecto.objects.create(
            denominacion="Migracion ERP", centro=centro, responsable="u001", created_by="u001", updated_by="u001"
        )

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/subproyectos/",
            {
                "denominacion": "Fase Backend",
                "id_proyecto": self.proyecto.pk,
                "sociedad": "TCA010101AAA",
                "responsable": "u001",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TicketsSubproyectoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tickets_crear(self):
        request = self.factory.post(
            "/api/subproyectos/",
            {
                "denominacion": "Fase Backend",
                "id_proyecto": self.proyecto.pk,
                "sociedad": "TCA010101AAA",
                "responsable": "u001",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketsSubproyectoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["estado"], "PLANEADO")
        self.assertEqual(response.data["created_by"], "u001")

    def test_filtro_por_proyecto(self):
        otro_proyecto = TicketsProyecto.objects.create(
            denominacion="Onboarding", centro=self.proyecto.centro, responsable="u001", created_by="u001", updated_by="u001"
        )
        TicketsSubproyecto.objects.create(
            denominacion="Fase Backend",
            id_proyecto=self.proyecto,
            sociedad="TCA010101AAA",
            responsable="u001",
            created_by="u001",
            updated_by="u001",
        )
        TicketsSubproyecto.objects.create(
            denominacion="Fase Frontend",
            id_proyecto=otro_proyecto,
            sociedad="TCA010101AAA",
            responsable="u001",
            created_by="u001",
            updated_by="u001",
        )
        request = self.factory.get(f"/api/subproyectos/?id_proyecto={self.proyecto.pk}")
        request.effective_scope = EffectiveScope(is_global=True)
        view = TicketsSubproyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["denominacion"], "Fase Backend")

    def test_scope_por_sociedad_filtra_lo_ajeno(self):
        TicketsSubproyecto.objects.create(
            denominacion="Fase Backend",
            id_proyecto=self.proyecto,
            sociedad="AAA010101AAA",
            responsable="u001",
            created_by="u001",
            updated_by="u001",
        )
        TicketsSubproyecto.objects.create(
            denominacion="Fase Frontend",
            id_proyecto=self.proyecto,
            sociedad="BBB010101BBB",
            responsable="u001",
            created_by="u001",
            updated_by="u001",
        )
        request = self.factory.get("/api/subproyectos/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=("AAA010101AAA",))
        view = TicketsSubproyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["denominacion"], "Fase Backend")


class TicketCrudTests(TestCase):
    """Fase 3 (24/Sep/2026) - Ticket no tiene columna `sociedad` propia,
    hereda el alcance de su Subproyecto (id_subproyecto__sociedad)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        centro = TicketsCentro.objects.create(denominacion="TI", created_by="u001", updated_by="u001")
        proyecto = TicketsProyecto.objects.create(
            denominacion="Migracion ERP", centro=centro, responsable="u001", created_by="u001", updated_by="u001"
        )
        self.subproyecto = TicketsSubproyecto.objects.create(
            denominacion="Fase Backend",
            id_proyecto=proyecto,
            sociedad="TCA010101AAA",
            responsable="u001",
            created_by="u001",
            updated_by="u001",
        )

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/tickets/",
            {"denominacion": "Configurar CI", "id_subproyecto": self.subproyecto.pk},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TicketViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tickets_crear(self):
        request = self.factory.post(
            "/api/tickets/",
            {"denominacion": "Configurar CI", "id_subproyecto": self.subproyecto.pk},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["estado"], "PENDIENTE")
        self.assertEqual(response.data["prioridad"], "MEDIA")
        self.assertEqual(response.data["created_by"], "u001")

    def test_filtro_por_subproyecto_y_estado(self):
        TicketModel = self.subproyecto.tickets.model
        TicketModel.objects.create(
            denominacion="Configurar CI",
            id_subproyecto=self.subproyecto,
            estado="PENDIENTE",
            created_by="u001",
            updated_by="u001",
        )
        TicketModel.objects.create(
            denominacion="Deploy inicial",
            id_subproyecto=self.subproyecto,
            estado="COMPLETADO",
            created_by="u001",
            updated_by="u001",
        )
        request = self.factory.get(f"/api/tickets/?id_subproyecto={self.subproyecto.pk}&estado=PENDIENTE")
        request.effective_scope = EffectiveScope(is_global=True)
        view = TicketViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["denominacion"], "Configurar CI")

    def test_scope_hereda_sociedad_del_subproyecto(self):
        TicketModel = self.subproyecto.tickets.model
        TicketModel.objects.create(
            denominacion="Configurar CI",
            id_subproyecto=self.subproyecto,
            created_by="u001",
            updated_by="u001",
        )
        request = self.factory.get("/api/tickets/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=("OTRA010101AAA",))
        view = TicketViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)


class TicketsDependenciaCrudTests(TestCase):
    """Fase 4 (24/Sep/2026) - precedencia tipo Gantt entre tickets del
    mismo Subproyecto."""

    def setUp(self):
        self.factory = APIRequestFactory()
        centro = TicketsCentro.objects.create(denominacion="TI", created_by="u001", updated_by="u001")
        proyecto = TicketsProyecto.objects.create(
            denominacion="Migracion ERP", centro=centro, responsable="u001", created_by="u001", updated_by="u001"
        )
        subproyecto = TicketsSubproyecto.objects.create(
            denominacion="Fase Backend",
            id_proyecto=proyecto,
            sociedad="TCA010101AAA",
            responsable="u001",
            created_by="u001",
            updated_by="u001",
        )
        self.predecesora = Ticket.objects.create(
            denominacion="Configurar CI", id_subproyecto=subproyecto, created_by="u001", updated_by="u001"
        )
        self.sucesora = Ticket.objects.create(
            denominacion="Deploy inicial", id_subproyecto=subproyecto, created_by="u001", updated_by="u001"
        )

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/dependencias/",
            {"predecesora": self.predecesora.pk, "sucesora": self.sucesora.pk},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TicketsDependenciaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tickets_crear(self):
        request = self.factory.post(
            "/api/dependencias/",
            {"predecesora": self.predecesora.pk, "sucesora": self.sucesora.pk},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketsDependenciaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["tipo"], "ESTRICTO")

    def test_no_permite_autoreferencia(self):
        request = self.factory.post(
            "/api/dependencias/",
            {"predecesora": self.predecesora.pk, "sucesora": self.predecesora.pk},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketsDependenciaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_filtro_por_ticket_incluye_ambos_lados(self):
        TicketsDependenciaViewSet.as_view({"post": "create"})(
            self._request_crear()
        )
        request = self.factory.get(f"/api/dependencias/?id_ticket={self.sucesora.pk}")
        request.effective_scope = EffectiveScope(is_global=True)
        view = TicketsDependenciaViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def _request_crear(self):
        request = self.factory.post(
            "/api/dependencias/",
            {"predecesora": self.predecesora.pk, "sucesora": self.sucesora.pk},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        return request


class TicketsLogCrudTests(TestCase):
    """Fase 4 (24/Sep/2026) - bitacora append-only, sin editar/borrar."""

    def setUp(self):
        self.factory = APIRequestFactory()
        centro = TicketsCentro.objects.create(denominacion="TI", created_by="u001", updated_by="u001")
        proyecto = TicketsProyecto.objects.create(
            denominacion="Migracion ERP", centro=centro, responsable="u001", created_by="u001", updated_by="u001"
        )
        subproyecto = TicketsSubproyecto.objects.create(
            denominacion="Fase Backend",
            id_proyecto=proyecto,
            sociedad="TCA010101AAA",
            responsable="u001",
            created_by="u001",
            updated_by="u001",
        )
        self.ticket = Ticket.objects.create(
            denominacion="Configurar CI", id_subproyecto=subproyecto, created_by="u001", updated_by="u001"
        )

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/log/",
            {"id_ticket": self.ticket.pk, "accion": "ACTUALIZACION"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TicketsLogViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tickets_crear(self):
        request = self.factory.post(
            "/api/log/",
            {"id_ticket": self.ticket.pk, "accion": "ACTUALIZACION"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.crear",), identity_user_id="u001")
        view = TicketsLogViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["created_by"], "u001")

    def test_no_permite_editar(self):
        view = TicketsLogViewSet.as_view({"patch": "partial_update"})
        request = self.factory.patch("/api/log/x/", {"accion": "otra"}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tickets.editar",), identity_user_id="u001")
        response = view(request, pk="x")
        self.assertEqual(response.status_code, 405)
