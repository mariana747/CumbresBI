"""Pruebas de aislamiento por scope (RLS) - primeras del servicio
(01/Sep/2026, ver memoria de sesion "auditoria-scope-rls-por-servicio").
No hay views.py/serializers.py todavia (API sin construir), asi que se
prueba directo contra el manager (Modelo.objects.for_scope(scope)), no via
requests HTTP como en tesoreria-service/tests.py - ese patron aplica cuando
ya existe un ViewSet real que lo consuma."""

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .models import RrhhEmpleado, RrhhPuesto
from .views import RrhhEmpleadoViewSet, RrhhPuestoViewSet


class ScopeRLSTests(TestCase):
    def setUp(self):
        self.ana = RrhhEmpleado.objects.create(id_empleado="emp1", nombres="Ana")
        self.beto = RrhhEmpleado.objects.create(id_empleado="emp2", nombres="Beto")
        RrhhPuesto.objects.create(id_puesto="p1", empleado=self.ana, sociedad="RFC_TIZARA", proyecto="A1")
        RrhhPuesto.objects.create(id_puesto="p2", empleado=self.beto, sociedad="RFC_CAPITAL", proyecto="B1")

    def test_puesto_se_filtra_por_sociedad(self):
        scope = EffectiveScope(is_global=False, sociedad_rfcs=("RFC_TIZARA",))
        resultado = RrhhPuesto.objects.for_scope(scope)
        self.assertEqual(list(resultado.values_list("id_puesto", flat=True)), ["p1"])

    def test_puesto_se_filtra_por_proyecto(self):
        scope = EffectiveScope(is_global=False, proyecto_ids=("B1",))
        resultado = RrhhPuesto.objects.for_scope(scope)
        self.assertEqual(list(resultado.values_list("id_puesto", flat=True)), ["p2"])

    def test_empleado_se_filtra_via_sociedad_del_puesto(self):
        # RrhhEmpleado no tiene columna de sociedad propia - el filtro pasa
        # por la relacion inversa puestos__sociedad (ver SCOPE_FIELD_SOCIEDAD
        # en models.py).
        scope = EffectiveScope(is_global=False, sociedad_rfcs=("RFC_CAPITAL",))
        resultado = RrhhEmpleado.objects.for_scope(scope)
        self.assertEqual(list(resultado.values_list("id_empleado", flat=True)), ["emp2"])

    def test_scope_global_ve_todo(self):
        scope = EffectiveScope(is_global=True)
        self.assertEqual(RrhhPuesto.objects.for_scope(scope).count(), 2)
        self.assertEqual(RrhhEmpleado.objects.for_scope(scope).count(), 2)

    def test_dimension_no_declarada_por_el_scope_no_ve_nada(self):
        # fail-closed (ver ScopedQuerySet.for_scope): un scope sin
        # sociedad_rfcs/proyecto_ids (las unicas dimensiones que estos
        # modelos declaran) no ve nada, aunque tenga otras dimensiones con
        # valor (centro_ids, aqui no aplica a rrhh).
        scope = EffectiveScope(is_global=False, centro_ids=("OBRA",))
        self.assertEqual(RrhhPuesto.objects.for_scope(scope).count(), 0)
        self.assertEqual(RrhhEmpleado.objects.for_scope(scope).count(), 0)


class RrhhEmpleadoViewSetTests(TestCase):
    """Primer ViewSet real de este servicio (10/Sep/2026, Fase 2 del modulo
    de Nominas) - mismo patron de pruebas HTTP que
    TesoreriaContratoTests en tesoreria-service."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("rrhh.crear",))

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post("/api/empleados/", {"nombres": "Ana"}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = RrhhEmpleadoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_id_empleado_se_genera_solo(self):
        request = self.factory.post("/api/empleados/", {"nombres": "Ana", "apellido_paterno": "Lopez"}, format="json")
        request.effective_scope = self.scope_crear
        view = RrhhEmpleadoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["id_empleado"])

    def test_incluye_nombre_completo(self):
        request = self.factory.post(
            "/api/empleados/",
            {"nombres": "Ana", "apellido_paterno": "Lopez", "apellido_materno": "Ruiz"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        response = RrhhEmpleadoViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.data["nombre_completo"], "Ana Lopez Ruiz")

    def test_usuario_de_una_sociedad_no_ve_empleados_de_otra(self):
        ana = RrhhEmpleado.objects.create(id_empleado="empA", nombres="Ana")
        beto = RrhhEmpleado.objects.create(id_empleado="empB", nombres="Beto")
        RrhhPuesto.objects.create(id_puesto="pA", empleado=ana, sociedad="RFC_TIZARA")
        RrhhPuesto.objects.create(id_puesto="pB", empleado=beto, sociedad="RFC_CAPITAL")

        request = self.factory.get("/api/empleados/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=("RFC_TIZARA",))
        view = RrhhEmpleadoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_empleado"], "empA")

    def test_empleado_con_dos_puestos_de_la_misma_sociedad_no_sale_duplicado(self):
        # .distinct() en get_queryset() (ver views.py) - un empleado con mas
        # de un Puesto que matchea el mismo scope no debe salir 2 veces.
        ana = RrhhEmpleado.objects.create(id_empleado="empA", nombres="Ana")
        RrhhPuesto.objects.create(id_puesto="pA1", empleado=ana, sociedad="RFC_TIZARA")
        RrhhPuesto.objects.create(id_puesto="pA2", empleado=ana, sociedad="RFC_TIZARA")

        request = self.factory.get("/api/empleados/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=("RFC_TIZARA",))
        view = RrhhEmpleadoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)


class RrhhPuestoViewSetTests(TestCase):
    """Historial de sueldo via dar_de_baja + alta de un Puesto nuevo, en vez
    de editar salario_diario en el mismo renglon (09/Sep/2026, notas de
    Jenny)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("rrhh.crear", "rrhh.editar"))
        self.empleado = RrhhEmpleado.objects.create(id_empleado="emp1", nombres="Ana")

    def _crear_puesto(self, salario="500.00"):
        request = self.factory.post(
            "/api/puestos/",
            {"empleado": self.empleado.id_empleado, "sociedad": "RFC_TIZARA", "salario_diario": salario},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = RrhhPuestoViewSet.as_view({"post": "create"})
        return view(request)

    def test_id_puesto_se_genera_solo(self):
        response = self._crear_puesto()
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["id_puesto"])

    def test_dar_de_baja_pone_fecha_baja(self):
        creado = self._crear_puesto()
        request = self.factory.post(f"/api/puestos/{creado.data['id_puesto']}/dar_de_baja/", {}, format="json")
        request.effective_scope = self.scope_crear
        view = RrhhPuestoViewSet.as_view({"post": "dar_de_baja"})
        response = view(request, pk=creado.data["id_puesto"])
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["fecha_baja"])

    def test_historial_de_sueldo_via_dos_puestos_del_mismo_empleado(self):
        # El "historial" es simplemente: dar de baja el puesto vigente y
        # crear uno nuevo con el sueldo actualizado - ambos quedan en la
        # tabla, nada se sobreescribe.
        primero = self._crear_puesto(salario="500.00")
        request = self.factory.post(f"/api/puestos/{primero.data['id_puesto']}/dar_de_baja/", {}, format="json")
        request.effective_scope = self.scope_crear
        RrhhPuestoViewSet.as_view({"post": "dar_de_baja"})(request, pk=primero.data["id_puesto"])

        segundo = self._crear_puesto(salario="600.00")

        request = self.factory.get(f"/api/puestos/?empleado={self.empleado.id_empleado}")
        request.effective_scope = EffectiveScope(is_global=True)
        response = RrhhPuestoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 2)
        self.assertIsNotNone(next(p for p in response.data if p["id_puesto"] == primero.data["id_puesto"])["fecha_baja"])
        self.assertIsNone(next(p for p in response.data if p["id_puesto"] == segundo.data["id_puesto"])["fecha_baja"])
