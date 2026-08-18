"""Pruebas del gate especial de BitacoraAuditoria: solo GLOBAL o rol
AUDITOR la ven (decision de sesion 2026-08-10, ver memoria
"empresas-alcance-fase1") - a diferencia del resto, esto NO usa
ScopedManager (la bitacora no tiene columna de sociedad/proyecto por
diseno, es un log cross-empresa), usa EffectiveScope.role_keys.
"""

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from .models import BitacoraAuditoria
from .views import BitacoraAuditoriaViewSet


def _with_scope(request, scope):
    request.effective_scope = scope
    return request


class BitacoraAuditoriaScopeTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        BitacoraAuditoria.objects.create(
            servicio_origen="iam-service",
            actor_user_id="usr00001",
            accion="iam_users.create",
            entidad="iam_users",
            entidad_id="usr00001",
            ocurrido_en=timezone.now(),
        )

    def _listar(self, scope):
        request = _with_scope(self.factory.get("/api/bitacora/"), scope)
        view = BitacoraAuditoriaViewSet.as_view({"get": "list"})
        return view(request)

    def test_global_ve_la_bitacora(self):
        response = self._listar(EffectiveScope(is_global=True))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_rol_auditor_ve_la_bitacora_aunque_no_sea_global(self):
        scope = EffectiveScope(is_global=False, sociedad_rfcs=("#####1",), role_keys=("AUDITOR",))
        response = self._listar(scope)
        self.assertEqual(len(response.data), 1)

    def test_otro_rol_no_global_no_ve_la_bitacora(self):
        """Ej. un PLD_ANALISTA con alcance de sociedad no deberia poder leer
        el log de auditoria completo solo por tener alcance de datos."""
        scope = EffectiveScope(is_global=False, sociedad_rfcs=("#####1",), role_keys=("PLD_ANALISTA",))
        response = self._listar(scope)
        self.assertEqual(len(response.data), 0)

    def test_anonimo_no_ve_nada(self):
        response = self._listar(EffectiveScope.anonymous())
        self.assertEqual(len(response.data), 0)


class FiltroClienteTests(TestCase):
    """?search= tambien busca por id_contraparte/nombre_completo (18/Ago/2026,
    auditoria especifica del Motor Documental dentro de PLD: un solo
    buscador, no un buscador de texto + un filtro de cliente separado) -
    dentro del JSON valores_nuevos/valores_previos, no por el tipo de
    entidad. Lo que de verdad necesita un auditor es reconstruir el
    historial de un cliente especifico, no filtrar por "Expediente KYC" vs
    "Documento KYC"."""

    def setUp(self):
        self.factory = APIRequestFactory()
        BitacoraAuditoria.objects.create(
            servicio_origen="pld-service",
            actor_user_id="usr00001",
            accion="pld_contrapartes_kyc.aprobar",
            entidad="pld_contrapartes_kyc",
            entidad_id="ba9fa64b",
            valores_nuevos={"id_contraparte": "cp000200", "nombre_completo": "Juan Perez Lopez"},
            ocurrido_en=timezone.now(),
        )
        BitacoraAuditoria.objects.create(
            servicio_origen="iam-service",
            actor_user_id="usr00002",
            accion="iam_users.create",
            entidad="iam_users",
            entidad_id="usr00003",
            valores_nuevos={"email": "otro@cumbresbi.mx"},
            ocurrido_en=timezone.now(),
        )

    def _listar(self, search):
        request = self.factory.get("/api/bitacora/", {"search": search})
        request.effective_scope = EffectiveScope(is_global=True)
        view = BitacoraAuditoriaViewSet.as_view({"get": "list"})
        return view(request)

    def test_encuentra_por_id_contraparte(self):
        response = self._listar("cp000200")
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["accion"], "pld_contrapartes_kyc.aprobar")

    def test_encuentra_por_nombre_completo_parcial(self):
        response = self._listar("Perez")
        self.assertEqual(len(response.data), 1)

    def test_no_mezcla_eventos_de_otro_cliente(self):
        response = self._listar("cp000200")
        acciones = {row["accion"] for row in response.data}
        self.assertNotIn("iam_users.create", acciones)

    def test_sin_coincidencia_regresa_vacio(self):
        response = self._listar("no-existe-este-cliente")
        self.assertEqual(len(response.data), 0)

    def test_sigue_encontrando_por_accion_como_antes(self):
        """El buscador unificado no debe perder lo que ya hacia el
        SearchFilter generico que reemplazo (accion/entidad/entidad_id)."""
        response = self._listar("iam_users.create")
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["accion"], "iam_users.create")
