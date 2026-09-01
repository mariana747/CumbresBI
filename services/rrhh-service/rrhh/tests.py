"""Pruebas de aislamiento por scope (RLS) - primeras del servicio
(01/Sep/2026, ver memoria de sesion "auditoria-scope-rls-por-servicio").
No hay views.py/serializers.py todavia (API sin construir), asi que se
prueba directo contra el manager (Modelo.objects.for_scope(scope)), no via
requests HTTP como en tesoreria-service/tests.py - ese patron aplica cuando
ya existe un ViewSet real que lo consuma."""

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase

from .models import RrhhEmpleado, RrhhPuesto


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
