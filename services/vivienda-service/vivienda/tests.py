"""Primera suite del servicio (19/Ago/2026, arranque de exposicion CRUD de
Fase 3: docs/CumbresBI_estado.md, Fase 3). Los 6 modelos ya existian
completos desde antes (heredados via inspectdb, sin capa de negocio) -
esta suite prueba la capa nueva (serializers/views/urls), no los modelos.

31/Ago/2026 (auditoria de scope): SCOPE_FIELD_PROYECTO/SOCIEDAD ya se
declararon (ver models.py) - antes este servicio era lectura abierta sin
RLS. Los tests que probaban "lectura no requiere permiso especial" usaban
EffectiveScope.anonymous() para representar "sin perm_keys", pero
anonymous() tambien significa "sin alcance, no ve nada" (ver su docstring
en cumbresbi_scope/scope.py) - con RLS real esos tests dejaron de tener
sentido tal cual estaban. Se corrigieron a EffectiveScope(is_global=True)
(usuario autenticado, sin perm_keys especiales) para seguir probando lo
mismo que antes sin depender del hueco de RLS que ya no existe."""

from unittest.mock import Mock, patch

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .models import (
    ViviendaListado,
    ViviendaProyecto,
    ViviendaVentasAsesor,
    ViviendaVentasExpediente,
    ViviendaVentasExpedienteItem,
)
from .views import (
    ViviendaListadoViewSet,
    ViviendaProyectoViewSet,
    ViviendaRelExpedienteClienteViewSet,
    ViviendaVentasAsesorViewSet,
    ViviendaVentasExpedienteItemViewSet,
    ViviendaVentasExpedienteViewSet,
)


class ViviendaProyectoCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.proyecto = ViviendaProyecto.objects.create(
            denominacion="Residencial Prueba",
            dom_calle="Calle 1",
            dom_numero_ext="10",
            dom_numero_int="S/N",
            dom_colonia="Centro",
            dom_municipio_alcaldia="Monterrey",
            dom_estado="Nuevo Leon",
            dom_cp="64000",
            dom_pais="Mexico",
            created_by="u001",
            updated_by="u001",
        )

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/proyectos/",
            {
                "denominacion": "Nuevo",
                "dom_calle": "Calle 2",
                "dom_numero_ext": "20",
                "dom_numero_int": "S/N",
                "dom_colonia": "Centro",
                "dom_municipio_alcaldia": "Monterrey",
                "dom_estado": "Nuevo Leon",
                "dom_cp": "64000",
                "dom_pais": "Mexico",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = ViviendaProyectoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_ventas_vivienda_crear(self):
        request = self.factory.post(
            "/api/proyectos/",
            {
                "denominacion": "Nuevo",
                "dom_calle": "Calle 2",
                "dom_numero_ext": "20",
                "dom_numero_int": "S/N",
                "dom_colonia": "Centro",
                "dom_municipio_alcaldia": "Monterrey",
                "dom_estado": "Nuevo Leon",
                "dom_cp": "64000",
                "dom_pais": "Mexico",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("ventas-vivienda.crear",))
        view = ViviendaProyectoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ViviendaProyecto.objects.filter(denominacion="Nuevo").exists())

    def test_editar_requiere_ventas_vivienda_editar(self):
        request = self.factory.patch(
            f"/api/proyectos/{self.proyecto.id_proyecto}/", {"denominacion": "Editado"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("ventas-vivienda.crear",))
        view = ViviendaProyectoViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=self.proyecto.id_proyecto)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.patch(
            f"/api/proyectos/{self.proyecto.id_proyecto}/", {"denominacion": "Editado"}, format="json"
        )
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("ventas-vivienda.editar",))
        response2 = view(request2, pk=self.proyecto.id_proyecto)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["denominacion"], "Editado")

    def test_lectura_sigue_sin_permiso_especial(self):
        request = self.factory.get("/api/proyectos/")
        request.effective_scope = EffectiveScope(is_global=True)
        view = ViviendaProyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_busqueda_por_denominacion(self):
        ViviendaProyecto.objects.create(
            denominacion="Otro proyecto",
            dom_calle="Calle 3",
            dom_numero_ext="30",
            dom_numero_int="S/N",
            dom_colonia="Centro",
            dom_municipio_alcaldia="Monterrey",
            dom_estado="Nuevo Leon",
            dom_cp="64000",
            dom_pais="Mexico",
            created_by="u001",
            updated_by="u001",
        )
        request = self.factory.get("/api/proyectos/", {"search": "Prueba"})
        request.effective_scope = EffectiveScope(is_global=True)
        view = ViviendaProyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["denominacion"], "Residencial Prueba")


class ViviendaScopeTests(TestCase):
    """31/Ago/2026 (auditoria de scope): confirma que un usuario acotado a
    un proyecto no ve el de otro, mismo criterio que ObraLoteScopeTests en
    obra-service."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.proyecto_a = ViviendaProyecto.objects.create(
            denominacion="Proyecto A",
            dom_calle="Calle 1", dom_numero_ext="1", dom_numero_int="S/N", dom_colonia="Centro",
            dom_municipio_alcaldia="Monterrey", dom_estado="Nuevo Leon", dom_cp="64000", dom_pais="Mexico",
            created_by="u001", updated_by="u001",
        )
        self.proyecto_b = ViviendaProyecto.objects.create(
            denominacion="Proyecto B",
            dom_calle="Calle 2", dom_numero_ext="2", dom_numero_int="S/N", dom_colonia="Centro",
            dom_municipio_alcaldia="Monterrey", dom_estado="Nuevo Leon", dom_cp="64000", dom_pais="Mexico",
            created_by="u001", updated_by="u001",
        )

    def test_usuario_de_un_proyecto_no_ve_el_proyecto_de_otro(self):
        request = self.factory.get("/api/proyectos/")
        request.effective_scope = EffectiveScope(is_global=False, proyecto_ids=(self.proyecto_a.id_proyecto,))
        view = ViviendaProyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_proyecto"], self.proyecto_a.id_proyecto)

    def test_usuario_de_un_proyecto_no_ve_viviendas_de_otro(self):
        ViviendaListado.objects.create(
            proyecto=self.proyecto_a, denominacion="Casa A", created_by="u001", updated_by="u001"
        )
        ViviendaListado.objects.create(
            proyecto=self.proyecto_b, denominacion="Casa B", created_by="u001", updated_by="u001"
        )
        request = self.factory.get("/api/viviendas/")
        request.effective_scope = EffectiveScope(is_global=False, proyecto_ids=(self.proyecto_a.id_proyecto,))
        view = ViviendaListadoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["denominacion"], "Casa A")

    def test_anonimo_no_ve_nada(self):
        request = self.factory.get("/api/proyectos/")
        request.effective_scope = EffectiveScope.anonymous()
        view = ViviendaProyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 0)

    def test_global_ve_ambos_proyectos(self):
        request = self.factory.get("/api/proyectos/")
        request.effective_scope = EffectiveScope(is_global=True)
        view = ViviendaProyectoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 2)


class ViviendaListadoTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.proyecto = ViviendaProyecto.objects.create(
            denominacion="Residencial Prueba",
            dom_calle="Calle 1",
            dom_numero_ext="10",
            dom_numero_int="S/N",
            dom_colonia="Centro",
            dom_municipio_alcaldia="Monterrey",
            dom_estado="Nuevo Leon",
            dom_cp="64000",
            dom_pais="Mexico",
            created_by="u001",
            updated_by="u001",
        )
        self.otro_proyecto = ViviendaProyecto.objects.create(
            denominacion="Otro proyecto",
            dom_calle="Calle 2",
            dom_numero_ext="20",
            dom_numero_int="S/N",
            dom_colonia="Centro",
            dom_municipio_alcaldia="Monterrey",
            dom_estado="Nuevo Leon",
            dom_cp="64000",
            dom_pais="Mexico",
            created_by="u001",
            updated_by="u001",
        )

    def test_crear_vivienda_requiere_permiso(self):
        request = self.factory.post(
            "/api/viviendas/", {"proyecto": self.proyecto.id_proyecto, "denominacion": "Casa 1"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = ViviendaListadoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(
            "/api/viviendas/",
            {
                "proyecto": self.proyecto.id_proyecto,
                "denominacion": "Casa 1",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("ventas-vivienda.crear",))
        response2 = view(request2)
        self.assertEqual(response2.status_code, 201)
        self.assertEqual(response2.data["proyecto_denominacion"], "Residencial Prueba")

    def test_filtro_por_proyecto(self):
        ViviendaListado.objects.create(
            proyecto=self.proyecto, denominacion="Casa A", created_by="u001", updated_by="u001"
        )
        ViviendaListado.objects.create(
            proyecto=self.otro_proyecto, denominacion="Casa B", created_by="u001", updated_by="u001"
        )
        request = self.factory.get("/api/viviendas/", {"proyecto": self.proyecto.id_proyecto})
        request.effective_scope = EffectiveScope(is_global=True)
        view = ViviendaListadoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["denominacion"], "Casa A")


class ViviendaVentasAsesorCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_crear_asesor_requiere_permiso(self):
        request = self.factory.post(
            "/api/asesores/",
            {"nombre": "Asesor 1", "email": "asesor1@prueba.com", "persona_moral": False, "porc_comision": "0.05"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = ViviendaVentasAsesorViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(
            "/api/asesores/",
            {
                "nombre": "Asesor 1",
                "email": "asesor1@prueba.com",
                "persona_moral": False,
                "porc_comision": "0.05",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("ventas-vivienda.crear",))
        response2 = view(request2)
        self.assertEqual(response2.status_code, 201)


class ViviendaExpedienteYRelacionesTests(TestCase):
    """Expediente + cliente + items - las 3 tablas que cuelgan de un
    expediente de venta, probadas juntas porque comparten el mismo fixture
    (misma vivienda/asesor)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.proyecto = ViviendaProyecto.objects.create(
            denominacion="Residencial Prueba",
            dom_calle="Calle 1",
            dom_numero_ext="10",
            dom_numero_int="S/N",
            dom_colonia="Centro",
            dom_municipio_alcaldia="Monterrey",
            dom_estado="Nuevo Leon",
            dom_cp="64000",
            dom_pais="Mexico",
            created_by="u001",
            updated_by="u001",
        )
        self.vivienda = ViviendaListado.objects.create(
            proyecto=self.proyecto, denominacion="Casa 1", created_by="u001", updated_by="u001"
        )
        self.asesor = ViviendaVentasAsesor.objects.create(
            nombre="Asesor 1", email="asesor1@prueba.com", persona_moral=False, porc_comision="0.05",
            created_by="u001", updated_by="u001",
        )
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("ventas-vivienda.crear",))

    def test_crear_expediente_incluye_nombres_de_vivienda_y_asesor(self):
        request = self.factory.post(
            "/api/expedientes/",
            {
                "vivienda": self.vivienda.id_vivienda,
                "asesor": self.asesor.id_asesor,
                "id_contrato": "TIZARA-abc123-001",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = ViviendaVentasExpedienteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["vivienda_denominacion"], "Casa 1")
        self.assertEqual(response.data["asesor_nombre"], "Asesor 1")

    def test_filtro_expediente_por_vivienda(self):
        otra_vivienda = ViviendaListado.objects.create(
            proyecto=self.proyecto, denominacion="Casa 2", created_by="u001", updated_by="u001"
        )
        ViviendaVentasExpediente.objects.create(
            vivienda=self.vivienda, asesor=self.asesor, id_contrato="c1", created_by="u001", updated_by="u001"
        )
        ViviendaVentasExpediente.objects.create(
            vivienda=otra_vivienda, asesor=self.asesor, id_contrato="c2", created_by="u001", updated_by="u001"
        )
        request = self.factory.get("/api/expedientes/", {"vivienda": self.vivienda.id_vivienda})
        request.effective_scope = EffectiveScope(is_global=True)
        view = ViviendaVentasExpedienteViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_contrato"], "c1")

    def test_crear_cliente_de_expediente_requiere_permiso(self):
        expediente = ViviendaVentasExpediente.objects.create(
            vivienda=self.vivienda, asesor=self.asesor, id_contrato="c1", created_by="u001", updated_by="u001"
        )
        request = self.factory.post(
            "/api/expedientes-clientes/",
            {"expediente": expediente.id_expediente, "id_contraparte": "cp001", "tipo": "ACREDITADO"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = ViviendaRelExpedienteClienteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(
            "/api/expedientes-clientes/",
            {
                "expediente": expediente.id_expediente,
                "id_contraparte": "cp001",
                "tipo": "ACREDITADO",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request2.effective_scope = self.scope_crear
        # Mock de requests.get (02/Sep/2026, hallazgo real: sin esto,
        # create() llama de verdad a tesoreria-service para resolver
        # id_contraparte - ver _resolver_contraparte_en_tesoreria en
        # views.py. El test "pasaba" solo por casualidad cuando
        # tesoreria-service estaba caido (camino fail-open); con el
        # corriendo (ej. en un entorno de dev con docker compose up) la
        # llamada real regresaba 404 para el id ficticio "cp001" y el test
        # fallaba - mismo hallazgo ya documentado en
        # pld-service/pld/tests.py::CumplimientoDePermisosEnEscrituraTests.
        with patch(
            "vivienda.views.requests.get",
            return_value=Mock(status_code=200, json=lambda: {"id_contraparte": "cp001"}),
        ):
            response2 = view(request2)
        self.assertEqual(response2.status_code, 201)

    def test_id_contraparte_fusionado_guarda_el_id_vigente(self):
        # 02/Sep/2026: si la contraparte elegida en el frontend se fusiono
        # con otra en tesoreria-service (ver TesoreriaContraparteViewSet.
        # retrieve/_fusionar_en), el GET regresa 200 con un id_contraparte
        # DISTINTO al que se pidio (el sobreviviente) - ahi es donde se
        # debe guardar el id vigente, no el alias viejo.
        expediente = ViviendaVentasExpediente.objects.create(
            vivienda=self.vivienda, asesor=self.asesor, id_contrato="c3", created_by="u001", updated_by="u001"
        )
        request = self.factory.post(
            "/api/expedientes-clientes/",
            {
                "expediente": expediente.id_expediente,
                "id_contraparte": "cpalias1",
                "tipo": "ACREDITADO",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = ViviendaRelExpedienteClienteViewSet.as_view({"post": "create"})
        with patch(
            "vivienda.views.requests.get",
            return_value=Mock(status_code=200, json=lambda: {"id_contraparte": "cpsobrv1"}),
        ):
            response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id_contraparte"], "cpsobrv1")

    def test_filtro_items_por_expediente(self):
        expediente = ViviendaVentasExpediente.objects.create(
            vivienda=self.vivienda, asesor=self.asesor, id_contrato="c1", created_by="u001", updated_by="u001"
        )
        otro_expediente = ViviendaVentasExpediente.objects.create(
            vivienda=self.vivienda, asesor=self.asesor, id_contrato="c2", created_by="u001", updated_by="u001"
        )
        ViviendaVentasExpedienteItem.objects.create(
            expediente=expediente,
            denominacion="INE",
            fecha_limite="2026-12-31",
            created_by="u001",
            updated_by="u001",
        )
        ViviendaVentasExpedienteItem.objects.create(
            expediente=otro_expediente,
            denominacion="RFC",
            fecha_limite="2026-12-31",
            created_by="u001",
            updated_by="u001",
        )
        request = self.factory.get("/api/expedientes-items/", {"expediente": expediente.id_expediente})
        request.effective_scope = EffectiveScope(is_global=True)
        view = ViviendaVentasExpedienteItemViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["denominacion"], "INE")
