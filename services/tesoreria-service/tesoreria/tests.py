"""Primera suite del servicio (18/Ago/2026, arranque formal de Fase 4:
docs/architecture/README.md sec. 11.2 #7/#9 - Contrapartes y Facturacion
CFDI fusionadas de forma definitiva dentro de tesoreria-service, no
microservicios propios). CRUD real de Contrapartes/Bancos/Cuentas - los
tres catalogos sin dependencia de Contrato/Flujo/Factura, primer corte
del modulo (Contratos/Flujos/Facturas quedan para despues).

Sin ScopedManager a proposito - ninguno de estos 3 modelos tiene columna
de sociedad en el ERD real (son catalogos compartidos entre sociedades,
mismo criterio que GeneralSociedad en iam-service); el filtro real es por
permiso (tesoreria.crear/.editar), no por alcance de fila."""

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import requests
from cumbresbi_scope.scope import EffectiveScope
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory

from .models import (
    FacturaConcepto,
    FacturaDoctoRelacionado,
    FacturaNotaCredito,
    FacturaTraslado,
    TesoreriaBanco,
    TesoreriaComplementoPago,
    TesoreriaContraparte,
    TesoreriaContraparteRelacion,
    TesoreriaContrato,
    TesoreriaCorteEdc,
    TesoreriaCuenta,
    TesoreriaDiaFestivo,
    TesoreriaFactura,
    TesoreriaFlujo,
    TesoreriaMovimientoBancario,
    TesoreriaNomina,
    TesoreriaNotaCredito,
    TesoreriaContratoDocumento,
    TesoreriaTicketProveedor,
    TesoreriaTicketReembolso,
    TesoreriaRecNomina,
    TesoreriaSaldo,
    contrato_generico_nomina,
    contrato_generico_reembolso,
)
from . import mail_utils
from .reembolso_utils import ultimos_dos_dias_habiles, validar_fecha_limite
from .reportes import calcular_reporte_diario
from .ticket_utils import generate_token
from .views import (
    FacturaConceptoViewSet,
    FacturaDoctoRelacionadoViewSet,
    FacturaNotaCreditoViewSet,
    FacturaTrasladoViewSet,
    TesoreriaBancoViewSet,
    TesoreriaComplementoPagoViewSet,
    TesoreriaContraparteRelacionViewSet,
    TesoreriaContraparteViewSet,
    TesoreriaContratoViewSet,
    TesoreriaCorteEdcViewSet,
    TesoreriaCuentaViewSet,
    TesoreriaFacturaViewSet,
    TesoreriaFlujoViewSet,
    TesoreriaMovimientoBancarioViewSet,
    TesoreriaNominaViewSet,
    TesoreriaNotaCreditoViewSet,
    TesoreriaContratoDocumentoViewSet,
    TesoreriaRecNominaViewSet,
    TesoreriaSaldoViewSet,
    TesoreriaSolicitudPagoViewSet,
    TesoreriaTicketProveedorViewSet,
    TesoreriaTicketReembolsoViewSet,
)

RFC_TIZARA = "#####1"
RFC_CAPITAL = "#####2"


class TesoreriaContraparteCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Contraparte de prueba",
            rfc="CPR900101ABC",
            tipo_persona=TesoreriaContraparte.TIPO_MORAL,
            email="contacto@prueba.com",
        )

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/contrapartes/",
            {"razon_social": "Nueva", "tipo_persona": "fisica", "email": "nueva@prueba.com"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TesoreriaContraparteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_tesoreria_crear(self):
        request = self.factory.post(
            "/api/contrapartes/",
            {"razon_social": "Nueva", "tipo_persona": "fisica", "email": "nueva@prueba.com"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaContraparteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(TesoreriaContraparte.objects.filter(razon_social="Nueva").exists())

    def test_editar_requiere_tesoreria_editar(self):
        request = self.factory.patch(
            f"/api/contrapartes/{self.contraparte.id_contraparte}/", {"razon_social": "Editada"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaContraparteViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=self.contraparte.id_contraparte)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.patch(
            f"/api/contrapartes/{self.contraparte.id_contraparte}/", {"razon_social": "Editada"}, format="json"
        )
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))
        response2 = view(request2, pk=self.contraparte.id_contraparte)
        self.assertEqual(response2.status_code, 200)
        # En mayusculas (08/Sep/2026, "quiero que todo se mantenga en
        # mayusculas para estar estandarizado") - ver
        # TesoreriaContraparteSerializer.CAMPOS_MAYUSCULAS.
        self.assertEqual(response2.data["razon_social"], "EDITADA")

    def test_lectura_sigue_sin_permiso_especial(self):
        """Ver el catalogo sigue abierto (igual que GeneralSociedad en
        iam-service) - el gate es solo sobre escritura."""
        request = self.factory.get("/api/contrapartes/")
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaContraparteViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_busqueda_por_razon_social_o_rfc(self):
        TesoreriaContraparte.objects.create(
            razon_social="Otra empresa", rfc="OTR900101XYZ", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="a@a.com"
        )
        request = self.factory.get("/api/contrapartes/", {"search": "CPR900101ABC"})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaContraparteViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["razon_social"], "Contraparte de prueba")


class TesoreriaBancoCuentaCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")

    def test_crear_banco_requiere_permiso(self):
        request = self.factory.post("/api/bancos/", {"id_banxico": "00012", "banco": "Banorte"}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TesoreriaBancoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post("/api/bancos/", {"id_banxico": "00012", "banco": "Banorte"}, format="json")
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        response2 = view(request2)
        self.assertEqual(response2.status_code, 201)

    def test_crear_cuenta_referencia_banco_existente(self):
        request = self.factory.post(
            "/api/cuentas/",
            {"banco": self.banco.id_banxico, "clabe": "002180000000000001", "alias": "Cuenta operativa", "apertura": "2026-01-01"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaCuentaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["banco_nombre"], "Banamex")

    def test_listar_cuentas_sin_permiso_especial(self):
        TesoreriaCuenta.objects.create(banco=self.banco, clabe="002180000000000001", alias="Cuenta A", apertura="2026-01-01")
        request = self.factory.get("/api/cuentas/")
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaCuentaViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)


class TesoreriaContratoTests(TestCase):
    """Contrato (18/Ago/2026, tercer corte) - primer recurso de
    tesoreria-service con alcance real por sociedad (ScopedManager). A
    diferencia de Contraparte/Banco/Cuenta (catalogos compartidos, lectura
    abierta), aqui SI hay filtro fino por sociedad - demuestra que un
    usuario de una sociedad NO ve los contratos de otra (mismo criterio que
    PldContraparteKycScopeTests en pld-service)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Contraparte de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))

    def _crear_contrato(self, sociedad, scope=None, centro=None):
        body = {"sociedad": sociedad, "contraparte": self.contraparte.id_contraparte, "tipo": "INTERNO"}
        if centro:
            body["centro"] = centro
        request = self.factory.post("/api/contratos/", body, format="json")
        request.effective_scope = scope or self.scope_crear
        view = TesoreriaContratoViewSet.as_view({"post": "create"})
        return view(request)

    def test_crear_sin_permiso_da_403(self):
        response = self._crear_contrato(RFC_TIZARA, scope=EffectiveScope(is_global=True, perm_keys=()))
        self.assertEqual(response.status_code, 403)

    def test_id_contrato_se_genera_con_formato_sociedad_contraparte_consecutivo(self):
        response = self._crear_contrato(RFC_TIZARA)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id_contrato"], f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-001")

        # Segundo contrato para la misma sociedad+contraparte -> consecutivo 002.
        response2 = self._crear_contrato(RFC_TIZARA)
        self.assertEqual(response2.data["id_contrato"], f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-002")

    def test_categoria_es_opcional_y_se_guarda(self):
        # 07/Sep/2026 - categoria distingue la naturaleza del gasto/relacion
        # (formal/recurrente, gasto suelto, reembolso, compra), opcional a
        # proposito (contratos viejos se quedan sin categoria, sin backfill).
        request = self.factory.post(
            "/api/contratos/",
            {
                "sociedad": RFC_TIZARA,
                "contraparte": self.contraparte.id_contraparte,
                "categoria": "GASTO_SUELTO",
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        response = TesoreriaContratoViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["categoria"], "GASTO_SUELTO")

    def test_categoria_default_es_null_si_no_se_manda(self):
        response = self._crear_contrato(RFC_TIZARA)
        self.assertIsNone(response.data["categoria"])

    def test_consecutivo_es_independiente_por_sociedad(self):
        self._crear_contrato(RFC_TIZARA)
        response = self._crear_contrato(RFC_CAPITAL)
        self.assertEqual(response.data["id_contrato"], f"{RFC_CAPITAL}-{self.contraparte.id_contraparte}-001")

    def test_usuario_de_una_sociedad_no_ve_contratos_de_otra(self):
        self._crear_contrato(RFC_TIZARA)
        self._crear_contrato(RFC_CAPITAL)

        request = self.factory.get("/api/contratos/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        view = TesoreriaContratoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["sociedad"], RFC_TIZARA)

    def test_global_ve_ambos_contratos(self):
        self._crear_contrato(RFC_TIZARA)
        self._crear_contrato(RFC_CAPITAL)

        request = self.factory.get("/api/contratos/")
        request.effective_scope = EffectiveScope(is_global=True)
        view = TesoreriaContratoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 2)

    def test_anonimo_no_ve_nada(self):
        self._crear_contrato(RFC_TIZARA)
        request = self.factory.get("/api/contratos/")
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaContratoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 0)

    def test_incluye_nombre_de_la_contraparte(self):
        response = self._crear_contrato(RFC_TIZARA)
        self.assertEqual(response.data["contraparte_nombre"], "Contraparte de prueba")

    def test_contrato_generico_reembolso_por_sociedad(self):
        # 10/Sep/2026, "Contratos REEMB por sociedad" - para dar de alta un
        # Flujo de reembolso directo en Flujos, sin partir de un ticket.
        request = self.factory.get("/api/contratos/contrato_generico_reembolso/", {"sociedad": RFC_TIZARA})
        request.effective_scope = EffectiveScope(is_global=True)
        view = TesoreriaContratoViewSet.as_view({"get": "contrato_generico_reembolso"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id_contrato"], f"GEN-REEMBOLSOS-{RFC_TIZARA}")

    def test_contrato_generico_reembolso_sin_sociedad_da_400(self):
        request = self.factory.get("/api/contratos/contrato_generico_reembolso/")
        request.effective_scope = EffectiveScope(is_global=True)
        view = TesoreriaContratoViewSet.as_view({"get": "contrato_generico_reembolso"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_usuario_con_acceso_solo_a_un_centro_ve_solo_esos_contratos(self):
        # 31/Ago/2026: SCOPE_FIELD_CENTRO recien declarado - el claim
        # centro_ids ya existia en el JWT (IamUserCentroAccess) pero
        # ningun modelo lo consumia todavia.
        self._crear_contrato(RFC_TIZARA, centro="OBRA")
        self._crear_contrato(RFC_TIZARA, centro="VENTAS")

        request = self.factory.get("/api/contratos/")
        request.effective_scope = EffectiveScope(is_global=False, centro_ids=("OBRA",))
        view = TesoreriaContratoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["centro"], "OBRA")

    def test_usuario_con_acceso_solo_a_un_contrato_ve_solo_ese_contrato(self):
        # 31/Ago/2026: SCOPE_FIELD_CONTRATO recien declarado - mismo
        # criterio que centro_ids, via IamUserContratoAccess.
        creado1 = self._crear_contrato(RFC_TIZARA)
        self._crear_contrato(RFC_TIZARA)

        request = self.factory.get("/api/contratos/")
        request.effective_scope = EffectiveScope(is_global=False, contrato_ids=(creado1.data["id_contrato"],))
        view = TesoreriaContratoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_contrato"], creado1.data["id_contrato"])


class TesoreriaNominaTests(TestCase):
    """Periodo/agrupador de nomina (10/Sep/2026, modulo de Nominas Fase 1) -
    mismo patron de scope por sociedad/centro que TesoreriaContratoTests, mas
    la resolucion del contrato generico por sociedad (contrato_generico_nomina)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))

    def _crear_nomina(self, sociedad, scope=None, centro=None, tipo="QUINCENAL"):
        body = {"tipo": tipo, "sociedad": sociedad, "serie": "Q1 2026"}
        if centro:
            body["centro"] = centro
        request = self.factory.post("/api/nominas/", body, format="json")
        request.effective_scope = scope or self.scope_crear
        view = TesoreriaNominaViewSet.as_view({"post": "create"})
        return view(request)

    def test_crear_sin_permiso_da_403(self):
        response = self._crear_nomina(RFC_TIZARA, scope=EffectiveScope(is_global=True, perm_keys=()))
        self.assertEqual(response.status_code, 403)

    def test_id_nomina_se_genera_con_consecutivo_global(self):
        response = self._crear_nomina(RFC_TIZARA)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id_nomina"], "NOM-000001")

        response2 = self._crear_nomina(RFC_CAPITAL)
        self.assertEqual(response2.data["id_nomina"], "NOM-000002")

    def test_usuario_de_una_sociedad_no_ve_nominas_de_otra(self):
        self._crear_nomina(RFC_TIZARA)
        self._crear_nomina(RFC_CAPITAL)

        request = self.factory.get("/api/nominas/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        view = TesoreriaNominaViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["sociedad"], RFC_TIZARA)

    def test_status_default_es_activo(self):
        response = self._crear_nomina(RFC_TIZARA)
        self.assertEqual(response.data["status"], "ACTIVO")


class ContratoGenericoNominaTests(TestCase):
    """contrato_generico_nomina (10/Sep/2026) - GEN-NOMINA-<sociedad>, uno
    por sociedad (a diferencia de GEN-REEMBOLSOS-001, que es unico total) -
    para que el filtro por empresa siga funcionando en Flujos de nomina."""

    def test_crea_un_contrato_generico_por_sociedad(self):
        contrato = contrato_generico_nomina(RFC_TIZARA)
        self.assertEqual(contrato.id_contrato, f"GEN-NOMINA-{RFC_TIZARA}")
        self.assertEqual(contrato.sociedad, RFC_TIZARA)
        self.assertFalse(contrato.requiere_factura)

    def test_es_idempotente_no_duplica(self):
        primero = contrato_generico_nomina(RFC_TIZARA)
        segundo = contrato_generico_nomina(RFC_TIZARA)
        self.assertEqual(primero.id_contrato, segundo.id_contrato)
        self.assertEqual(TesoreriaContrato.objects.filter(id_contrato=f"GEN-NOMINA-{RFC_TIZARA}").count(), 1)

    def test_genera_un_contrato_distinto_por_cada_sociedad(self):
        contrato1 = contrato_generico_nomina(RFC_TIZARA)
        contrato2 = contrato_generico_nomina(RFC_CAPITAL)
        self.assertNotEqual(contrato1.id_contrato, contrato2.id_contrato)


class ContratoGenericoReembolsoTests(TestCase):
    """contrato_generico_reembolso (10/Sep/2026, "Contratos REEMB por
    sociedad" - decision explicita: SI se separa) - GEN-REEMBOLSOS-<sociedad>,
    mismo patron que contrato_generico_nomina, reemplaza al viejo
    GEN-REEMBOLSOS-001 unico total."""

    def test_crea_un_contrato_generico_por_sociedad(self):
        contrato = contrato_generico_reembolso(RFC_TIZARA)
        self.assertEqual(contrato.id_contrato, f"GEN-REEMBOLSOS-{RFC_TIZARA}")
        self.assertEqual(contrato.sociedad, RFC_TIZARA)
        self.assertFalse(contrato.requiere_factura)

    def test_es_idempotente_no_duplica(self):
        primero = contrato_generico_reembolso(RFC_TIZARA)
        segundo = contrato_generico_reembolso(RFC_TIZARA)
        self.assertEqual(primero.id_contrato, segundo.id_contrato)
        self.assertEqual(TesoreriaContrato.objects.filter(id_contrato=f"GEN-REEMBOLSOS-{RFC_TIZARA}").count(), 1)

    def test_genera_un_contrato_distinto_por_cada_sociedad(self):
        contrato1 = contrato_generico_reembolso(RFC_TIZARA)
        contrato2 = contrato_generico_reembolso(RFC_CAPITAL)
        self.assertNotEqual(contrato1.id_contrato, contrato2.id_contrato)


class TesoreriaTicketReembolsoContratoGenericoTests(TestCase):
    """TesoreriaTicketReembolsoViewSet.contrato_generico (10/Sep/2026) -
    mismo patron que TesoreriaNominaViewSet.contrato_generico, para
    preseleccionar Contrato al dar de alta el Flujo del reembolso."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.leer",))

    def _contrato_generico(self, id_ticket):
        request = self.factory.get(f"/api/tickets-reembolso/{id_ticket}/contrato_generico/")
        request.effective_scope = self.scope
        return TesoreriaTicketReembolsoViewSet.as_view({"get": "contrato_generico"})(request, pk=id_ticket)

    def test_regresa_el_contrato_generico_por_sociedad(self):
        TesoreriaTicketReembolso.objects.create(
            id_ticket="TKT-REEMB-1", id_empleado="empleado1", sociedad=RFC_TIZARA, fecha_gasto=date.today()
        )
        response = self._contrato_generico("TKT-REEMB-1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id_contrato"], f"GEN-REEMBOLSOS-{RFC_TIZARA}")

    def test_sin_sociedad_da_400(self):
        TesoreriaTicketReembolso.objects.create(id_ticket="TKT-REEMB-2", id_empleado="empleado1", fecha_gasto=date.today())
        response = self._contrato_generico("TKT-REEMB-2")
        self.assertEqual(response.status_code, 400)


class TesoreriaFlujoTests(TestCase):
    """Flujo de caja (24/Ago/2026, Sem 21 del cronograma) - primer recurso
    de este servicio que ademas de CRUD tiene un ciclo de vida propio
    (aprobar/rechazar/registrar_pago), mismo criterio de segregacion de
    funciones que PldContraparteKycViewSet.aprobar en pld-service."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Constructora de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        self.banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000001", alias="Cuenta operativa", apertura="2026-01-01"
        )
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))
        # identity_user_id necesario (31/Ago/2026): aprobar() ya no lee
        # autorizado_por del body, lo resuelve del JWT via este campo.
        self.scope_aprobar = EffectiveScope(
            is_global=True, perm_keys=("tesoreria.aprobar",), identity_user_id="u001"
        )

    def _crear_flujo(self, scope=None):
        request = self.factory.post(
            "/api/flujos/",
            {"contrato": self.contrato.id_contrato, "cuenta": self.cuenta.id_cuenta_bancaria, "total_mxp": "85000.00"},
            format="json",
        )
        request.effective_scope = scope or self.scope_crear
        view = TesoreriaFlujoViewSet.as_view({"post": "create"})
        return view(request)

    def test_crear_sin_permiso_da_403(self):
        response = self._crear_flujo(scope=EffectiveScope(is_global=True, perm_keys=()))
        self.assertEqual(response.status_code, 403)

    def test_filtro_por_sociedad_via_contrato(self):
        # 09/Sep/2026, "agrega en flujos ... filtro por empresa"
        self._crear_flujo()
        otra_contraparte = TesoreriaContraparte.objects.create(
            razon_social="Otra constructora", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="otra@c.com"
        )
        otro_contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_CAPITAL}-{otra_contraparte.id_contraparte}-001",
            sociedad=RFC_CAPITAL,
            contraparte=otra_contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        request = self.factory.post(
            "/api/flujos/",
            {"contrato": otro_contrato.id_contrato, "cuenta": self.cuenta.id_cuenta_bancaria, "total_mxp": "500.00"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        TesoreriaFlujoViewSet.as_view({"post": "create"})(request)

        request2 = self.factory.get("/api/flujos/", {"sociedad": RFC_TIZARA})
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.leer",))
        response2 = TesoreriaFlujoViewSet.as_view({"get": "list"})(request2)
        self.assertEqual(len(response2.data), 1)
        self.assertEqual(response2.data[0]["contrato"], self.contrato.id_contrato)

    def test_id_flujo_se_genera_con_consecutivo(self):
        response = self._crear_flujo()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id_flujo"], "FLJ-000001")

        response2 = self._crear_flujo()
        self.assertEqual(response2.data["id_flujo"], "FLJ-000002")

    def test_usuario_de_una_sociedad_no_ve_flujos_de_otra(self):
        self._crear_flujo()

        request = self.factory.get("/api/flujos/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_CAPITAL,))
        view = TesoreriaFlujoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 0)

    def test_ver_comprobante_sin_drive_file_id_da_404(self):
        response = self._crear_flujo()
        flujo = TesoreriaFlujo.objects.get(pk=response.data["id_flujo"])
        request = self.factory.get(f"/api/flujos/{flujo.pk}/ver_comprobante/")
        request.effective_scope = self.scope_crear
        view = TesoreriaFlujoViewSet.as_view({"get": "ver_comprobante"})
        response = view(request, pk=flujo.pk)
        self.assertEqual(response.status_code, 404)

    def test_ver_comprobante_con_drive_file_id_transmite_el_archivo(self):
        response = self._crear_flujo()
        flujo = TesoreriaFlujo.objects.get(pk=response.data["id_flujo"])
        flujo.drive_file_id_comprobante = "drive-comprobante-1"
        flujo.save(update_fields=["drive_file_id_comprobante"])
        contenido_falso = MagicMock()
        contenido_falso.status_code = 200
        contenido_falso.headers = {"Content-Type": "application/pdf"}
        contenido_falso.iter_content = lambda chunk_size: iter([b"%PDF-comprobante"])
        with patch("tesoreria.views.requests.get", return_value=contenido_falso):
            request = self.factory.get(f"/api/flujos/{flujo.pk}/ver_comprobante/")
            request.effective_scope = self.scope_crear
            view = TesoreriaFlujoViewSet.as_view({"get": "ver_comprobante"})
            response = view(request, pk=flujo.pk)
        self.assertEqual(response.status_code, 200)

    def test_usuario_con_acceso_a_un_centro_ve_flujos_de_contratos_de_ese_centro(self):
        # 31/Ago/2026: SCOPE_FIELD_CENTRO recien declarado, via contrato__centro.
        contrato_obra = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-002",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
            centro="OBRA",
        )
        request_flujo = self.factory.post(
            "/api/flujos/",
            {"contrato": contrato_obra.id_contrato, "cuenta": self.cuenta.id_cuenta_bancaria, "total_mxp": "1000.00"},
            format="json",
        )
        request_flujo.effective_scope = self.scope_crear
        TesoreriaFlujoViewSet.as_view({"post": "create"})(request_flujo)
        self._crear_flujo()  # flujo del self.contrato, sin centro

        request = self.factory.get("/api/flujos/")
        request.effective_scope = EffectiveScope(is_global=False, centro_ids=("OBRA",))
        view = TesoreriaFlujoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["contrato"], contrato_obra.id_contrato)

    def test_usuario_con_acceso_a_un_contrato_ve_solo_sus_flujos(self):
        # 31/Ago/2026: SCOPE_FIELD_CONTRATO recien declarado.
        self._crear_flujo()

        request = self.factory.get("/api/flujos/")
        request.effective_scope = EffectiveScope(is_global=False, contrato_ids=(self.contrato.id_contrato,))
        view = TesoreriaFlujoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)

        request2 = self.factory.get("/api/flujos/")
        request2.effective_scope = EffectiveScope(is_global=False, contrato_ids=("otro-contrato-que-no-existe",))
        response2 = view(request2)
        self.assertEqual(len(response2.data), 0)

    def test_no_se_puede_pagar_sin_autorizar_primero(self):
        creado = self._crear_flujo()
        flujo_id = creado.data["id_flujo"]

        request = self.factory.post(f"/api/flujos/{flujo_id}/registrar_pago/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "registrar_pago"})
        response = view(request, pk=flujo_id)
        self.assertEqual(response.status_code, 400)

    def test_aprobar_requiere_permiso_distinto_a_editar(self):
        creado = self._crear_flujo()
        flujo_id = creado.data["id_flujo"]

        request = self.factory.post(f"/api/flujos/{flujo_id}/aprobar/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "aprobar"})
        response = view(request, pk=flujo_id)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(f"/api/flujos/{flujo_id}/aprobar/", {}, format="json")
        request2.effective_scope = self.scope_aprobar
        response2 = view(request2, pk=flujo_id)
        self.assertEqual(response2.status_code, 200)
        self.assertTrue(response2.data["autorizacion"])
        self.assertEqual(response2.data["validacion_estado"], TesoreriaFlujo.VALIDACION_APROBADA)
        # autorizado_por sale del JWT (identity_user_id), no de lo que
        # mande el body - aqui no se manda nada y aun asi queda "u001".
        self.assertEqual(response2.data["autorizado_por"], "u001")

    def test_ciclo_completo_aprobar_y_registrar_pago(self):
        creado = self._crear_flujo()
        flujo_id = creado.data["id_flujo"]

        aprobar_request = self.factory.post(f"/api/flujos/{flujo_id}/aprobar/", {}, format="json")
        aprobar_request.effective_scope = self.scope_aprobar
        aprobar_view = TesoreriaFlujoViewSet.as_view({"post": "aprobar"})
        aprobar_view(aprobar_request, pk=flujo_id)

        pago_request = self.factory.post(
            f"/api/flujos/{flujo_id}/registrar_pago/", {"descripcion_pago": "SPEI BBVA"}, format="json"
        )
        pago_request.effective_scope = self.scope_editar
        pago_view = TesoreriaFlujoViewSet.as_view({"post": "registrar_pago"})
        response = pago_view(pago_request, pk=flujo_id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["pagado"])
        self.assertEqual(response.data["descripcion_pago"], "SPEI BBVA")


class TesoreriaFlujoExportarCsvTests(TestCase):
    """exportar_csv de Flujos (09/Sep/2026, "replica el export en Flujos
    tambien") - mismo patron que TesoreriaFacturaExportarCsvTests."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Constructora de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        self.banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000001", alias="Cuenta operativa", apertura="2026-01-01"
        )
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.leer",))
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CSV-1", contrato=self.contrato, cuenta=self.cuenta, total_mxp="1000.00", pagado=True
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CSV-2", contrato=self.contrato, cuenta=self.cuenta, total_mxp="2000.00", pagado=False
        )

    def _exportar(self, **params):
        request = self.factory.get("/api/flujos/exportar_csv/", params)
        request.effective_scope = self.scope
        view = TesoreriaFlujoViewSet.as_view({"get": "exportar_csv"})
        return view(request)

    def test_exporta_todos_sin_filtros(self):
        response = self._exportar()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        contenido = response.content.decode("utf-8")
        self.assertIn("FLJ-CSV-1", contenido)
        self.assertIn("FLJ-CSV-2", contenido)

    def test_respeta_filtro_de_contrato(self):
        otro_contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-002",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        TesoreriaFlujo.objects.create(id_flujo="FLJ-CSV-3", contrato=otro_contrato, cuenta=self.cuenta, total_mxp="300.00")

        response = self._exportar(contrato=self.contrato.id_contrato)
        contenido = response.content.decode("utf-8")
        self.assertIn("FLJ-CSV-1", contenido)
        self.assertNotIn("FLJ-CSV-3", contenido)


class TesoreriaConciliacionCfdiTests(TestCase):
    """Conciliacion de Facturas (10/Sep/2026, notas de reunion) - clasificacion
    CON_CFDI/SIN_CFDI/NO_REQUIERE_CFDI + reconocido/por_reconocer. Base de las
    3 pantallas, sin UI todavia (Fase 4)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.leer",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor conciliacion", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        self.banco = TesoreriaBanco.objects.create(id_banxico="00003", banco="BBVA", alias="BBV")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000099", alias="Cuenta conciliacion", apertura="2026-01-01"
        )
        self.hoy = timezone.localdate()

    def _contrato(self, requiere_factura, sufijo):
        return TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-{sufijo}",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
            requiere_factura=requiere_factura,
        )

    def _conciliacion(self, **params):
        request = self.factory.get("/api/flujos/conciliacion/", params)
        request.effective_scope = self.scope
        return TesoreriaFlujoViewSet.as_view({"get": "conciliacion"})(request)

    def _conciliacion_csv(self, **params):
        request = self.factory.get("/api/flujos/conciliacion_csv/", params)
        request.effective_scope = self.scope
        return TesoreriaFlujoViewSet.as_view({"get": "conciliacion_csv"})(request)

    def test_no_requiere_factura(self):
        contrato = self._contrato(False, "001")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-1", contrato=contrato, cuenta=self.cuenta, total_mxp="500.00", fecha_efectiva=self.hoy
        )
        response = self._conciliacion()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["no_requiere"]), 1)
        self.assertEqual(len(response.data["con_cfdi"]), 0)
        self.assertEqual(len(response.data["sin_cfdi"]), 0)

    def test_requiere_factura_sin_ligar(self):
        contrato = self._contrato(True, "002")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-2", contrato=contrato, cuenta=self.cuenta, total_mxp="500.00", fecha_efectiva=self.hoy
        )
        response = self._conciliacion()
        self.assertEqual(len(response.data["sin_cfdi"]), 1)
        self.assertEqual(len(response.data["con_cfdi"]), 0)

    def test_con_cfdi_pue_reconocido_es_total_de_factura(self):
        contrato = self._contrato(True, "003")
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="11111111-1111-1111-1111-111111111111",
            comprobante_metodo_pago="PUE",
            comprobante_total=Decimal("1160.00"),
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-3",
            contrato=contrato,
            cuenta=self.cuenta,
            total_mxp="1160.00",
            fecha_efectiva=self.hoy,
            factura=factura,
        )
        response = self._conciliacion()
        self.assertEqual(len(response.data["con_cfdi"]), 1)
        fila = response.data["con_cfdi"][0]
        self.assertEqual(fila["reconocido"], Decimal("1160.00"))
        self.assertEqual(fila["por_reconocer"], Decimal("0.00"))

    def test_con_cfdi_trae_subtotal_iva_total_de_la_factura(self):
        # 11/Sep/2026, "columnas separadas importe/IVA/total en
        # conciliacion, para Cat" - solo hay dato cuando el flujo tiene
        # factura ligada (no complemento/nomina, ese esquema no desglosa IVA).
        contrato = self._contrato(True, "005")
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="33333333-3333-3333-3333-333333333333",
            comprobante_metodo_pago="PUE",
            comprobante_sub_total="1000.00",
            comprobante_iva="160.00",
            comprobante_total=Decimal("1160.00"),
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-5",
            contrato=contrato,
            cuenta=self.cuenta,
            total_mxp="1160.00",
            fecha_efectiva=self.hoy,
            factura=factura,
        )
        response = self._conciliacion()
        fila = response.data["con_cfdi"][0]
        self.assertEqual(fila["factura_subtotal"], "1000.00")
        self.assertEqual(fila["factura_iva"], Decimal("160.00"))
        self.assertEqual(fila["factura_total"], Decimal("1160.00"))

    def test_con_cfdi_ppd_reconocido_es_total_del_complemento(self):
        contrato = self._contrato(True, "004")
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="22222222-2222-2222-2222-222222222222",
            comprobante_metodo_pago="PPD",
            comprobante_total=Decimal("1160.00"),
        )
        complemento = TesoreriaComplementoPago.objects.create(
            timbre_uuid="33333333-3333-3333-3333-333333333333", total=Decimal("580.00")
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-4",
            contrato=contrato,
            cuenta=self.cuenta,
            total_mxp="580.00",
            fecha_efectiva=self.hoy,
            factura=factura,
            complemento=complemento,
        )
        response = self._conciliacion()
        fila = response.data["con_cfdi"][0]
        self.assertEqual(fila["reconocido"], Decimal("580.00"))
        self.assertEqual(fila["por_reconocer"], Decimal("0.00"))

    def test_filtro_mes_excluye_fuera_de_rango(self):
        contrato = self._contrato(True, "005")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-5",
            contrato=contrato,
            cuenta=self.cuenta,
            total_mxp="100.00",
            fecha_efectiva=self.hoy.replace(year=self.hoy.year - 1),
        )
        response = self._conciliacion()
        self.assertEqual(len(response.data["sin_cfdi"]), 0)

    def test_filtro_requiere_factura(self):
        contrato_si = self._contrato(True, "006")
        contrato_no = self._contrato(False, "007")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-6", contrato=contrato_si, cuenta=self.cuenta, total_mxp="100.00", fecha_efectiva=self.hoy
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-7", contrato=contrato_no, cuenta=self.cuenta, total_mxp="100.00", fecha_efectiva=self.hoy
        )
        response = self._conciliacion(requiere_factura="true")
        ids = [f["id_flujo"] for f in response.data["sin_cfdi"]]
        self.assertIn("FLJ-CONC-6", ids)
        self.assertEqual(len(response.data["no_requiere"]), 0)

    def test_filtro_por_una_sola_fecha(self):
        contrato = self._contrato(True, "008")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-8", contrato=contrato, cuenta=self.cuenta, total_mxp="100.00", fecha_efectiva=self.hoy
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-9",
            contrato=contrato,
            cuenta=self.cuenta,
            total_mxp="100.00",
            fecha_efectiva=self.hoy - timedelta(days=1),
        )
        response = self._conciliacion(desde=self.hoy.isoformat(), hasta=self.hoy.isoformat())
        ids = [f["id_flujo"] for f in response.data["sin_cfdi"]]
        self.assertIn("FLJ-CONC-8", ids)
        self.assertNotIn("FLJ-CONC-9", ids)

    def test_filtro_por_rango_de_fechas(self):
        contrato = self._contrato(True, "009")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-10",
            contrato=contrato,
            cuenta=self.cuenta,
            total_mxp="100.00",
            fecha_efectiva=self.hoy.replace(month=1, day=1),
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-11",
            contrato=contrato,
            cuenta=self.cuenta,
            total_mxp="100.00",
            fecha_efectiva=self.hoy.replace(year=self.hoy.year - 1),
        )
        response = self._conciliacion(
            desde=self.hoy.replace(month=1, day=1).isoformat(), hasta=self.hoy.replace(month=12, day=31).isoformat()
        )
        ids = [f["id_flujo"] for f in response.data["sin_cfdi"]]
        self.assertIn("FLJ-CONC-10", ids)
        self.assertNotIn("FLJ-CONC-11", ids)

    def test_exportar_csv_incluye_las_3_clasificaciones(self):
        # 11/Sep/2026, "exportar CSV de Conciliacion" - pendiente real de
        # negocio, mismos filtros que conciliacion() pero en una descarga.
        self._contrato(False, "012")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-12",
            contrato=self._contrato(False, "013"),
            cuenta=self.cuenta,
            total_mxp="100.00",
            fecha_efectiva=self.hoy,
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-13",
            contrato=self._contrato(True, "014"),
            cuenta=self.cuenta,
            total_mxp="200.00",
            fecha_efectiva=self.hoy,
        )
        response = self._conciliacion_csv()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        contenido = response.content.decode("utf-8")
        self.assertIn("FLJ-CONC-12", contenido)
        self.assertIn("No requiere CFDI", contenido)
        self.assertIn("FLJ-CONC-13", contenido)
        self.assertIn("Sin CFDI", contenido)

    def test_exportar_csv_respeta_filtro_de_requiere_factura(self):
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-CONC-14",
            contrato=self._contrato(False, "015"),
            cuenta=self.cuenta,
            total_mxp="100.00",
            fecha_efectiva=self.hoy,
        )
        response = self._conciliacion_csv(requiere_factura="false")
        contenido = response.content.decode("utf-8")
        self.assertIn("FLJ-CONC-14", contenido)


class TesoreriaFlujoRecordatorioTests(TestCase):
    """Recordatorio manual de factura pendiente (10/Sep/2026, "Sin CFDI" en
    Conciliacion de Facturas) - nunca se dispara solo, solo via este boton."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor recordatorio", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="prov@ejemplo.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-REC",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        self.banco = TesoreriaBanco.objects.create(id_banxico="00004", banco="Santander", alias="STD")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000088", alias="Cuenta recordatorio", apertura="2026-01-01"
        )
        self.flujo = TesoreriaFlujo.objects.create(
            id_flujo="FLJ-REC-1", contrato=self.contrato, cuenta=self.cuenta, total_mxp="100.00", concepto="Renta"
        )

    def _recordatorio(self, id_flujo):
        request = self.factory.post(f"/api/flujos/{id_flujo}/recordatorio/")
        request.effective_scope = self.scope
        return TesoreriaFlujoViewSet.as_view({"post": "recordatorio"})(request, pk=id_flujo)

    @patch("tesoreria.views.enviar_correo_recordatorio_factura", return_value=True)
    def test_envia_recordatorio(self, mock_enviar):
        response = self._recordatorio(self.flujo.id_flujo)
        self.assertEqual(response.status_code, 200)
        mock_enviar.assert_called_once()
        self.assertEqual(mock_enviar.call_args.kwargs["email"], "prov@ejemplo.com")

    @patch("tesoreria.views.enviar_correo_recordatorio_factura", return_value=False)
    def test_mail_service_no_responde(self, mock_enviar):
        response = self._recordatorio(self.flujo.id_flujo)
        self.assertEqual(response.status_code, 502)

    def test_sin_email_de_contacto(self):
        self.contraparte.email = ""
        self.contraparte.save(update_fields=["email"])
        response = self._recordatorio(self.flujo.id_flujo)
        self.assertEqual(response.status_code, 400)


class TesoreriaSugerenciasCfdiTests(TestCase):
    """"La IA propone, el humano aprueba" (10/Sep/2026, Fase 5 de
    Conciliacion de Facturas) - candidatos por contraparte+monto, sin ligar
    nada solo."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.leer",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor sugerencias", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="s@s.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-SUG",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        self.banco = TesoreriaBanco.objects.create(id_banxico="00005", banco="Banorte", alias="BNT")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000077", alias="Cuenta sugerencias", apertura="2026-01-01"
        )
        self.flujo = TesoreriaFlujo.objects.create(
            id_flujo="FLJ-SUG-1", contrato=self.contrato, cuenta=self.cuenta, total_mxp="1000.00"
        )

    def _sugerencias(self, id_flujo):
        request = self.factory.get(f"/api/flujos/{id_flujo}/sugerencias_cfdi/")
        request.effective_scope = self.scope
        return TesoreriaFlujoViewSet.as_view({"get": "sugerencias_cfdi"})(request, pk=id_flujo)

    def test_propone_factura_por_monto_parecido(self):
        TesoreriaFactura.objects.create(
            timbre_uuid="44444444-4444-4444-4444-444444444444",
            contraparte=self.contraparte,
            comprobante_total=Decimal("1000.50"),
        )
        response = self._sugerencias(self.flujo.id_flujo)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["facturas"]), 1)
        self.assertEqual(response.data["facturas"][0]["timbre_uuid"], "44444444-4444-4444-4444-444444444444")

    def test_no_propone_factura_fuera_de_tolerancia(self):
        TesoreriaFactura.objects.create(
            timbre_uuid="55555555-5555-5555-5555-555555555555",
            contraparte=self.contraparte,
            comprobante_total=Decimal("5000.00"),
        )
        response = self._sugerencias(self.flujo.id_flujo)
        self.assertEqual(len(response.data["facturas"]), 0)

    def test_no_propone_factura_ya_ligada_a_otro_flujo(self):
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="66666666-6666-6666-6666-666666666666",
            contraparte=self.contraparte,
            comprobante_total=Decimal("1000.00"),
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-SUG-2", contrato=self.contrato, cuenta=self.cuenta, total_mxp="1000.00", factura=factura
        )
        response = self._sugerencias(self.flujo.id_flujo)
        self.assertEqual(len(response.data["facturas"]), 0)

    def test_no_propone_si_el_flujo_ya_tiene_factura(self):
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="77777777-7777-7777-7777-777777777777",
            contraparte=self.contraparte,
            comprobante_total=Decimal("1000.00"),
        )
        self.flujo.factura = factura
        self.flujo.save(update_fields=["factura"])
        otra_factura = TesoreriaFactura.objects.create(
            timbre_uuid="88888888-8888-8888-8888-888888888888",
            contraparte=self.contraparte,
            comprobante_total=Decimal("1000.00"),
        )
        response = self._sugerencias(self.flujo.id_flujo)
        self.assertEqual(len(response.data["facturas"]), 0)
        self.assertNotIn(otra_factura.timbre_uuid, [f["timbre_uuid"] for f in response.data["facturas"]])


class TesoreriaSugerenciasCfdiLoteTests(TestCase):
    """Aprobacion en lote (10/Sep/2026, "aprobar en lote, no uno por uno") -
    sugerencias_cfdi_lote solo propone, aprobar_lote es el unico que liga
    (siempre con la lista ya elegida/confirmada en pantalla)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.leer", "tesoreria.editar"))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor lote", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="l@l.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-LOTE",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
            requiere_factura=True,
        )
        self.banco = TesoreriaBanco.objects.create(id_banxico="00006", banco="Banregio", alias="BRG")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000066", alias="Cuenta lote", apertura="2026-01-01"
        )
        self.hoy = timezone.localdate()
        self.flujo = TesoreriaFlujo.objects.create(
            id_flujo="FLJ-LOTE-1",
            contrato=self.contrato,
            cuenta=self.cuenta,
            total_mxp="2000.00",
            fecha_efectiva=self.hoy,
        )
        self.factura = TesoreriaFactura.objects.create(
            timbre_uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            contraparte=self.contraparte,
            comprobante_folio="F-LOTE-1",
            comprobante_total=Decimal("2000.00"),
        )

    def _lote(self, **params):
        request = self.factory.get("/api/flujos/sugerencias_cfdi_lote/", params)
        request.effective_scope = self.scope
        return TesoreriaFlujoViewSet.as_view({"get": "sugerencias_cfdi_lote"})(request)

    def _aprobar(self, items):
        request = self.factory.post("/api/flujos/aprobar_lote/", {"items": items}, format="json")
        request.effective_scope = self.scope
        return TesoreriaFlujoViewSet.as_view({"post": "aprobar_lote"})(request)

    def test_propone_con_confianza_alta_monto_exacto_unico(self):
        response = self._lote()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_flujo"], "FLJ-LOTE-1")
        self.assertEqual(response.data[0]["confianza"], "alta")
        self.assertEqual(response.data[0]["timbre_uuid"], self.factura.timbre_uuid)

    def test_confianza_media_si_hay_mas_de_un_candidato(self):
        TesoreriaFactura.objects.create(
            timbre_uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            contraparte=self.contraparte,
            comprobante_folio="F-LOTE-2",
            comprobante_total=Decimal("2000.50"),
        )
        response = self._lote()
        self.assertEqual(response.data[0]["confianza"], "media")

    def test_aprobar_lote_liga_la_factura(self):
        response = self._aprobar([{"id_flujo": "FLJ-LOTE-1", "tipo": "factura", "timbre_uuid": self.factura.timbre_uuid}])
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["resultados"][0]["ok"])
        self.flujo.refresh_from_db()
        self.assertEqual(self.flujo.factura_id, self.factura.timbre_uuid)

    def test_aprobar_lote_uuid_inexistente_reporta_error_sin_tronar(self):
        response = self._aprobar([{"id_flujo": "FLJ-LOTE-1", "tipo": "factura", "timbre_uuid": "no-existe"}])
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["resultados"][0]["ok"])


class TesoreriaFacturaTests(TestCase):
    """Facturacion CFDI (24/Ago/2026, Sem 20 del cronograma) - encabezado,
    permiso distinto (facturacion-cfdi.*) al resto del servicio (tesoreria.*)
    - mismo criterio que ya usaban TESORERIA_ANALISTA/FINANZAS_MANAGER en
    permission_matrix.py, ahora si con CRUD real detras."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/facturas/", {"timbre_uuid": "uuid-001", "comprobante_folio": "F-1"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_facturacion_cfdi_crear(self):
        request = self.factory.post(
            "/api/facturas/",
            {"timbre_uuid": "uuid-001", "comprobante_folio": "F-1", "comprobante_total": "98600.00"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["conceptos"], [])

    def test_timbre_uuid_es_unico(self):
        TesoreriaFactura.objects.create(timbre_uuid="uuid-dup", comprobante_folio="F-1")
        request = self.factory.post(
            "/api/facturas/", {"timbre_uuid": "uuid-dup", "comprobante_folio": "F-2"}, format="json"
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_estado_por_default_pendiente(self):
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-default", comprobante_folio="F-1")
        self.assertEqual(factura.estado, TesoreriaFactura.ESTADO_PENDIENTE)

    def test_patch_normal_no_puede_cambiar_estado(self):
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-patch", comprobante_folio="F-1")
        request = self.factory.patch("/api/facturas/uuid-patch/", {"estado": "ACEPTADA"}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))
        view = TesoreriaFacturaViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 200)
        factura.refresh_from_db()
        self.assertEqual(factura.estado, TesoreriaFactura.ESTADO_PENDIENTE)


class TesoreriaFacturaExportarCsvTests(TestCase):
    """exportar_csv (09/Sep/2026, pendiente real de negocio: "Exportar:
    Facturas, Flujos, Contratos") - mismos filtros que la lista, via
    filter_queryset."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.leer",))
        TesoreriaFactura.objects.create(
            timbre_uuid="uuid-csv-1", comprobante_folio="F-1", emisor_nombre="Proveedor A",
            comprobante_total=100, estado=TesoreriaFactura.ESTADO_PENDIENTE,
        )
        TesoreriaFactura.objects.create(
            timbre_uuid="uuid-csv-2", comprobante_folio="F-2", emisor_nombre="Proveedor B",
            comprobante_total=200, estado=TesoreriaFactura.ESTADO_ACEPTADA,
        )

    def _exportar(self, **params):
        request = self.factory.get("/api/facturas/exportar_csv/", params)
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"get": "exportar_csv"})
        return view(request)

    def test_exporta_todas_sin_filtros(self):
        response = self._exportar()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        contenido = response.content.decode("utf-8")
        self.assertIn("uuid-csv-1", contenido)
        self.assertIn("uuid-csv-2", contenido)

    def test_respeta_filtro_de_estado(self):
        response = self._exportar(estado="ACEPTADA")
        contenido = response.content.decode("utf-8")
        self.assertNotIn("uuid-csv-1", contenido)
        self.assertIn("uuid-csv-2", contenido)


class TesoreriaFacturaAvisoSaldoPendienteTests(TestCase):
    """Aviso manual de saldo PPD pendiente (10/Sep/2026, pendiente real de
    Jenny: "aviso por correo de saldo PPD pendiente") - nunca se dispara
    solo, solo por este boton."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor PPD", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="ppd@ejemplo.com"
        )
        self.factura = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-ppd-1",
            contraparte=self.contraparte,
            comprobante_folio="F-PPD-1",
            comprobante_metodo_pago="PPD",
            comprobante_total=Decimal("1000.00"),
        )
        FacturaDoctoRelacionado.objects.create(
            id_documento="uuid-ppd-1", num_parcialidad=1, imp_saldo_insoluto=Decimal("400.00")
        )

    def _aviso(self, **body):
        request = self.factory.post(f"/api/facturas/{self.factura.id}/aviso_saldo_pendiente/", body, format="json")
        request.effective_scope = self.scope
        return TesoreriaFacturaViewSet.as_view({"post": "aviso_saldo_pendiente"})(request, pk=self.factura.id)

    @patch("tesoreria.views.enviar_correo_aviso_saldo_ppd", return_value=True)
    def test_envia_aviso_con_saldo_pendiente(self, mock_enviar):
        response = self._aviso()
        self.assertEqual(response.status_code, 200)
        mock_enviar.assert_called_once()
        self.assertEqual(mock_enviar.call_args.kwargs["saldo_pendiente"], Decimal("400.00"))

    def test_no_envia_si_no_es_ppd(self):
        self.factura.comprobante_metodo_pago = "PUE"
        self.factura.save(update_fields=["comprobante_metodo_pago"])
        response = self._aviso()
        self.assertEqual(response.status_code, 400)

    def test_no_envia_si_ya_no_tiene_saldo(self):
        FacturaDoctoRelacionado.objects.create(
            id_documento="uuid-ppd-1", num_parcialidad=2, imp_saldo_insoluto=Decimal("0.00")
        )
        response = self._aviso()
        self.assertEqual(response.status_code, 400)


class TesoreriaFacturaTicketOrigenTests(TestCase):
    """Vinculo factura->ticket (09/Sep/2026, "los documentos ya estan en
    Drive deben traerse de ahi") - si el analista crea la factura desde un
    ticket que ya recibio el PDF, el archivo se copia solo, sin depender
    de que se vuelva a correr el Motor Documental justo en ese momento."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        _, token_hash = generate_token()
        self.ticket = TesoreriaTicketProveedor.objects.create(
            contraparte=self.contraparte,
            email="proveedor@ejemplo.com",
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(hours=1),
            max_uses=1,
            drive_file_id_pdf="pdf-del-ticket",
            mime_type_pdf="application/pdf",
        )

    def test_copia_el_archivo_del_ticket_si_no_llega_archivo_explicito(self):
        request = self.factory.post(
            "/api/facturas/",
            {"timbre_uuid": "uuid-desde-ticket", "comprobante_folio": "F-1", "ticket_origen": self.ticket.id_ticket},
            format="json",
        )
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        factura = TesoreriaFactura.objects.get(timbre_uuid="uuid-desde-ticket")
        self.assertEqual(factura.drive_file_id_pdf, "pdf-del-ticket")
        self.assertEqual(factura.mime_type_pdf, "application/pdf")

    def test_archivo_explicito_gana_sobre_el_del_ticket(self):
        request = self.factory.post(
            "/api/facturas/",
            {
                "timbre_uuid": "uuid-desde-ticket-2",
                "comprobante_folio": "F-1",
                "ticket_origen": self.ticket.id_ticket,
                "archivo": {"file_id": "pdf-recien-analizado", "nombre": "f.pdf", "mime_type": "application/pdf"},
            },
            format="json",
        )
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        factura = TesoreriaFactura.objects.get(timbre_uuid="uuid-desde-ticket-2")
        self.assertEqual(factura.drive_file_id_pdf, "pdf-recien-analizado")

    def test_sin_ticket_origen_no_copia_nada(self):
        request = self.factory.post(
            "/api/facturas/", {"timbre_uuid": "uuid-sin-ticket", "comprobante_folio": "F-1"}, format="json"
        )
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        factura = TesoreriaFactura.objects.get(timbre_uuid="uuid-sin-ticket")
        self.assertIsNone(factura.drive_file_id_pdf)

    def test_copia_tambien_el_xml_del_ticket(self):
        self.ticket.drive_file_id_xml = "xml-del-ticket"
        self.ticket.mime_type_xml = "application/xml"
        self.ticket.save(update_fields=["drive_file_id_xml", "mime_type_xml"])
        request = self.factory.post(
            "/api/facturas/",
            {"timbre_uuid": "uuid-desde-ticket-xml", "comprobante_folio": "F-1", "ticket_origen": self.ticket.id_ticket},
            format="json",
        )
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        factura = TesoreriaFactura.objects.get(timbre_uuid="uuid-desde-ticket-xml")
        self.assertEqual(factura.drive_file_id_xml, "xml-del-ticket")


class TesoreriaFacturaFiltrosCombinadosTests(TestCase):
    """Filtros combinados de la pantalla de Facturas (09/Sep/2026, "hay que
    agregar filtros combinados por ejemplos, por empresa, proveedor,
    fechas" + "tambien por estado") - un test por filtro, mas uno
    combinando 2 a la vez para confirmar que se aplican con AND."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))
        self.contraparte_a = TesoreriaContraparte.objects.create(
            razon_social="Proveedor A", rfc="PAA010101AAA",
            email="a@ejemplo.com", tipo_persona=TesoreriaContraparte.TIPO_MORAL,
        )
        self.contraparte_b = TesoreriaContraparte.objects.create(
            razon_social="Proveedor B", rfc="PBB010101BBB",
            email="b@ejemplo.com", tipo_persona=TesoreriaContraparte.TIPO_MORAL,
        )
        self.f1 = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-filtro-1", comprobante_folio="F-1",
            contraparte=self.contraparte_a, receptor_rfc="CTZ010101AAA",
            comprobante_fecha="2026-01-10T00:00:00Z", estado=TesoreriaFactura.ESTADO_ACEPTADA,
        )
        self.f2 = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-filtro-2", comprobante_folio="F-2",
            contraparte=self.contraparte_b, receptor_rfc="CTZ020202BBB",
            comprobante_fecha="2026-03-20T00:00:00Z", estado=TesoreriaFactura.ESTADO_PENDIENTE,
        )

    def _listar(self, **params):
        request = self.factory.get("/api/facturas/", params)
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        return {f["timbre_uuid"] for f in response.data}

    def test_filtro_por_proveedor(self):
        self.assertEqual(self._listar(contraparte=self.contraparte_a.id_contraparte), {"uuid-filtro-1"})

    def test_filtro_por_empresa_receptora(self):
        self.assertEqual(self._listar(receptor_rfc="CTZ020202BBB"), {"uuid-filtro-2"})

    def test_filtro_por_estado(self):
        self.assertEqual(self._listar(estado="PENDIENTE"), {"uuid-filtro-2"})

    def test_filtro_por_rango_de_fechas(self):
        self.assertEqual(
            self._listar(fecha_desde="2026-01-01", fecha_hasta="2026-01-31"), {"uuid-filtro-1"}
        )

    def test_filtros_combinados_con_and(self):
        # proveedor A + estado ACEPTADA -> si coincide
        self.assertEqual(
            self._listar(contraparte=self.contraparte_a.id_contraparte, estado="ACEPTADA"),
            {"uuid-filtro-1"},
        )
        # proveedor A + estado PENDIENTE -> no hay match (AND real, no OR)
        self.assertEqual(
            self._listar(contraparte=self.contraparte_a.id_contraparte, estado="PENDIENTE"), set()
        )

    def test_sin_filtros_regresa_todas(self):
        self.assertEqual(self._listar(), {"uuid-filtro-1", "uuid-filtro-2"})


class TesoreriaFacturaVerDocumentoTests(TestCase):
    """ver_pdf/ver_xml (09/Sep/2026, cierra el pendiente "boton que abra
    directo el documento en Drive, en vez de solo el link crudo") - mismo
    streaming que TesoreriaTicketReembolsoViewSet.ver_ticket/ver_factura."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.leer",))

    def test_ver_pdf_sin_drive_file_id_da_404(self):
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-sin-pdf", comprobante_folio="F-1")
        request = self.factory.get("/api/facturas/uuid-sin-pdf/ver_pdf/")
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"get": "ver_pdf"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 404)

    def test_ver_xml_sin_drive_file_id_da_404(self):
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-sin-xml", comprobante_folio="F-1")
        request = self.factory.get("/api/facturas/uuid-sin-xml/ver_xml/")
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"get": "ver_xml"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 404)

    def test_ver_pdf_con_drive_file_id_transmite_el_archivo(self):
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-con-pdf",
            comprobante_folio="F-1",
            drive_file_id_pdf="drive-abc",
            mime_type_pdf="application/pdf",
        )
        contenido_falso = MagicMock()
        contenido_falso.status_code = 200
        contenido_falso.headers = {"Content-Type": "application/pdf"}
        contenido_falso.iter_content = lambda chunk_size: iter([b"%PDF-contenido"])
        with patch("tesoreria.views.requests.get", return_value=contenido_falso):
            request = self.factory.get("/api/facturas/uuid-con-pdf/ver_pdf/")
            request.effective_scope = self.scope
            view = TesoreriaFacturaViewSet.as_view({"get": "ver_pdf"})
            response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")


class TesoreriaFacturaSaldoPendienteExhibicionesTests(TestCase):
    """saldo_pendiente_exhibiciones (09/Sep/2026, "exhibiciones PUE/PPD") -
    calculado del ultimo FacturaDoctoRelacionado (nodo real del Complemento
    de Pago/REP), no de un modelo propio - ver docstring del serializer."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.leer",))

    def _get(self, pk):
        request = self.factory.get(f"/api/facturas/{pk}/")
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"get": "retrieve"})
        return view(request, pk=pk)

    def test_sin_ningun_rep_ligado_regresa_none(self):
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-sin-rep", comprobante_folio="F-1")
        response = self._get(factura.pk)
        self.assertIsNone(response.data["saldo_pendiente_exhibiciones"])

    def test_con_reps_regresa_el_saldo_insoluto_de_la_ultima_parcialidad(self):
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-ppd", comprobante_folio="F-1", comprobante_total=Decimal("1000.00")
        )
        FacturaDoctoRelacionado.objects.create(
            id_documento="uuid-ppd", num_parcialidad=1, imp_pagado=Decimal("400.00"), imp_saldo_insoluto=Decimal("600.00")
        )
        FacturaDoctoRelacionado.objects.create(
            id_documento="uuid-ppd", num_parcialidad=2, imp_pagado=Decimal("600.00"), imp_saldo_insoluto=Decimal("0.00")
        )
        response = self._get(factura.pk)
        self.assertEqual(response.data["saldo_pendiente_exhibiciones"], Decimal("0.00"))


class TesoreriaFacturaMarcarEstadoTests(TestCase):
    """marcar_estado() - ciclo de vida propio (24/Ago/2026, pedido explicito
    de Mariana): PENDIENTE/EN_PROCESO/ACEPTADA/RECHAZADA. Aceptar exige
    link_pdf + link_xml ya cargados. Gate propio facturacion-cfdi.aprobar
    (27/Ago/2026), no .editar - ver TesoreriaFacturaViewSet.get_permissions."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_aprobar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.aprobar",))
        self.factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-estado", comprobante_folio="F-1")

    def test_sin_permiso_da_403(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "EN_PROCESO"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 403)  # sin aprobar

    def test_estado_invalido_da_400(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "NO_EXISTE"}, format="json"
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 400)

    def test_en_proceso_no_exige_archivos(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "EN_PROCESO"}, format="json"
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "EN_PROCESO")

    def test_aceptar_sin_archivos_da_400(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "ACEPTADA"}, format="json"
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 400)
        self.factura.refresh_from_db()
        self.assertEqual(self.factura.estado, TesoreriaFactura.ESTADO_PENDIENTE)

    def test_aceptar_con_pdf_y_xml_ok(self):
        self.factura.link_pdf = "https://drive.google.com/pdf"
        self.factura.link_xml = "https://drive.google.com/xml"
        self.factura.save(update_fields=["link_pdf", "link_xml"])
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "ACEPTADA"}, format="json"
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "ACEPTADA")

    def test_aceptar_con_drive_file_id_sin_link_manual_ok(self):
        # 09/Sep/2026, "no se aceptan de links manuales, todo de drive" -
        # el gate tambien debe aceptar drive_file_id_pdf/xml solos, sin
        # necesitar link_pdf/link_xml (que ya no se pueden capturar desde
        # la UI).
        self.factura.drive_file_id_pdf = "drive-pdf-1"
        self.factura.drive_file_id_xml = "drive-xml-1"
        self.factura.save(update_fields=["drive_file_id_pdf", "drive_file_id_xml"])
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "ACEPTADA"}, format="json"
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "ACEPTADA")

    def test_rechazar_no_exige_archivos(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "RECHAZADA"}, format="json"
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "RECHAZADA")


class TesoreriaFlujoVincularFacturaTests(TestCase):
    """vincular_factura() liga un flujo ya capturado a una factura/
    complemento reales - factura/complemento son de solo lectura en el
    serializer normal, esta es la unica via para llenarlos."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Constructora de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")
        cuenta = TesoreriaCuenta.objects.create(
            banco=banco, clabe="002180000000000001", alias="Cuenta operativa", apertura="2026-01-01"
        )
        self.flujo = TesoreriaFlujo.objects.create(
            id_flujo="FLJ-000900", contrato=self.contrato, cuenta=cuenta, total_mxp="98600.00"
        )
        self.factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-real", comprobante_folio="F-1")
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))

    def test_vincular_factura_inexistente_da_400(self):
        request = self.factory.post(
            f"/api/flujos/{self.flujo.id_flujo}/vincular_factura/", {"factura": "no-existe"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "vincular_factura"})
        response = view(request, pk=self.flujo.id_flujo)
        self.assertEqual(response.status_code, 400)

    def test_vincular_factura_real(self):
        request = self.factory.post(
            f"/api/flujos/{self.flujo.id_flujo}/vincular_factura/", {"factura": "uuid-real"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "vincular_factura"})
        response = view(request, pk=self.flujo.id_flujo)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["factura"], "uuid-real")

    def test_vincular_complemento_real(self):
        TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-comp", folio="C-1")
        request = self.factory.post(
            f"/api/flujos/{self.flujo.id_flujo}/vincular_factura/", {"complemento": "uuid-comp"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "vincular_factura"})
        response = view(request, pk=self.flujo.id_flujo)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["complemento"], "uuid-comp")

    def test_vincular_recibo_de_nomina_real(self):
        # 10/Sep/2026, "como se une nomina y recibos de nomina" - antes era
        # un FK muerto, ahora se liga igual que factura/complemento.
        TesoreriaRecNomina.objects.create(timbre_uuid="uuid-nomina", folio="N-1")
        request = self.factory.post(
            f"/api/flujos/{self.flujo.id_flujo}/vincular_factura/", {"nomina": "uuid-nomina"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "vincular_factura"})
        response = view(request, pk=self.flujo.id_flujo)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["nomina"], "uuid-nomina")

    def test_vincular_recibo_de_nomina_inexistente_da_400(self):
        request = self.factory.post(
            f"/api/flujos/{self.flujo.id_flujo}/vincular_factura/", {"nomina": "no-existe"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "vincular_factura"})
        response = view(request, pk=self.flujo.id_flujo)
        self.assertEqual(response.status_code, 400)


class TesoreriaFlujoConfirmarConciliacionTests(TestCase):
    """confirmar_conciliacion() - paso 4 del plan de conciliacion bancaria
    por IA (ver memoria "tesoreria-flujos-registro-y-conciliacion-ia-plan"):
    guarda los campos que confirmo el analista y, si la IA detecto una
    contraparte en el comprobante, la busca o la crea con origen=ia (sin
    exigir email/tipo_persona, unica excepcion a la regla de 28/Ago/2026)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Constructora de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        banco = TesoreriaBanco.objects.create(id_banxico="00003", banco="Banamex", alias="BMX")
        cuenta = TesoreriaCuenta.objects.create(
            banco=banco, clabe="002180000000000002", alias="Cuenta operativa", apertura="2026-01-01"
        )
        self.flujo = TesoreriaFlujo.objects.create(id_flujo="FLJ-000950", contrato=self.contrato, cuenta=cuenta)
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))

    def _post(self, body):
        request = self.factory.post(
            f"/api/flujos/{self.flujo.id_flujo}/confirmar_conciliacion/", body, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "confirmar_conciliacion"})
        return view(request, pk=self.flujo.id_flujo)

    def test_guarda_solo_campos_de_la_whitelist(self):
        cuenta_original = self.flujo.cuenta_id
        response = self._post(
            {"campos": {"total_mxp": "1500.50", "concepto": "Pago de prueba", "cuenta": "otra-cuenta"}}
        )
        self.assertEqual(response.status_code, 200)
        self.flujo.refresh_from_db()
        self.assertEqual(str(self.flujo.total_mxp), "1500.50")
        self.assertEqual(self.flujo.concepto, "Pago de prueba")
        self.assertEqual(self.flujo.cuenta_id, cuenta_original)  # "cuenta" no esta en la whitelist, no se toco

    def test_contraparte_nueva_se_crea_con_origen_ia_sin_email(self):
        response = self._post({"contraparte_nombre": "Proveedor Detectado SA"})
        self.assertEqual(response.status_code, 200)
        nueva = TesoreriaContraparte.objects.get(razon_social="Proveedor Detectado SA")
        self.assertEqual(nueva.origen, TesoreriaContraparte.ORIGEN_IA)
        self.assertIsNone(nueva.email)
        self.assertEqual(response.data["contraparte_detectada"]["id_contraparte"], nueva.id_contraparte)

    def test_contraparte_existente_se_reutiliza_sin_duplicar(self):
        response = self._post({"contraparte_nombre": "constructora de prueba"})  # distinto case, mismo nombre
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            TesoreriaContraparte.objects.filter(razon_social__iexact="constructora de prueba").count(), 1
        )
        self.assertEqual(response.data["contraparte_detectada"]["id_contraparte"], self.contraparte.id_contraparte)

    def test_vincula_factura_al_confirmar(self):
        TesoreriaFactura.objects.create(timbre_uuid="uuid-conciliacion", comprobante_folio="F-9")
        response = self._post({"factura": "uuid-conciliacion"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["factura"], "uuid-conciliacion")

    def test_factura_inexistente_da_400(self):
        response = self._post({"factura": "no-existe"})
        self.assertEqual(response.status_code, 400)

    def test_sugiere_factura_por_rfc_y_monto_exacto(self):
        # 07/Sep/2026 ("IA que proponga el match comprobante->factura") -
        # antes el enlace factura<->flujo siempre era 100% manual.
        self.contraparte.rfc = "CDP900101AB1"
        self.contraparte.save(update_fields=["rfc"])
        factura_correcta = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-sugerida-1", comprobante_folio="F-S1",
            emisor_rfc="CDP900101AB1", comprobante_total="1500.00",
        )
        # Distractor: mismo RFC pero otro monto, no deberia ganarle en score.
        TesoreriaFactura.objects.create(
            timbre_uuid="uuid-sugerida-2", comprobante_folio="F-S2",
            emisor_rfc="CDP900101AB1", comprobante_total="200.00",
        )
        response = self._post({"campos": {"total_mxp": "1500.00"}, "contraparte_nombre": "Constructora de prueba"})
        self.assertEqual(response.status_code, 200)
        sugerencias = response.data["sugerencias_factura"]
        self.assertEqual(sugerencias[0]["timbre_uuid"], factura_correcta.timbre_uuid)

    def test_no_sugiere_factura_ya_ligada_a_otro_flujo(self):
        self.contraparte.rfc = "CDP900101AB1"
        self.contraparte.save(update_fields=["rfc"])
        factura = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-sugerida-3", comprobante_folio="F-S3",
            emisor_rfc="CDP900101AB1", comprobante_total="750.00",
        )
        banco = TesoreriaBanco.objects.create(id_banxico="00004", banco="Banamex", alias="BMX2")
        cuenta2 = TesoreriaCuenta.objects.create(
            banco=banco, clabe="002180000000000003", alias="Otra cuenta", apertura="2026-01-01"
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-000951", contrato=self.contrato, cuenta=cuenta2, factura=factura
        )
        response = self._post({"campos": {"total_mxp": "750.00"}, "contraparte_nombre": "Constructora de prueba"})
        self.assertEqual(response.status_code, 200)
        uuids_sugeridos = [s["timbre_uuid"] for s in response.data["sugerencias_factura"]]
        self.assertNotIn(factura.timbre_uuid, uuids_sugeridos)

    def test_no_sugiere_nada_si_ya_se_vinculo_en_la_misma_llamada(self):
        TesoreriaFactura.objects.create(
            timbre_uuid="uuid-sugerida-4", comprobante_folio="F-S4", comprobante_total="99.00"
        )
        response = self._post({"campos": {"total_mxp": "99.00"}, "factura": "uuid-sugerida-4"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sugerencias_factura"], [])

    def test_sin_monto_no_sugiere_nada(self):
        response = self._post({"contraparte_nombre": "Constructora de prueba"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sugerencias_factura"], [])


class TesoreriaContraparteOrigenTests(TestCase):
    """Excepcion de origen=ia a la obligatoriedad de email/tipo_persona
    (28/Ago/2026) - ver TesoreriaContraparteSerializer.validate."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))

    def _post(self, body):
        request = self.factory.post("/api/contrapartes/", body, format="json")
        request.effective_scope = self.scope_crear
        view = TesoreriaContraparteViewSet.as_view({"post": "create"})
        return view(request)

    def test_alta_manual_sin_email_falla(self):
        response = self._post({"razon_social": "Sin correo SA", "tipo_persona": "moral"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)

    def test_alta_ia_sin_email_ni_tipo_persona_pasa(self):
        response = self._post({"razon_social": "Detectada por IA SA", "origen": TesoreriaContraparte.ORIGEN_IA})
        self.assertEqual(response.status_code, 201)


class TesoreriaContraparteFusionTests(TestCase):
    """02/Sep/2026, cierre real de la reconciliacion contraparte maestra:
    dos contrapartes autonomas (creadas por separado por PLD/Ventas/la IA
    de conciliacion, sin RFC todavia) que mas tarde resultan tener el
    mismo RFC real se fusionan automaticamente en vez de tronar con el
    IntegrityError de rfc unique=True - ver
    TesoreriaContraparteViewSet.create/update y _fusionar_en."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear", "tesoreria.editar"))

    def _viejo(self, **overrides):
        # El "sobreviviente": ya existe en el catalogo con RFC real (ej.
        # dado de alta manual por la pantalla de Contrapartes).
        data = {
            "razon_social": "Cliente Real SA de CV",
            "rfc": "CRE010101AAA",
            "tipo_persona": "moral",
            "email": "contacto@clientereal.mx",
        }
        data.update(overrides)
        return TesoreriaContraparte.objects.create(**data)

    def _autonomo(self):
        # El "perdedor": lo creo pld-service via origen=pld, sin RFC
        # todavia (ver pld/views.py::_crear_contraparte_minima_en_tesoreria).
        return TesoreriaContraparte.objects.create(
            razon_social="Pendiente de completar (alta autónoma PLD)",
            origen=TesoreriaContraparte.ORIGEN_PLD,
            cliente=True,
        )

    def test_create_con_rfc_duplicado_no_crea_nada_regresa_el_sobreviviente(self):
        sobreviviente = self._viejo()
        request = self.factory.post(
            "/api/contrapartes/",
            {
                "razon_social": "Cliente Real SA de CV (otra vez)",
                "rfc": sobreviviente.rfc,
                "tipo_persona": "moral",
                "email": "otro@clientereal.mx",
            },
            format="json",
        )
        request.effective_scope = self.scope
        view = TesoreriaContraparteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 200)  # no 201: no se creo nada nuevo
        self.assertEqual(response.data["id_contraparte"], sobreviviente.id_contraparte)
        self.assertEqual(TesoreriaContraparte.objects.count(), 1)

    def test_update_con_rfc_duplicado_fusiona_y_reasigna_referencias_reales(self):
        sobreviviente = self._viejo()
        perdedor = self._autonomo()
        # El perdedor ya tenia un Contrato real encima antes de saber que
        # era duplicado - esto es justo lo que _fusionar_en debe reasignar.
        contrato = TesoreriaContrato.objects.create(
            id_contrato="ctr00001", contraparte=perdedor, sociedad="#####1"
        )

        request = self.factory.patch(f"/api/contrapartes/{perdedor.id_contraparte}/", {"rfc": sobreviviente.rfc}, format="json")
        request.effective_scope = self.scope
        view = TesoreriaContraparteViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=perdedor.id_contraparte)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id_contraparte"], sobreviviente.id_contraparte)

        perdedor.refresh_from_db()
        self.assertEqual(perdedor.fusionado_en_id, sobreviviente.id_contraparte)

        contrato.refresh_from_db()
        self.assertEqual(contrato.contraparte_id, sobreviviente.id_contraparte)

    def test_get_de_un_alias_fusionado_resuelve_al_sobreviviente(self):
        sobreviviente = self._viejo()
        perdedor = self._autonomo()
        perdedor.fusionado_en = sobreviviente
        perdedor.save(update_fields=["fusionado_en"])

        request = self.factory.get(f"/api/contrapartes/{perdedor.id_contraparte}/")
        request.effective_scope = self.scope
        view = TesoreriaContraparteViewSet.as_view({"get": "retrieve"})
        response = view(request, pk=perdedor.id_contraparte)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id_contraparte"], sobreviviente.id_contraparte)

    def test_editar_algo_ya_fusionado_edita_al_sobreviviente(self):
        sobreviviente = self._viejo()
        perdedor = self._autonomo()
        perdedor.fusionado_en = sobreviviente
        perdedor.save(update_fields=["fusionado_en"])

        request = self.factory.patch(
            f"/api/contrapartes/{perdedor.id_contraparte}/", {"comentarios": "nota nueva"}, format="json"
        )
        request.effective_scope = self.scope
        view = TesoreriaContraparteViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=perdedor.id_contraparte)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id_contraparte"], sobreviviente.id_contraparte)
        sobreviviente.refresh_from_db()
        self.assertEqual(sobreviviente.comentarios, "nota nueva")


class TesoreriaContraparteRelacionTests(TestCase):
    """Representante legal/beneficiario controlador - ambos extremos son
    FK reales a TesoreriaContraparte (misma tabla), dato que pide PLD/AML."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.empresa = TesoreriaContraparte.objects.create(
            razon_social="Constructora SA", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.representante = TesoreriaContraparte.objects.create(
            razon_social="Juan Perez", tipo_persona=TesoreriaContraparte.TIPO_FISICA, email="j@j.com"
        )

    def test_crear_relacion_requiere_tesoreria_crear(self):
        request = self.factory.post(
            "/api/contrapartes-relacion/",
            {
                "contraparte": self.empresa.id_contraparte,
                "contraparte_relacion": self.representante.id_contraparte,
                "tipo_relacion": "REP LEGAL",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TesoreriaContraparteRelacionViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(
            "/api/contrapartes-relacion/",
            {
                "contraparte": self.empresa.id_contraparte,
                "contraparte_relacion": self.representante.id_contraparte,
                "tipo_relacion": "REP LEGAL",
            },
            format="json",
        )
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        response2 = view(request2)
        self.assertEqual(response2.status_code, 201)
        self.assertEqual(response2.data["contraparte_relacion_nombre"], "Juan Perez")

    def test_filtro_por_contraparte(self):

        TesoreriaContraparteRelacion.objects.create(
            contraparte=self.empresa, contraparte_relacion=self.representante, tipo_relacion="REP LEGAL"
        )
        request = self.factory.get("/api/contrapartes-relacion/", {"contraparte": self.empresa.id_contraparte})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaContraparteRelacionViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)


class TesoreriaSaldoTests(TestCase):
    """`id` no es autogenerado en el modelo heredado (ver models.py) - el
    cliente debe mandarlo explicito al crear, distinto del resto de los
    catalogos de este servicio."""

    def test_crear_saldo_requiere_id_explicito(self):
        factory = APIRequestFactory()
        request = factory.post(
            "/api/saldos/",
            {"id": "saldo-2026-08-24-cta1", "fecha": "2026-08-24", "cuenta": "BBVA operativa", "saldo": "1240500.00"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaSaldoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id"], "saldo-2026-08-24-cta1")


class ReporteDiarioSaldosTests(TestCase):
    """Reporte diario de saldos (26/Ago/2026, ver documentos/finanzas.md) -
    calculo real probado directo (sin DRF, ver reportes.py) mas los 3
    endpoints nuevos de TesoreriaSaldoViewSet (reporte_diario/arrastrar/
    enviar_reporte)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco,
            clabe="002180000000000001",
            alias="Cuenta operativa",
            apertura="2026-01-01",
            activa=True,
            sociedad=RFC_TIZARA,
            tipo=TesoreriaCuenta.TIPO_CHEQUES,
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-demo-001",
            sociedad=RFC_TIZARA,
            contraparte=TesoreriaContraparte.objects.create(
                razon_social="Contraparte demo", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="d@d.com"
            ),
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )

    def test_calculo_cuadra_cuando_cambio_coincide_con_transacciones(self):
        TesoreriaSaldo.objects.create(id="s1", fecha="2026-08-24", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10000.00")
        TesoreriaSaldo.objects.create(id="s2", fecha="2026-08-25", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10500.00")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-000001", contrato=self.contrato, cuenta=self.cuenta,
            fecha_efectiva="2026-08-25", total_mxp="500.00",
        )
        reporte = calcular_reporte_diario([RFC_TIZARA], "2026-08-25")
        fila = reporte["sociedades"][0]["cuentas"][0]
        self.assertEqual(fila["cambio"], 500)
        self.assertEqual(fila["suma_transacciones"], 500)
        self.assertEqual(fila["diferencia"], 0)
        self.assertTrue(fila["cuadra"])

    def test_calculo_no_cuadra_reporta_diferencia(self):
        TesoreriaSaldo.objects.create(id="s3", fecha="2026-08-24", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10000.00")
        TesoreriaSaldo.objects.create(id="s4", fecha="2026-08-25", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10800.00")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-000002", contrato=self.contrato, cuenta=self.cuenta,
            fecha_efectiva="2026-08-25", total_mxp="500.00",
        )
        reporte = calcular_reporte_diario([RFC_TIZARA], "2026-08-25")
        fila = reporte["sociedades"][0]["cuentas"][0]
        self.assertEqual(fila["diferencia"], 300)
        self.assertFalse(fila["cuadra"])

    def test_calculo_sin_saldo_hoy_no_reporta_diferencia(self):
        TesoreriaSaldo.objects.create(id="s5", fecha="2026-08-24", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10000.00")
        reporte = calcular_reporte_diario([RFC_TIZARA], "2026-08-25")
        fila = reporte["sociedades"][0]["cuentas"][0]
        self.assertIsNone(fila["saldo_hoy"])
        self.assertIsNone(fila["diferencia"])
        self.assertIsNone(reporte["consolidado"]["saldo_hoy_total"])

    def test_transaccion_de_nomina_trae_su_tipo_y_se_consolida(self):
        # 11/Sep/2026, "el reporte diario debe reflejar tambien la nomina de
        # ambos tipos" - cada Flujo de nomina ya se sumaba a suma_transacciones
        # como cualquier otro (misma cuenta/fecha_efectiva), esto solo lo hace
        # visible: nomina_tipo por transaccion + consolidado del dia.
        nomina_q = TesoreriaNomina.objects.create(
            id_nomina="NOM-Q1", tipo=TesoreriaNomina.TIPO_QUINCENAL, sociedad=RFC_TIZARA, serie="Q1"
        )
        nomina_s = TesoreriaNomina.objects.create(
            id_nomina="NOM-S1", tipo=TesoreriaNomina.TIPO_SEMANAL, sociedad=RFC_TIZARA, serie="S1"
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-NOM-Q1", contrato=self.contrato, cuenta=self.cuenta,
            fecha_efectiva="2026-08-25", total_mxp="1000.00", periodo_nomina=nomina_q,
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-NOM-S1", contrato=self.contrato, cuenta=self.cuenta,
            fecha_efectiva="2026-08-25", total_mxp="300.00", periodo_nomina=nomina_s,
        )
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-NORMAL", contrato=self.contrato, cuenta=self.cuenta,
            fecha_efectiva="2026-08-25", total_mxp="200.00",
        )
        reporte = calcular_reporte_diario([RFC_TIZARA], "2026-08-25")
        transacciones = {t["id_flujo"]: t["nomina_tipo"] for t in reporte["sociedades"][0]["cuentas"][0]["transacciones"]}
        self.assertEqual(transacciones["FLJ-NOM-Q1"], "QUINCENAL")
        self.assertEqual(transacciones["FLJ-NOM-S1"], "SEMANAL")
        self.assertIsNone(transacciones["FLJ-NORMAL"])
        self.assertEqual(reporte["consolidado"]["nomina_total_quincenal"], Decimal("1000.00"))
        self.assertEqual(reporte["consolidado"]["nomina_total_semanal"], Decimal("300.00"))

    def test_filtra_solo_cuentas_activas_de_la_sociedad_elegida(self):
        TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000002", alias="Otra sociedad", apertura="2026-01-01",
            activa=True, sociedad=RFC_CAPITAL,
        )
        TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000003", alias="Inactiva", apertura="2026-01-01",
            activa=False, sociedad=RFC_TIZARA,
        )
        reporte = calcular_reporte_diario([RFC_TIZARA], "2026-08-25")
        alias_en_reporte = [f["alias"] for e in reporte["sociedades"] for f in e["cuentas"]]
        self.assertEqual(alias_en_reporte, ["Cuenta operativa"])

    def test_endpoint_reporte_diario_no_requiere_permiso_especial(self):
        request = self.factory.get("/api/saldos/reporte_diario/", {"sociedades": RFC_TIZARA, "fecha": "2026-08-25"})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaSaldoViewSet.as_view({"get": "reporte_diario"})
        response = view(request)
        self.assertEqual(response.status_code, 200)

    def test_arrastrar_sin_permiso_da_403(self):
        TesoreriaSaldo.objects.create(id="s6", fecha="2026-08-24", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10000.00")
        request = self.factory.post(
            "/api/saldos/arrastrar/", {"cuenta": self.cuenta.id_cuenta_bancaria, "fecha": "2026-08-25"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TesoreriaSaldoViewSet.as_view({"post": "arrastrar"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_arrastrar_copia_el_saldo_anterior(self):
        TesoreriaSaldo.objects.create(id="s7", fecha="2026-08-24", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10000.00")
        request = self.factory.post(
            "/api/saldos/arrastrar/", {"cuenta": self.cuenta.id_cuenta_bancaria, "fecha": "2026-08-25"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaSaldoViewSet.as_view({"post": "arrastrar"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["saldo"], "10000.00")
        self.assertEqual(response.data["fecha"], "2026-08-25")

    def test_arrastrar_sin_saldo_previo_da_400(self):
        request = self.factory.post(
            "/api/saldos/arrastrar/", {"cuenta": self.cuenta.id_cuenta_bancaria, "fecha": "2026-08-25"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaSaldoViewSet.as_view({"post": "arrastrar"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_arrastrar_no_pisa_saldo_ya_capturado(self):
        TesoreriaSaldo.objects.create(id="s8", fecha="2026-08-24", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10000.00")
        TesoreriaSaldo.objects.create(id="s9", fecha="2026-08-25", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10800.00")
        request = self.factory.post(
            "/api/saldos/arrastrar/", {"cuenta": self.cuenta.id_cuenta_bancaria, "fecha": "2026-08-25"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaSaldoViewSet.as_view({"post": "arrastrar"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_enviar_reporte_sin_destinatarios_da_400(self):
        request = self.factory.post("/api/saldos/enviar_reporte/", {"sociedades": [RFC_TIZARA]}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaSaldoViewSet.as_view({"post": "enviar_reporte"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_enviar_reporte_con_diferencia_da_400(self):
        # Jenny, junta 09/Sep: "no enviar el reporte diario si hay
        # diferencia" - se rechaza en el backend, no solo deshabilitando el
        # boton del lado del cliente.
        TesoreriaSaldo.objects.create(id="s10", fecha="2026-08-24", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10000.00")
        TesoreriaSaldo.objects.create(id="s11", fecha="2026-08-25", cuenta=self.cuenta.id_cuenta_bancaria, saldo="10800.00")
        TesoreriaFlujo.objects.create(
            id_flujo="FLJ-000003", contrato=self.contrato, cuenta=self.cuenta,
            fecha_efectiva="2026-08-25", total_mxp="500.00",
        )
        request = self.factory.post(
            "/api/saldos/enviar_reporte/",
            {"sociedades": [RFC_TIZARA], "fecha": "2026-08-25", "destinatarios": ["a@a.com"]},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaSaldoViewSet.as_view({"post": "enviar_reporte"})
        response = view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Cuenta operativa", response.data["detail"])


class TesoreriaContraparteVistaPorProveedorTests(TestCase):
    """Vista por proveedor (25/Ago/2026) - Factura/ComplementoPago/
    NotaCredito se ligan a la Contraparte via FK real, auto-llenada
    buscando emisor_rfc == TesoreriaContraparte.rfc (ver
    _vincular_contraparte_por_rfc en views.py). Sin match, el registro
    sigue existiendo sin vinculo - no bloquea la captura."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.proveedor = TesoreriaContraparte.objects.create(
            razon_social="Proveedor Vinculable SA",
            rfc="PVI900101ABC",
            tipo_persona=TesoreriaContraparte.TIPO_MORAL,
            email="p@p.com",
        )
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))
        self.scope_aprobar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.aprobar",))

    def test_crear_factura_con_rfc_conocido_vincula_contraparte(self):
        request = self.factory.post(
            "/api/facturas/",
            {"timbre_uuid": "uuid-vinc-1", "comprobante_folio": "F-1", "emisor_rfc": "PVI900101ABC"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["contraparte"], self.proveedor.id_contraparte)
        self.assertEqual(response.data["contraparte_nombre"], "Proveedor Vinculable SA")

    def test_crear_factura_con_rfc_desconocido_no_vincula(self):
        request = self.factory.post(
            "/api/facturas/",
            {"timbre_uuid": "uuid-vinc-2", "comprobante_folio": "F-2", "emisor_rfc": "XXX000000XXX"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["contraparte"])

    def test_contraparte_es_de_solo_lectura_en_patch_normal(self):
        """No se puede escribir contraparte a mano - solo se llena via
        _vincular_contraparte_por_rfc (create/confirmar_extraccion)."""
        otra_contraparte = TesoreriaContraparte.objects.create(
            razon_social="Otra", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="o@o.com"
        )
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-vinc-3", comprobante_folio="F-3")
        request = self.factory.patch(
            f"/api/facturas/{factura.pk}/", {"contraparte": otra_contraparte.id_contraparte}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFacturaViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 200)
        factura.refresh_from_db()
        self.assertIsNone(factura.contraparte)

    def test_confirmar_extraccion_vincula_contraparte_por_rfc(self):
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-vinc-4", comprobante_folio="F-4")
        self.assertIsNone(factura.contraparte)
        request = self.factory.post(
            f"/api/facturas/{factura.pk}/confirmar_extraccion/",
            {"campos": {"emisor_rfc": "PVI900101ABC"}},
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "confirmar_extraccion"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 200)
        factura.refresh_from_db()
        self.assertEqual(factura.contraparte_id, self.proveedor.id_contraparte)

    def test_confirmar_extraccion_con_archivo_pdf_liga_drive_file_id(self):
        # 07/Sep/2026 - cierra el hueco real: antes ni confirmar_extraccion
        # ni create() ligaban el archivo de Drive que de verdad se
        # analizo, link_pdf/link_xml se quedaban vacios para siempre.
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-archivo-1", comprobante_folio="F-A1")
        request = self.factory.post(
            f"/api/facturas/{factura.pk}/confirmar_extraccion/",
            {
                "campos": {"comprobante_folio": "F-A1"},
                "archivo": {
                    "file_id": "drive-123",
                    "nombre": "factura.pdf",
                    "mime_type": "application/pdf",
                    "web_view_link": "https://drive.example/view/drive-123",
                },
            },
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "confirmar_extraccion"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 200)
        factura.refresh_from_db()
        self.assertEqual(factura.drive_file_id_pdf, "drive-123")
        self.assertEqual(factura.mime_type_pdf, "application/pdf")
        self.assertEqual(factura.link_pdf, "https://drive.example/view/drive-123")
        self.assertIsNone(factura.drive_file_id_xml)

    def test_confirmar_extraccion_archivo_no_reconocido_se_ignora(self):
        # Ni pdf ni xml (ej. el analista selecciono una imagen suelta) - no
        # debe tronar ni ligar nada.
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-archivo-3", comprobante_folio="F-A3")
        request = self.factory.post(
            f"/api/facturas/{factura.pk}/confirmar_extraccion/",
            {
                "campos": {"comprobante_folio": "F-A3"},
                "archivo": {"file_id": "drive-789", "nombre": "foto.jpg", "mime_type": "image/jpeg"},
            },
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = TesoreriaFacturaViewSet.as_view({"post": "confirmar_extraccion"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 200)
        factura.refresh_from_db()
        self.assertIsNone(factura.drive_file_id_pdf)
        self.assertIsNone(factura.drive_file_id_xml)

    def test_crear_factura_con_archivo_liga_drive_file_id(self):
        # Caso mas comun en la practica: el proveedor ya subio su PDF via
        # ticket publico, el Motor Documental lo analizo ANTES de que la
        # factura existiera - create() tambien debe ligarlo, no solo
        # confirmar_extraccion (ver handleAutorellenarNuevaFactura en el
        # frontend).
        request = self.factory.post(
            "/api/facturas/",
            {
                "timbre_uuid": "uuid-archivo-4",
                "comprobante_folio": "F-A4",
                "archivo": {"file_id": "drive-999", "nombre": "factura.pdf", "mime_type": "application/pdf"},
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaFacturaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["drive_file_id_pdf"], "drive-999")

    def test_filtro_por_contraparte_en_facturas(self):
        TesoreriaFactura.objects.create(
            timbre_uuid="uuid-vinc-5", comprobante_folio="F-5", emisor_rfc="PVI900101ABC", contraparte=self.proveedor
        )
        TesoreriaFactura.objects.create(timbre_uuid="uuid-vinc-6", comprobante_folio="F-6")
        request = self.factory.get("/api/facturas/", {"contraparte": self.proveedor.id_contraparte})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaFacturaViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["timbre_uuid"], "uuid-vinc-5")

    def test_filtro_por_contraparte_en_complementos_pago(self):
        TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-comp-vinc-1", folio="C-1", contraparte=self.proveedor)
        TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-comp-vinc-2", folio="C-2")
        request = self.factory.get("/api/complementos-pago/", {"contraparte": self.proveedor.id_contraparte})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaComplementoPagoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["timbre_uuid"], "uuid-comp-vinc-1")

    def test_filtro_por_contraparte_en_notas_credito(self):
        TesoreriaNotaCredito.objects.create(timbre_uuid="uuid-nc-vinc-1", comprobante_folio="N-1", contraparte=self.proveedor)
        TesoreriaNotaCredito.objects.create(timbre_uuid="uuid-nc-vinc-2", comprobante_folio="N-2")
        request = self.factory.get("/api/notas-credito/", {"contraparte": self.proveedor.id_contraparte})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaNotaCreditoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["timbre_uuid"], "uuid-nc-vinc-1")

    def test_crear_complemento_pago_con_rfc_conocido_vincula_contraparte(self):
        request = self.factory.post(
            "/api/complementos-pago/",
            {"timbre_uuid": "uuid-comp-vinc-3", "folio": "C-3", "emisor_rfc": "PVI900101ABC"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaComplementoPagoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["contraparte"], self.proveedor.id_contraparte)

    def test_crear_nota_credito_con_rfc_conocido_vincula_contraparte(self):
        request = self.factory.post(
            "/api/notas-credito/",
            {"timbre_uuid": "uuid-nc-vinc-3", "comprobante_folio": "N-3", "emisor_rfc": "PVI900101ABC"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaNotaCreditoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["contraparte"], self.proveedor.id_contraparte)


class TesoreriaFacturaVincularFlujoTests(TestCase):
    """vincular_flujo() en TesoreriaFacturaViewSet (07/Sep/2026,
    "vinculacion factura<->flujo bidireccional") - sentido inverso a
    TesoreriaFlujoViewSet.vincular_factura: mismo campo real
    (TesoreriaFlujo.factura), solo que ahora tambien se puede iniciar
    desde la pantalla de Facturas."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Constructora de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        banco = TesoreriaBanco.objects.create(id_banxico="00003", banco="Banamex", alias="BMX")
        cuenta = TesoreriaCuenta.objects.create(
            banco=banco, clabe="002180000000000002", alias="Cuenta operativa", apertura="2026-01-01"
        )
        self.flujo = TesoreriaFlujo.objects.create(
            id_flujo="FLJ-000901", contrato=self.contrato, cuenta=cuenta, total_mxp="500.00"
        )
        self.factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-vinc-flujo-1", comprobante_folio="F-VF1")
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))

    def test_vincular_flujo_inexistente_da_400(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/vincular_flujo/", {"flujo": "no-existe"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFacturaViewSet.as_view({"post": "vincular_flujo"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 400)

    def test_vincular_flujo_sin_permiso_da_403(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/vincular_flujo/", {"flujo": self.flujo.id_flujo}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TesoreriaFacturaViewSet.as_view({"post": "vincular_flujo"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 403)

    def test_vincular_flujo_real_liga_el_mismo_campo_que_el_lado_flujo(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/vincular_flujo/", {"flujo": self.flujo.id_flujo}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFacturaViewSet.as_view({"post": "vincular_flujo"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 200)
        # La respuesta es el Flujo actualizado (no la Factura) - mismo
        # criterio que el lado espejo, se ve el resultado del lado que
        # de verdad cambio.
        self.assertEqual(response.data["id_flujo"], self.flujo.id_flujo)
        self.assertEqual(response.data["factura"], self.factura.timbre_uuid)
        self.flujo.refresh_from_db()
        self.assertEqual(self.flujo.factura_id, self.factura.timbre_uuid)


class TesoreriaComplementoPagoCrudTests(TestCase):
    """CRUD real de encabezado - mismo permiso facturacion-cfdi.* que
    Factura/NotaCredito, sin tests dedicados hasta ahora."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/complementos-pago/", {"timbre_uuid": "uuid-cp-1", "folio": "C-1"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaComplementoPagoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_ok(self):
        request = self.factory.post(
            "/api/complementos-pago/", {"timbre_uuid": "uuid-cp-2", "folio": "C-2"}, format="json"
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaComplementoPagoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(TesoreriaComplementoPago.objects.filter(timbre_uuid="uuid-cp-2").exists())

    def test_timbre_uuid_es_unico(self):
        TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-cp-dup", folio="C-1")
        request = self.factory.post(
            "/api/complementos-pago/", {"timbre_uuid": "uuid-cp-dup", "folio": "C-2"}, format="json"
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaComplementoPagoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_editar_requiere_permiso_distinto(self):
        complemento = TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-cp-3", folio="C-3")
        request = self.factory.patch(
            f"/api/complementos-pago/{complemento.pk}/", {"folio": "C-3-editado"}, format="json"
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaComplementoPagoViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=complemento.pk)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.patch(
            f"/api/complementos-pago/{complemento.pk}/", {"folio": "C-3-editado"}, format="json"
        )
        request2.effective_scope = self.scope_editar
        response2 = view(request2, pk=complemento.pk)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["folio"], "C-3-editado")

    def test_busqueda_por_folio_o_rfc(self):
        TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-cp-4", folio="C-4", emisor_rfc="EMI900101AAA")
        TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-cp-5", folio="C-5")
        request = self.factory.get("/api/complementos-pago/", {"search": "EMI900101AAA"})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaComplementoPagoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["timbre_uuid"], "uuid-cp-4")


class TesoreriaNotaCreditoCrudTests(TestCase):
    """CRUD real de encabezado - sin tests dedicados hasta ahora.
    uuid_relacionado es FK real a TesoreriaFactura.timbre_uuid."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/notas-credito/", {"timbre_uuid": "uuid-nc-1", "comprobante_folio": "N-1"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaNotaCreditoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_ok(self):
        request = self.factory.post(
            "/api/notas-credito/", {"timbre_uuid": "uuid-nc-2", "comprobante_folio": "N-2"}, format="json"
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaNotaCreditoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(TesoreriaNotaCredito.objects.filter(timbre_uuid="uuid-nc-2").exists())

    def test_crear_ligada_a_factura_real_expone_factura_folio(self):
        factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-nc-factura", comprobante_folio="F-100")
        request = self.factory.post(
            "/api/notas-credito/",
            {"timbre_uuid": "uuid-nc-3", "comprobante_folio": "N-3", "uuid_relacionado": factura.timbre_uuid},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaNotaCreditoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["factura_folio"], "F-100")

    def test_editar_requiere_permiso_distinto(self):
        nota = TesoreriaNotaCredito.objects.create(timbre_uuid="uuid-nc-4", comprobante_folio="N-4")
        request = self.factory.patch(
            f"/api/notas-credito/{nota.pk}/", {"comprobante_folio": "N-4-editada"}, format="json"
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaNotaCreditoViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=nota.pk)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.patch(
            f"/api/notas-credito/{nota.pk}/", {"comprobante_folio": "N-4-editada"}, format="json"
        )
        request2.effective_scope = self.scope_editar
        response2 = view(request2, pk=nota.pk)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["comprobante_folio"], "N-4-editada")


class TesoreriaRecNominaCrudTests(TestCase):
    """CFDI de nomina - mismo permiso facturacion-cfdi.*, bloqueado en la
    practica hasta que exista RRHH pero el CRUD no depende de eso."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post("/api/rec-nominas/", {"timbre_uuid": "uuid-rn-1", "folio": "RN-1"}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        view = TesoreriaRecNominaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_ok(self):
        request = self.factory.post(
            "/api/rec-nominas/",
            {"timbre_uuid": "uuid-rn-2", "folio": "RN-2", "nom_receptor_num_empleado": "EMP001"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaRecNominaViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(TesoreriaRecNomina.objects.filter(timbre_uuid="uuid-rn-2").exists())

    def test_busqueda_por_num_empleado(self):
        TesoreriaRecNomina.objects.create(timbre_uuid="uuid-rn-3", folio="RN-3", nom_receptor_num_empleado="EMP002")
        TesoreriaRecNomina.objects.create(timbre_uuid="uuid-rn-4", folio="RN-4", nom_receptor_num_empleado="EMP003")
        request = self.factory.get("/api/rec-nominas/", {"search": "EMP002"})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaRecNominaViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["timbre_uuid"], "uuid-rn-3")

    def test_editar_requiere_permiso_distinto(self):
        recibo = TesoreriaRecNomina.objects.create(timbre_uuid="uuid-rn-5", folio="RN-5")
        request = self.factory.patch(f"/api/rec-nominas/{recibo.pk}/", {"folio": "RN-5-editado"}, format="json")
        request.effective_scope = self.scope_crear
        view = TesoreriaRecNominaViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=recibo.pk)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.patch(f"/api/rec-nominas/{recibo.pk}/", {"folio": "RN-5-editado"}, format="json")
        request2.effective_scope = self.scope_editar
        response2 = view(request2, pk=recibo.pk)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["folio"], "RN-5-editado")

    def test_subir_comprobante_sin_permiso_da_403(self):
        # 11/Sep/2026, "subir comprobante no XML" - distinto del PDF del
        # CFDI, exige facturacion-cfdi.editar igual que el resto de esta vista.
        recibo = TesoreriaRecNomina.objects.create(timbre_uuid="uuid-rn-6", folio="RN-6")
        request = self.factory.post(
            f"/api/rec-nominas/{recibo.pk}/subir_comprobante/",
            {"file": SimpleUploadedFile("comprobante.pdf", b"contenido-fake", content_type="application/pdf")},
            format="multipart",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaRecNominaViewSet.as_view({"post": "subir_comprobante"})
        response = view(request, pk=recibo.pk)
        self.assertEqual(response.status_code, 403)

    def test_subir_comprobante_con_permiso_guarda_link_y_file_id(self):
        recibo = TesoreriaRecNomina.objects.create(timbre_uuid="uuid-rn-7", folio="RN-7")
        with patch(
            "tesoreria.views._subir_a_drive",
            return_value=(
                {"web_view_link": "https://drive.example/comprobante", "file_id": "fake-comp-1", "mime_type": "application/pdf"},
                None,
            ),
        ):
            request = self.factory.post(
                f"/api/rec-nominas/{recibo.pk}/subir_comprobante/",
                {"file": SimpleUploadedFile("comprobante.pdf", b"contenido-fake", content_type="application/pdf")},
                format="multipart",
            )
            request.effective_scope = self.scope_editar
            view = TesoreriaRecNominaViewSet.as_view({"post": "subir_comprobante"})
            response = view(request, pk=recibo.pk)
        self.assertEqual(response.status_code, 200)
        recibo.refresh_from_db()
        self.assertEqual(recibo.link_comprobante, "https://drive.example/comprobante")
        self.assertEqual(recibo.drive_file_id_comprobante, "fake-comp-1")

    def test_subir_comprobante_sin_file_da_400(self):
        recibo = TesoreriaRecNomina.objects.create(timbre_uuid="uuid-rn-8", folio="RN-8")
        request = self.factory.post(f"/api/rec-nominas/{recibo.pk}/subir_comprobante/", {}, format="multipart")
        request.effective_scope = self.scope_editar
        view = TesoreriaRecNominaViewSet.as_view({"post": "subir_comprobante"})
        response = view(request, pk=recibo.pk)
        self.assertEqual(response.status_code, 400)

    def test_ver_comprobante_sin_drive_file_id_da_404(self):
        recibo = TesoreriaRecNomina.objects.create(timbre_uuid="uuid-rn-9", folio="RN-9")
        request = self.factory.get(f"/api/rec-nominas/{recibo.pk}/ver_comprobante/")
        request.effective_scope = self.scope_editar
        view = TesoreriaRecNominaViewSet.as_view({"get": "ver_comprobante"})
        response = view(request, pk=recibo.pk)
        self.assertEqual(response.status_code, 404)


class FacturaLineasCrudTests(TestCase):
    """Lineas de detalle de una factura/nota de credito - sin FK real hacia
    la cabecera (UUID plano, ver docstring de cada modelo), el filtro real
    es ?uuid=<timbre_uuid> desde la pantalla de detalle. Sin tests
    dedicados hasta ahora."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        self.scope_crear_cfdi = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))

    def test_crear_concepto_y_filtrar_por_uuid(self):
        request = self.factory.post(
            "/api/factura-conceptos/",
            {"uuid": "uuid-linea-1", "descripcion": "Servicio de mantenimiento", "importe": "5000.00"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = FacturaConceptoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)

        FacturaConcepto.objects.create(uuid="uuid-otro", descripcion="No debe salir")
        list_request = self.factory.get("/api/factura-conceptos/", {"uuid": "uuid-linea-1"})
        list_request.effective_scope = EffectiveScope.anonymous()
        list_view = FacturaConceptoViewSet.as_view({"get": "list"})
        list_response = list_view(list_request)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["descripcion"], "Servicio de mantenimiento")

    def test_crear_traslado_y_filtrar_por_uuid(self):
        request = self.factory.post(
            "/api/factura-traslados/",
            {"uuid": "uuid-linea-2", "impuesto": "002", "tasa_o_cuota": "0.160000", "importe": "800.00"},
            format="json",
        )
        request.effective_scope = self.scope_crear_cfdi
        view = FacturaTrasladoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)

        FacturaTraslado.objects.create(uuid="uuid-otro-2", impuesto="002")
        list_request = self.factory.get("/api/factura-traslados/", {"uuid": "uuid-linea-2"})
        list_request.effective_scope = EffectiveScope.anonymous()
        list_view = FacturaTrasladoViewSet.as_view({"get": "list"})
        list_response = list_view(list_request)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["impuesto"], "002")

    def test_crear_docto_relacionado_y_filtrar_por_timbre_uuid(self):
        request = self.factory.post(
            "/api/factura-doctos-relacionados/",
            {"timbre_uuid": "uuid-linea-3", "id_documento": "F-PPD-1", "num_parcialidad": 1},
            format="json",
        )
        request.effective_scope = self.scope_crear_cfdi
        view = FacturaDoctoRelacionadoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)

        FacturaDoctoRelacionado.objects.create(timbre_uuid="uuid-otro-3", id_documento="F-PPD-2")
        list_request = self.factory.get("/api/factura-doctos-relacionados/", {"timbre_uuid": "uuid-linea-3"})
        list_request.effective_scope = EffectiveScope.anonymous()
        list_view = FacturaDoctoRelacionadoViewSet.as_view({"get": "list"})
        list_response = list_view(list_request)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["id_documento"], "F-PPD-1")

    def test_filtrar_docto_relacionado_por_id_documento(self):
        # 10/Sep/2026, "mostrar la lista de exhibiciones/REPs ya recibidos
        # dentro de la misma factura" - filtro nuevo, distinto de
        # ?timbre_uuid= (ese es el uuid del REP, no el de la factura).
        FacturaDoctoRelacionado.objects.create(
            timbre_uuid="rep-uuid-1", id_documento="factura-uuid-1", num_parcialidad=1
        )
        FacturaDoctoRelacionado.objects.create(
            timbre_uuid="rep-uuid-2", id_documento="factura-uuid-1", num_parcialidad=2
        )
        FacturaDoctoRelacionado.objects.create(
            timbre_uuid="rep-uuid-3", id_documento="factura-uuid-otra", num_parcialidad=1
        )
        request = self.factory.get("/api/factura-doctos-relacionados/", {"id_documento": "factura-uuid-1"})
        request.effective_scope = EffectiveScope.anonymous()
        response = FacturaDoctoRelacionadoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 2)
        self.assertEqual({f["timbre_uuid"] for f in response.data}, {"rep-uuid-1", "rep-uuid-2"})

    def test_crear_linea_nota_credito_y_filtrar_por_uuid(self):
        request = self.factory.post(
            "/api/nota-credito-conceptos/",
            {"uuid": "uuid-linea-4", "descripcion": "Ajuste de precio", "importe": "300.00"},
            format="json",
        )
        request.effective_scope = self.scope_crear_cfdi
        view = FacturaNotaCreditoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)

        FacturaNotaCredito.objects.create(uuid="uuid-otro-4", descripcion="No debe salir")
        list_request = self.factory.get("/api/nota-credito-conceptos/", {"uuid": "uuid-linea-4"})
        list_request.effective_scope = EffectiveScope.anonymous()
        list_view = FacturaNotaCreditoViewSet.as_view({"get": "list"})
        list_response = list_view(list_request)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["descripcion"], "Ajuste de precio")


class TesoreriaCorteEdcCrudTests(TestCase):
    """Corte / estado de cuenta - backend construido 25/Ago/2026 junto con
    el frontend, sin tests dedicados hasta ahora. id ya no es read_only
    (ver TesoreriaCorteEdcSerializer) - se puede mandar explicito, igual
    criterio que Contraparte/Cuenta."""

    def setUp(self):
        self.factory = APIRequestFactory()
        banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=banco, clabe="002180000000000002", alias="Cuenta operativa", apertura="2026-01-01"
        )
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/cortes-edc/",
            {
                "cuenta": self.cuenta.id_cuenta_bancaria,
                "fecha_final": "2026-08-25",
                "tipo": "estado_cuenta",
                "formato": "pdf",
                "link": "https://drive.google.com/file/x",
                "created_by": "analist1",
                "updated_by": "analist1",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = TesoreriaCorteEdcViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_ok(self):
        request = self.factory.post(
            "/api/cortes-edc/",
            {
                "cuenta": self.cuenta.id_cuenta_bancaria,
                "fecha_final": "2026-08-25",
                "tipo": "estado_cuenta",
                "formato": "pdf",
                "link": "https://drive.google.com/file/x",
                "created_by": "analist1",
                "updated_by": "analist1",
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = TesoreriaCorteEdcViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["cuenta_alias"], "Cuenta operativa")

    def test_filtro_por_cuenta(self):
        otra_cuenta = TesoreriaCuenta.objects.create(
            banco=self.cuenta.banco, clabe="002180000000000003", alias="Otra cuenta", apertura="2026-01-01"
        )
        TesoreriaCorteEdc.objects.create(
            cuenta=self.cuenta,
            fecha_final="2026-08-25",
            tipo="estado_cuenta",
            formato="pdf",
            link="https://drive.google.com/1",
            created_by="a1",
            updated_by="a1",
        )
        TesoreriaCorteEdc.objects.create(
            cuenta=otra_cuenta,
            fecha_final="2026-08-25",
            tipo="corte",
            formato="csv",
            link="https://drive.google.com/2",
            created_by="a1",
            updated_by="a1",
        )
        request = self.factory.get("/api/cortes-edc/", {"cuenta": self.cuenta.id_cuenta_bancaria})
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaCorteEdcViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["cuenta"], self.cuenta.id_cuenta_bancaria)

    def test_editar_requiere_tesoreria_editar(self):
        corte = TesoreriaCorteEdc.objects.create(
            cuenta=self.cuenta,
            fecha_final="2026-08-25",
            tipo="estado_cuenta",
            formato="pdf",
            link="https://drive.google.com/1",
            created_by="a1",
            updated_by="a1",
        )
        request = self.factory.patch(f"/api/cortes-edc/{corte.pk}/", {"disponible": True}, format="json")
        request.effective_scope = self.scope_crear
        view = TesoreriaCorteEdcViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=corte.pk)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.patch(f"/api/cortes-edc/{corte.pk}/", {"disponible": True}, format="json")
        request2.effective_scope = self.scope_editar
        response2 = view(request2, pk=corte.pk)
        self.assertEqual(response2.status_code, 200)
        self.assertTrue(response2.data["disponible"])


class TesoreriaTicketReembolsoCrudTests(TestCase):
    """Alta del empleado (MiCumbres, pantalla provisional - ver docstring
    del modelo). 31/Ago/2026: agrega moneda/sociedad (hallazgo de la
    comparacion contra Tesoreria2.pdf) - el empleado los llena al crear,
    igual que fecha_gasto. `centro` se elimino 03/Sep/2026 sin reemplazo
    (division por proyecto es de Solicitud de Pago, no de Reembolso).
    `monto`/`categoria_gasto`/`descripcion` por gasto se movieron a
    `conceptos` (03/Sep/2026, minuta punto 1: "solicitar varios
    conceptos") - un ticket ahora requiere al menos un concepto.

    fecha_gasto usa date.today() (no una fecha fija) porque
    perform_create ahora valida la fecha limite mensual
    (reembolso_utils.validar_fecha_limite) - una fecha fija se volveria
    invalida con el paso del tiempo salvo que caiga justo en el mes en
    curso."""

    HOY = date.today().isoformat()
    UN_CONCEPTO = [{"descripcion": "Taxi a obra", "monto": "150.00"}]

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_empleado = EffectiveScope(is_global=False, identity_user_id="empleado1")
        # Evita que la sincronizacion perezosa de festivos (disparada por
        # perform_create -> validar_fecha_limite) haga una llamada de red
        # real a Nager.Date en cada test - ver TesoreriaFechaLimiteReembolsoTests.
        parche = patch("tesoreria.reembolso_utils.requests.get", side_effect=requests.RequestException("sin red"))
        parche.start()
        self.addCleanup(parche.stop)
        # 07/Sep/2026: create() ahora exige "file" y lo sube a Drive en el
        # mismo paso (ver TesoreriaTicketReembolsoViewSet.create) - se
        # mockea _subir_a_drive en vez de pegarle de verdad a drive-service,
        # mismo criterio que el resto de las pruebas de este archivo con
        # llamadas de red externas.
        parche_drive = patch(
            "tesoreria.views._subir_a_drive",
            return_value=({"web_view_link": "https://drive.example/x", "file_id": "fake123", "mime_type": "image/png"}, None),
        )
        parche_drive.start()
        self.addCleanup(parche_drive.stop)

    def _post_crear(self, campos):
        """Arma un POST multipart valido para create() - conceptos va como
        JSON serializado (asi lo manda el frontend real, ver
        crearTicketReembolso en lib/miCumbres.ts) y siempre incluye un
        archivo falso, ya que el endpoint ahora lo exige."""
        data = dict(campos)
        data["conceptos"] = json.dumps(data.get("conceptos", []))
        data["file"] = SimpleUploadedFile("comprobante.png", b"contenido-fake", content_type="image/png")
        return self.factory.post("/api/tickets-reembolso/", data, format="multipart")

    def test_crear_sin_sesion_da_403(self):
        request = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY})
        request.effective_scope = EffectiveScope(is_global=False)
        view = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_sin_conceptos_da_400(self):
        # 03/Sep/2026: se requiere al menos un concepto.
        request = self._post_crear({"conceptos": [], "fecha_gasto": self.HOY})
        request.effective_scope = self.scope_empleado
        response = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.status_code, 400)

    def test_crear_sin_archivo_da_400(self):
        # 07/Sep/2026 (bug real de tickets duplicados): el comprobante ya
        # es obligatorio para crear el ticket - no puede existir un ticket
        # sin imagen.
        request = self.factory.post(
            "/api/tickets-reembolso/",
            {"conceptos": json.dumps(self.UN_CONCEPTO), "fecha_gasto": self.HOY},
            format="multipart",
        )
        request.effective_scope = self.scope_empleado
        response = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(TesoreriaTicketReembolso.objects.count(), 0)

    def test_crear_con_varios_conceptos_suma_el_monto_total(self):
        # 03/Sep/2026 (minuta punto 1: "solicitar varios conceptos").
        request = self._post_crear(
            {
                "conceptos": [
                    {"descripcion": "Taxi", "monto": "150.00", "categoria_gasto": "TRANSPORTE"},
                    {"descripcion": "Comida", "monto": "200.00", "categoria_gasto": "ALIMENTOS"},
                ],
                "moneda": "USD",
                "sociedad": "CIF010101AAA",
                "fecha_gasto": self.HOY,
            }
        )
        request.effective_scope = self.scope_empleado
        view = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["moneda"], "USD")
        self.assertEqual(response.data["sociedad"], "CIF010101AAA")
        self.assertEqual(len(response.data["conceptos"]), 2)
        self.assertEqual(str(response.data["monto_total"]), "350.00")
        # id_empleado lo pone perform_create del JWT, no lo que mande el body.
        self.assertEqual(response.data["id_empleado"], "empleado1")
        self.assertEqual(response.data["link_ticket"], "https://drive.example/x")

    def test_crear_sin_los_campos_nuevos_usa_moneda_mxp_por_default(self):
        request = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY})
        request.effective_scope = self.scope_empleado
        view = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["moneda"], "MXP")
        self.assertIsNone(response.data["sociedad"])

    def test_si_falla_la_subida_a_drive_no_deja_ticket_huerfano(self):
        # 07/Sep/2026 (bug real de tickets duplicados): si Drive no
        # responde, el ticket recien creado se borra en vez de quedar sin
        # imagen - asi un reintento del empleado nunca produce un
        # duplicado.
        with patch("tesoreria.views._subir_a_drive", return_value=(None, Response({"detail": "Drive no respondio"}, status=502))):
            request = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY})
            request.effective_scope = self.scope_empleado
            response = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.status_code, 502)
        self.assertEqual(TesoreriaTicketReembolso.objects.count(), 0)

    def test_empleado_solo_ve_sus_propios_tickets(self):
        # 31/Ago/2026 (auditoria de scope): antes era un filtro manual
        # ("tiene tesoreria.editar? ve todo : filtra por id_empleado");
        # ahora es SCOPE_FIELD_IDENTITY del ScopedManager - mismo resultado
        # para este caso, pero por el mecanismo real de RLS.
        request1 = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY})
        request1.effective_scope = self.scope_empleado
        TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request1)

        otro_empleado = EffectiveScope(is_global=False, identity_user_id="empleado2")
        request2 = self._post_crear(
            {"conceptos": [{"descripcion": "Comida", "monto": "200.00"}], "fecha_gasto": self.HOY}
        )
        request2.effective_scope = otro_empleado
        TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request2)

        request = self.factory.get("/api/tickets-reembolso/")
        request.effective_scope = self.scope_empleado
        response = TesoreriaTicketReembolsoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_empleado"], "empleado1")

    def test_staff_acotado_a_una_sociedad_no_ve_tickets_de_otra(self):
        # 31/Ago/2026 (auditoria de scope, caso real: colaborador externo
        # tipo contador con tesoreria.editar acotado a una sola sociedad) -
        # antes CUALQUIERA con tesoreria.editar veia TODOS los tickets sin
        # importar su alcance; ahora respeta sociedad/centro igual que el
        # resto del proyecto.
        request1 = self._post_crear(
            {"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY, "sociedad": RFC_TIZARA}
        )
        request1.effective_scope = self.scope_empleado
        TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request1)

        request2 = self._post_crear(
            {"conceptos": [{"descripcion": "Comida", "monto": "200.00"}], "fecha_gasto": self.HOY, "sociedad": RFC_CAPITAL}
        )
        request2.effective_scope = self.scope_empleado
        TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request2)

        staff_acotado = EffectiveScope(is_global=False, perm_keys=("tesoreria.editar",), sociedad_rfcs=(RFC_TIZARA,))
        request = self.factory.get("/api/tickets-reembolso/")
        request.effective_scope = staff_acotado
        response = TesoreriaTicketReembolsoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["sociedad"], RFC_TIZARA)

    def test_filtro_por_categoria_gasto_via_conceptos(self):
        # 11/Sep/2026, "filtro en las 4 pantallas" - la categoria vive en
        # TesoreriaTicketReembolsoConcepto, no en el ticket; el filtro debe
        # encontrar el ticket por "algun concepto tiene esta categoria" sin
        # duplicarlo si mas de un concepto coincide.
        request1 = self._post_crear(
            {
                "conceptos": [
                    {"descripcion": "Taxi", "monto": "150.00", "categoria_gasto": "TRANSPORTE"},
                    {"descripcion": "Comida", "monto": "100.00", "categoria_gasto": "ALIMENTOS"},
                ],
                "fecha_gasto": self.HOY,
            }
        )
        request1.effective_scope = self.scope_empleado
        TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request1)

        request2 = self._post_crear(
            {"conceptos": [{"descripcion": "Papelería", "monto": "50.00", "categoria_gasto": "PAPELERIA"}], "fecha_gasto": self.HOY}
        )
        request2.effective_scope = self.scope_empleado
        TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request2)

        request = self.factory.get("/api/tickets-reembolso/", {"categoria_gasto": "TRANSPORTE"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))
        response = TesoreriaTicketReembolsoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 1)

    def test_staff_global_ve_todos_los_tickets(self):
        request1 = self._post_crear(
            {"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY, "sociedad": RFC_TIZARA}
        )
        request1.effective_scope = self.scope_empleado
        TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(request1)

        staff_global = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))
        request = self.factory.get("/api/tickets-reembolso/")
        request.effective_scope = staff_global
        response = TesoreriaTicketReembolsoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 1)

    def test_aprobar_registra_autorizado_por_y_fecha(self):
        # 03/Sep/2026 (minuta: "se necesita autorizar antes de pagar") -
        # antes aprobar() solo cambiaba el estado, sin dejar rastro de quien
        # lo hizo.
        crear = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY})
        crear.effective_scope = self.scope_empleado
        creado = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(crear)

        aprobar = self.factory.post(f"/api/tickets-reembolso/{creado.data['id_ticket']}/aprobar/", {}, format="json")
        aprobar.effective_scope = EffectiveScope(
            is_global=True, perm_keys=("tesoreria.editar",), identity_user_id="tesorero1"
        )
        response = TesoreriaTicketReembolsoViewSet.as_view({"post": "aprobar"})(aprobar, pk=creado.data["id_ticket"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["autorizado_por"], "tesorero1")
        self.assertEqual(response.data["fecha_autorizacion"], date.today().isoformat())

    def test_sociedad_no_se_puede_corregir_despues_de_crear(self):
        # Regla de minuta 03/Sep/2026: "si se equivoca de sociedad ya
        # tampoco se acepta" - inmutable, ni Tesoreria la corrige.
        crear = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY, "sociedad": RFC_TIZARA})
        crear.effective_scope = self.scope_empleado
        creado = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(crear)

        patch = self.factory.patch(
            f"/api/tickets-reembolso/{creado.data['id_ticket']}/", {"sociedad": RFC_CAPITAL}, format="json"
        )
        patch.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))
        response = TesoreriaTicketReembolsoViewSet.as_view({"patch": "partial_update"})(
            patch, pk=creado.data["id_ticket"]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sociedad"], RFC_TIZARA)

    def test_moneda_no_se_puede_corregir_despues_de_crear(self):
        # 03/Sep/2026: Mariana amplio la regla de sociedad a moneda
        # tambien ("cualquier error de sociedad, tipo de moneda o falta de
        # ortografia... no se aceptara").
        crear = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY, "moneda": "USD"})
        crear.effective_scope = self.scope_empleado
        creado = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(crear)

        patch = self.factory.patch(
            f"/api/tickets-reembolso/{creado.data['id_ticket']}/", {"moneda": "EUR"}, format="json"
        )
        patch.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))
        response = TesoreriaTicketReembolsoViewSet.as_view({"patch": "partial_update"})(
            patch, pk=creado.data["id_ticket"]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["moneda"], "USD")

    def test_fecha_limite_expone_la_ventana_real(self):
        # 03/Sep/2026 (pedido de Mariana: "que se coloque el dia/mes/año de
        # hasta cuando se aceptan" en vez de solo texto generico); campos
        # reemplazados 04/Sep/2026 junto con la regla.
        request = self.factory.get("/api/tickets-reembolso/fecha_limite/")
        request.effective_scope = self.scope_empleado
        response = TesoreriaTicketReembolsoViewSet.as_view({"get": "fecha_limite"})(request)
        self.assertEqual(response.status_code, 200)
        self.assertIn("dias_permitidos", response.data)
        self.assertIn("hoy_en_dias_permitidos", response.data)
        self.assertIn("es_ultimo_dia_habil", response.data)
        self.assertIn("ventana_cerrada_por_hora", response.data)

    def test_ver_ticket_de_otro_empleado_no_es_visible(self):
        # get_object() usa el mismo scope que list - un empleado no puede
        # ver el ticket de otro via ver_ticket.
        creado = self._post_crear({"conceptos": self.UN_CONCEPTO, "fecha_gasto": self.HOY})
        creado.effective_scope = self.scope_empleado
        ticket = TesoreriaTicketReembolsoViewSet.as_view({"post": "create"})(creado)

        otro_empleado = EffectiveScope(is_global=False, identity_user_id="empleado2")
        request = self.factory.get(f"/api/tickets-reembolso/{ticket.data['id_ticket']}/ver_ticket/")
        request.effective_scope = otro_empleado
        response = TesoreriaTicketReembolsoViewSet.as_view({"get": "ver_ticket"})(
            request, pk=ticket.data["id_ticket"]
        )
        self.assertEqual(response.status_code, 404)


class TesoreriaFechaLimiteReembolsoTests(TestCase):
    """Ventana mensual de reembolsos (minuta 03/Sep/2026, regla reemplazada
    04/Sep/2026 - ver docstring de reembolso_utils): en cualquier dia del
    mes se acepta fecha_gasto del mismo mes (nunca de otro, sin periodo de
    gracia); en los ultimos 2 dias habiles del mes la regla se estrecha a
    "solo ese mismo dia"; el ultimo dia habil ademas solo recibe hasta
    mediodia.

    Usa la funcion pura de reembolso_utils directamente - septiembre 2026
    es el mes de referencia porque es el ejemplo real dado por Mariana:
    29 y 30 son los ultimos 2 dias habiles (29 = penultimo, 30 = ultimo).

    requests.get se mockea para toda la clase (falla siempre) - sin esto,
    la sincronizacion perezosa de festivos (ver
    reembolso_utils._dias_habiles_del_mes) haria una llamada de red real a
    Nager.Date en cada test. Al fallar el mock, se ejerce el camino
    fail-open (sigue sin festivos ese año) salvo en el test que ya
    precarga uno a mano."""

    def setUp(self):
        parche = patch("tesoreria.reembolso_utils.requests.get", side_effect=requests.RequestException("sin red"))
        self.mock_requests_get = parche.start()
        self.addCleanup(parche.stop)

    def test_ultimos_dos_dias_habiles_de_septiembre_2026(self):
        ultimos_dos = ultimos_dos_dias_habiles(2026, 9)
        self.assertEqual(ultimos_dos, [date(2026, 9, 29), date(2026, 9, 30)])

    def test_festivo_oficial_se_excluye_del_calculo(self):
        # 16 de septiembre (martes) declarado festivo -> deja de contar
        # como habil; aqui solo se verifica que no aparezca en los ultimos
        # 2 dias habiles de septiembre completo.
        TesoreriaDiaFestivo.objects.create(fecha=date(2026, 9, 16), descripcion="Independencia")
        ultimos_dos = ultimos_dos_dias_habiles(2026, 9)
        self.assertNotIn(date(2026, 9, 16), ultimos_dos)

    def test_gasto_del_mes_en_curso_se_acepta_fuera_de_los_ultimos_2_dias(self):
        # Hoy 15, gasto del 10 - dia normal del mes, cualquier fecha del
        # mismo mes/año se acepta (no exige "mismo dia").
        ahora = datetime(2026, 9, 15, 10, 0)
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 10))
        self.assertIsNone(error)

    def test_gasto_de_mes_distinto_nunca_se_acepta_sin_periodo_de_gracia(self):
        # 04/Sep/2026: "en ningun caso" - ya no hay gracia para el mes
        # anterior, ni siquiera si la fecha cae en lo que hubieran sido los
        # ultimos 2 dias habiles de ese mes.
        ahora = datetime(2026, 9, 15, 10, 0)
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 8, 30))
        self.assertIsNotNone(error)

    def test_gasto_con_fecha_futura_nunca_se_acepta(self):
        # 03/Sep/2026 (bug real reportado por Mariana): un dia futuro
        # DENTRO del mes en curso se colaba porque el chequeo de "mismo
        # mes que hoy" se evaluaba antes que el de futuro.
        ahora = datetime(2026, 9, 3, 10, 0)
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 30))
        self.assertIsNotNone(error)

    def test_penultimo_dia_habil_solo_acepta_gasto_de_ese_mismo_dia(self):
        # 04/Sep/2026, ejemplo real de Mariana: "el 29 de septiembre puede
        # subir una factura del 29 de septiembre pero no del 28".
        ahora = datetime(2026, 9, 29, 10, 0)
        self.assertIsNone(validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 29)))
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 28))
        self.assertIsNotNone(error)

    def test_ultimo_dia_habil_acepta_gasto_del_mismo_dia_antes_de_mediodia(self):
        ahora = datetime(2026, 9, 30, 11, 59)
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 30))
        self.assertIsNone(error)

    def test_ultimo_dia_habil_rechaza_despues_de_mediodia(self):
        # 04/Sep/2026: "el ultimo dia... solo hasta medio dia".
        ahora = datetime(2026, 9, 30, 12, 1)
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 30))
        self.assertIsNotNone(error)

    def test_ultimo_dia_habil_a_mediodia_exacto_ya_no_se_acepta(self):
        # Limite inclusivo del lado de "abierto": 12:00:00 en punto ya
        # cuenta como pasado el corte (se compara con time(12, 0), > no >=,
        # pero 12:00:00.000000 no es > 12:00 asi que sigue aceptando - este
        # test documenta el borde exacto: 12:00 todavia pasa.
        ahora = datetime(2026, 9, 30, 12, 0)
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 30))
        self.assertIsNone(error)

    def test_ultimo_dia_habil_rechaza_gasto_de_un_dia_distinto(self):
        # El ultimo dia (30) tambien exige "mismo dia" - un gasto del 29
        # (el otro dia de la ventana estrecha) ya no se acepta el 30.
        ahora = datetime(2026, 9, 30, 9, 0)
        error = validar_fecha_limite(ahora, fecha_gasto=date(2026, 9, 29))
        self.assertIsNotNone(error)


class TesoreriaSolicitudPagoCrudTests(TestCase):
    """Solicitud de pago de servicios/licencias/renovaciones (04/Sep/2026,
    ver docstring del modelo/ViewSet). A diferencia de Reembolso, `crear`
    exige un permiso real (`solicitud-pago.crear`), no es self-service
    abierto a cualquier empleado."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_solicitante = EffectiveScope(
            is_global=True, perm_keys=("solicitud-pago.crear",), identity_user_id="analista1"
        )
        self.scope_aprobador = EffectiveScope(
            is_global=True, perm_keys=("solicitud-pago.aprobar", "solicitud-pago.editar"), identity_user_id="manager1"
        )

    def _crear(self, **overrides):
        body = {
            "proyecto": "PRYA",
            "tipo": "LICENCIA",
            "descripcion": "Refrendo de licencia de uso de suelo",
            "monto": "5000.00",
            **overrides,
        }
        request = self.factory.post("/api/solicitudes-pago/", body, format="json")
        request.effective_scope = self.scope_solicitante
        return TesoreriaSolicitudPagoViewSet.as_view({"post": "create"})(request)

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/solicitudes-pago/",
            {"proyecto": "PRYA", "tipo": "LICENCIA", "descripcion": "x", "monto": "100.00"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        response = TesoreriaSolicitudPagoViewSet.as_view({"post": "create"})(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_registra_solicitado_por_del_jwt(self):
        response = self._crear()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["solicitado_por"], "analista1")
        self.assertEqual(response.data["estado"], "PENDIENTE")
        self.assertIsNone(response.data["factura"])

    def test_aprobar_sin_permiso_solicitud_pago_aprobar_da_403(self):
        # TESORERIA_ANALISTA tiene .crear pero NO .aprobar (separacion de
        # funciones, ver permission_matrix.py) - solo se solicita a si
        # mismo, no se auto-aprueba.
        creado = self._crear()
        request = self.factory.post(f"/api/solicitudes-pago/{creado.data['id_solicitud']}/aprobar/", {}, format="json")
        request.effective_scope = self.scope_solicitante
        response = TesoreriaSolicitudPagoViewSet.as_view({"post": "aprobar"})(request, pk=creado.data["id_solicitud"])
        self.assertEqual(response.status_code, 403)

    def test_aprobar_registra_autorizado_por_y_fecha(self):
        creado = self._crear()
        request = self.factory.post(f"/api/solicitudes-pago/{creado.data['id_solicitud']}/aprobar/", {}, format="json")
        request.effective_scope = self.scope_aprobador
        response = TesoreriaSolicitudPagoViewSet.as_view({"post": "aprobar"})(request, pk=creado.data["id_solicitud"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "APROBADO")
        self.assertEqual(response.data["autorizado_por"], "manager1")
        self.assertEqual(response.data["fecha_autorizacion"], date.today().isoformat())

    def test_vincular_flujo_sin_factura_pasa_a_pagado(self):
        # Comprobante OPCIONAL (pagos a gobierno a veces sin CFDI formal) -
        # se puede llegar a PAGADO sin haber ligado ninguna factura.
        creado = self._crear()
        aprobar = self.factory.post(f"/api/solicitudes-pago/{creado.data['id_solicitud']}/aprobar/", {}, format="json")
        aprobar.effective_scope = self.scope_aprobador
        TesoreriaSolicitudPagoViewSet.as_view({"post": "aprobar"})(aprobar, pk=creado.data["id_solicitud"])

        contraparte = TesoreriaContraparte.objects.create(
            razon_social="Municipio de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="m@m.com"
        )
        contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        banco = TesoreriaBanco.objects.create(id_banxico="00003", banco="Banamex", alias="BMX")
        cuenta = TesoreriaCuenta.objects.create(
            banco=banco, clabe="002180000000000003", alias="Cuenta operativa", apertura="2026-01-01"
        )
        flujo = TesoreriaFlujo.objects.create(id_flujo="FLU-000001", contrato=contrato, cuenta=cuenta)
        request = self.factory.post(
            f"/api/solicitudes-pago/{creado.data['id_solicitud']}/vincular_flujo/",
            {"flujo": flujo.id_flujo},
            format="json",
        )
        request.effective_scope = self.scope_aprobador
        response = TesoreriaSolicitudPagoViewSet.as_view({"post": "vincular_flujo"})(
            request, pk=creado.data["id_solicitud"]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "PAGADO")
        self.assertIsNone(response.data["factura"])

    def test_sociedad_no_se_puede_corregir_despues_de_crear(self):
        creado = self._crear(sociedad="CIF010101AAA")
        request = self.factory.patch(
            f"/api/solicitudes-pago/{creado.data['id_solicitud']}/", {"sociedad": "CAP010101AAA"}, format="json"
        )
        request.effective_scope = self.scope_aprobador
        response = TesoreriaSolicitudPagoViewSet.as_view({"patch": "partial_update"})(
            request, pk=creado.data["id_solicitud"]
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sociedad"], "CIF010101AAA")

    def test_filtro_por_proyecto(self):
        self._crear(proyecto="P01")
        self._crear(proyecto="P02")
        request = self.factory.get("/api/solicitudes-pago/?proyecto=P01")
        request.effective_scope = self.scope_aprobador
        response = TesoreriaSolicitudPagoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["proyecto"], "P01")


class TesoreriaContratoDocumentoScopeTests(TestCase):
    """31/Ago/2026 (auditoria de scope): get_queryset() solo filtraba por
    el ?contrato=<id> tal cual venia en la URL, sin validar que ESE
    contrato estuviera dentro del alcance del usuario - cualquiera con
    tesoreria.crear/editar/aprobar podia pedir el checklist de cualquier
    contrato con solo saber su id, y sin ?contrato= regresaba TODO."""

    def setUp(self):
        self.factory = APIRequestFactory()
        contraparte = TesoreriaContraparte.objects.create(
            razon_social="Contraparte de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.contrato_tizara = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        self.contrato_capital = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_CAPITAL}-{contraparte.id_contraparte}-001",
            sociedad=RFC_CAPITAL,
            contraparte=contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        TesoreriaContratoDocumento.objects.create(
            contrato=self.contrato_tizara, nombre=TesoreriaContratoDocumento.NOMBRE_CONTRATO_FIRMADO
        )
        TesoreriaContratoDocumento.objects.create(
            contrato=self.contrato_capital, nombre=TesoreriaContratoDocumento.NOMBRE_CONTRATO_FIRMADO
        )

    def test_sin_filtro_de_contrato_no_regresa_nada(self):
        request = self.factory.get("/api/contratos-documentos/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        response = TesoreriaContratoDocumentoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 0)

    def test_usuario_de_una_sociedad_no_puede_pedir_checklist_de_otra(self):
        request = self.factory.get(f"/api/contratos-documentos/?contrato={self.contrato_capital.id_contrato}")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        response = TesoreriaContratoDocumentoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 0)

    def test_usuario_de_la_sociedad_correcta_si_ve_su_checklist(self):
        request = self.factory.get(f"/api/contratos-documentos/?contrato={self.contrato_tizara.id_contrato}")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        response = TesoreriaContratoDocumentoViewSet.as_view({"get": "list"})(request)
        self.assertEqual(len(response.data), 1)


class TesoreriaTicketProveedorScopeTests(TestCase):
    """31/Ago/2026 ("los tickets de cliente si se filtran automaticamente?"
    -> "hay que hacer ese filtro por sociedad y proyecto") - antes
    `.all()` sin RLS, cualquiera con tesoreria.crear/editar veia los
    tickets de todos los proveedores."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))

    def _crear_ticket(self, sociedad, proyecto="", scope=None):
        request = self.factory.post(
            "/api/tickets-proveedor/",
            {
                "contraparte": self.contraparte.id_contraparte,
                "email": "proveedor@ejemplo.com",
                "sociedad": sociedad,
                "proyecto": proyecto,
                "expires_at": "2027-01-01T00:00:00Z",
                "max_uses": 1,
                "issued_by": "u001",
            },
            format="json",
        )
        request.effective_scope = scope or self.scope_crear
        view = TesoreriaTicketProveedorViewSet.as_view({"post": "create"})
        return view(request)

    def test_usuario_de_una_sociedad_no_ve_tickets_de_otra(self):
        self._crear_ticket(RFC_TIZARA)
        self._crear_ticket(RFC_CAPITAL)

        request = self.factory.get("/api/tickets-proveedor/")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        view = TesoreriaTicketProveedorViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["sociedad"], RFC_TIZARA)

    def test_usuario_de_un_proyecto_no_ve_tickets_de_otro(self):
        self._crear_ticket(RFC_TIZARA, proyecto="P01")
        self._crear_ticket(RFC_TIZARA, proyecto="P02")

        request = self.factory.get("/api/tickets-proveedor/")
        request.effective_scope = EffectiveScope(is_global=False, proyecto_ids=("P01",))
        view = TesoreriaTicketProveedorViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["proyecto"], "P01")

    def test_filtro_sociedad_acota_dentro_del_scope_union(self):
        # 31/Ago/2026 (pedido de Mariana: "igual en tickets debe tener
        # filtro") - un usuario con acceso a AMBAS sociedades puede acotar
        # la vista a una sola sin cambiar su alcance real.
        self._crear_ticket(RFC_TIZARA)
        self._crear_ticket(RFC_CAPITAL)

        request = self.factory.get(f"/api/tickets-proveedor/?sociedad={RFC_TIZARA}")
        request.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA, RFC_CAPITAL))
        view = TesoreriaTicketProveedorViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["sociedad"], RFC_TIZARA)

    def test_global_ve_todos(self):
        self._crear_ticket(RFC_TIZARA)
        self._crear_ticket(RFC_CAPITAL)

        request = self.factory.get("/api/tickets-proveedor/")
        request.effective_scope = EffectiveScope(is_global=True)
        view = TesoreriaTicketProveedorViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 2)

    def test_validar_publico_no_depende_del_scope(self):
        # "validar" (sin sesion, canjea por token) no debe pasar por
        # get_queryset/for_scope - un proveedor externo no trae ningun
        # scope propio.
        creado = self._crear_ticket(RFC_TIZARA)
        token = creado.data["token"]

        request = self.factory.post("/api/tickets-proveedor/validar/", {"token": token}, format="json")
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaTicketProveedorViewSet.as_view({"post": "validar"})
        response = view(request)
        self.assertEqual(response.status_code, 200)


class TesoreriaTicketProveedorSubirFacturaTests(TestCase):
    """subir_factura publico - el proveedor sube su factura (PDF) sin
    sesion, canjeando el token del link."""

    def setUp(self):
        self.factory = APIRequestFactory()
        # Este entorno trae una RECAPTCHA_SECRET_KEY real configurada
        # (hallazgo real 07/Sep/2026, mismo patron que las credenciales
        # reales de Gmail/Drive) - sin este mock, "modo simulado" no
        # aplica y cualquier token de prueba se rechaza de verdad contra
        # la API de Google.
        parche_recaptcha = patch("tesoreria.views.recaptcha.verificar", return_value=True)
        parche_recaptcha.start()
        self.addCleanup(parche_recaptcha.stop)
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        token, token_hash = generate_token()
        self.token = token
        self.ticket = TesoreriaTicketProveedor.objects.create(
            contraparte=self.contraparte,
            email="proveedor@ejemplo.com",
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(hours=1),
            max_uses=1,
        )

    def _post(self, archivos):
        data = {"token": self.token, "recaptcha_token": "cualquier-token-no-vacio", **archivos}
        request = self.factory.post("/api/tickets-proveedor/subir_factura/", data, format="multipart")
        request.effective_scope = EffectiveScope.anonymous()
        view = TesoreriaTicketProveedorViewSet.as_view({"post": "subir_factura"})
        return view(request)

    def test_sin_pdf_da_400(self):
        response = self._post({})
        self.assertEqual(response.status_code, 400)

    def test_solo_pdf_sigue_funcionando(self):
        pdf = SimpleUploadedFile("factura.pdf", b"contenido-pdf", content_type="application/pdf")
        with patch(
            "tesoreria.views._subir_a_drive",
            return_value=({"web_view_link": "https://drive.example/pdf", "file_id": "pdf-1", "mime_type": "application/pdf"}, None),
        ) as mock_subir:
            response = self._post({"file": pdf})
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["pdf"])
        mock_subir.assert_called_once()

    def test_cada_ticket_sube_a_su_propia_subcarpeta_por_id_ticket(self):
        """08/Sep/2026, "seria por registro de solicitud como se hace ahora
        pero que de la contraparte dentro se creen subcarpetas donde se
        iran metiendo cada que se genere una" - una misma contraparte (ej.
        IZEL) puede facturar desde varias unidades de negocio sin un
        catalogo fijo de cuales son; cada ticket ya es su propia solicitud
        con su propio id, asi que su subcarpeta usa ese id, nunca la
        carpeta raiz compartida del proveedor."""
        pdf = SimpleUploadedFile("factura.pdf", b"contenido-pdf", content_type="application/pdf")
        with patch(
            "tesoreria.views._subir_a_drive",
            return_value=({"web_view_link": "https://drive.example/pdf", "file_id": "pdf-1", "mime_type": "application/pdf"}, None),
        ) as mock_subir:
            response = self._post({"file": pdf})
        self.assertEqual(response.status_code, 200)
        carpeta = mock_subir.call_args.args[2]
        self.assertTrue(carpeta.endswith(f"/{self.contraparte.id_contraparte}/{self.ticket.id_ticket}"))

    def test_guarda_drive_file_id_del_pdf_recibido(self):
        pdf = SimpleUploadedFile("factura.pdf", b"contenido-pdf", content_type="application/pdf")
        with patch(
            "tesoreria.views._subir_a_drive",
            return_value=({"web_view_link": "https://drive.example/pdf", "file_id": "pdf-real-1", "mime_type": "application/pdf"}, None),
        ):
            response = self._post({"file": pdf})
        self.assertEqual(response.status_code, 200)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.drive_file_id_pdf, "pdf-real-1")
        self.assertEqual(self.ticket.mime_type_pdf, "application/pdf")


class TesoreriaTicketProveedorVerPdfTests(TestCase):
    """ver_pdf (09/Sep/2026, "los documentos ya estan en Drive deben
    traerse de ahi") - debe funcionar apenas se recibio el archivo, sin
    esperar a que exista una TesoreriaFactura ni a que corra el Motor
    Documental."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        _, token_hash = generate_token()
        self.ticket = TesoreriaTicketProveedor.objects.create(
            contraparte=self.contraparte,
            email="proveedor@ejemplo.com",
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(hours=1),
            max_uses=1,
        )

    def _ver_pdf(self):
        request = self.factory.get(f"/api/tickets-proveedor/{self.ticket.id_ticket}/ver_pdf/")
        request.effective_scope = self.scope
        view = TesoreriaTicketProveedorViewSet.as_view({"get": "ver_pdf"})
        return view(request, pk=self.ticket.id_ticket)

    def test_404_si_todavia_no_se_ha_recibido_ningun_archivo(self):
        response = self._ver_pdf()
        self.assertEqual(response.status_code, 404)

    def test_sirve_el_archivo_sin_necesitar_factura_ni_motor_documental(self):
        self.ticket.drive_file_id_pdf = "pdf-real-1"
        self.ticket.mime_type_pdf = "application/pdf"
        self.ticket.save(update_fields=["drive_file_id_pdf", "mime_type_pdf"])
        contenido_falso = MagicMock()
        contenido_falso.status_code = 200
        contenido_falso.headers = {"Content-Type": "application/pdf"}
        contenido_falso.iter_content = lambda chunk_size: iter([b"%PDF-contenido"])
        with patch("tesoreria.views.requests.get", return_value=contenido_falso):
            response = self._ver_pdf()
        self.assertEqual(response.status_code, 200)


class TesoreriaTicketProveedorSubirXmlTests(TestCase):
    """subir_factura con 'file_xml' opcional (09/Sep/2026, "que el ticket
    del proveedor tambien acepte subir el XML")."""

    def setUp(self):
        self.factory = APIRequestFactory()
        parche_recaptcha = patch("tesoreria.views.recaptcha.verificar", return_value=True)
        parche_recaptcha.start()
        self.addCleanup(parche_recaptcha.stop)
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        token, token_hash = generate_token()
        self.token = token
        self.ticket = TesoreriaTicketProveedor.objects.create(
            contraparte=self.contraparte,
            email="proveedor@ejemplo.com",
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(hours=1),
            max_uses=1,
        )

    def test_sube_xml_junto_con_el_pdf(self):
        pdf = SimpleUploadedFile("factura.pdf", b"contenido-pdf", content_type="application/pdf")
        xml = SimpleUploadedFile("factura.xml", b"<cfdi/>", content_type="application/xml")

        def subir_falso(request, archivo, carpeta):
            return {"file_id": f"drive-{archivo.name}", "mime_type": archivo.content_type}, None

        data = {"token": self.token, "recaptcha_token": "cualquier-token", "file": pdf, "file_xml": xml}
        request = self.factory.post("/api/tickets-proveedor/subir_factura/", data, format="multipart")
        request.effective_scope = EffectiveScope.anonymous()
        with patch("tesoreria.views._subir_a_drive", side_effect=subir_falso):
            view = TesoreriaTicketProveedorViewSet.as_view({"post": "subir_factura"})
            response = view(request)
        self.assertEqual(response.status_code, 200)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.drive_file_id_pdf, "drive-factura.pdf")
        self.assertEqual(self.ticket.drive_file_id_xml, "drive-factura.xml")

    def test_sin_xml_sigue_funcionando_solo_con_pdf(self):
        pdf = SimpleUploadedFile("factura.pdf", b"contenido-pdf", content_type="application/pdf")
        data = {"token": self.token, "recaptcha_token": "cualquier-token", "file": pdf}
        request = self.factory.post("/api/tickets-proveedor/subir_factura/", data, format="multipart")
        request.effective_scope = EffectiveScope.anonymous()
        with patch(
            "tesoreria.views._subir_a_drive",
            return_value=({"file_id": "pdf-1", "mime_type": "application/pdf"}, None),
        ):
            view = TesoreriaTicketProveedorViewSet.as_view({"post": "subir_factura"})
            response = view(request)
        self.assertEqual(response.status_code, 200)
        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.drive_file_id_xml)


class TesoreriaTicketProveedorVerXmlTests(TestCase):
    """ver_xml del ticket - mismo criterio que ver_pdf."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        _, token_hash = generate_token()
        self.ticket = TesoreriaTicketProveedor.objects.create(
            contraparte=self.contraparte,
            email="proveedor@ejemplo.com",
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(hours=1),
            max_uses=1,
        )

    def test_404_sin_xml_recibido(self):
        request = self.factory.get(f"/api/tickets-proveedor/{self.ticket.id_ticket}/ver_xml/")
        request.effective_scope = self.scope
        view = TesoreriaTicketProveedorViewSet.as_view({"get": "ver_xml"})
        response = view(request, pk=self.ticket.id_ticket)
        self.assertEqual(response.status_code, 404)

    def test_sirve_el_xml_recibido(self):
        self.ticket.drive_file_id_xml = "xml-real-1"
        self.ticket.mime_type_xml = "application/xml"
        self.ticket.save(update_fields=["drive_file_id_xml", "mime_type_xml"])
        contenido_falso = MagicMock()
        contenido_falso.status_code = 200
        contenido_falso.headers = {"Content-Type": "application/xml"}
        contenido_falso.iter_content = lambda chunk_size: iter([b"<cfdi/>"])
        with patch("tesoreria.views.requests.get", return_value=contenido_falso):
            request = self.factory.get(f"/api/tickets-proveedor/{self.ticket.id_ticket}/ver_xml/")
            request.effective_scope = self.scope
            view = TesoreriaTicketProveedorViewSet.as_view({"get": "ver_xml"})
            response = view(request, pk=self.ticket.id_ticket)
        self.assertEqual(response.status_code, 200)


class TesoreriaTicketProveedorSincronizarDriveTests(TestCase):
    """sincronizar_drive (09/Sep/2026, boton temporal: "eso esta en drive,
    pon el boton de sincronizacion temporal") - liga PDF/XML que ya estan
    en la carpeta de Drive del ticket pero nunca pasaron por
    subir_factura() (ej. alguien los subio a mano en drive.google.com)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("tesoreria.crear",))
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Proveedor de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="p@p.com"
        )
        _, token_hash = generate_token()
        self.ticket = TesoreriaTicketProveedor.objects.create(
            contraparte=self.contraparte,
            email="proveedor@ejemplo.com",
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(hours=1),
            max_uses=1,
        )

    def _sincronizar(self):
        request = self.factory.post(f"/api/tickets-proveedor/{self.ticket.id_ticket}/sincronizar_drive/")
        request.effective_scope = self.scope
        view = TesoreriaTicketProveedorViewSet.as_view({"post": "sincronizar_drive"})
        return view(request, pk=self.ticket.id_ticket)

    def test_liga_pdf_y_xml_encontrados_en_la_carpeta(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {
            "archivos": [
                {"file_id": "drive-1", "nombre": "factura.pdf", "mime_type": "application/pdf"},
                {"file_id": "drive-2", "nombre": "factura.xml", "mime_type": "application/xml"},
            ]
        }
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            response = self._sincronizar()
        self.assertEqual(response.status_code, 200)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.drive_file_id_pdf, "drive-1")
        self.assertEqual(self.ticket.drive_file_id_xml, "drive-2")

    def test_404_si_la_carpeta_no_tiene_pdf_ni_xml(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {"archivos": [{"file_id": "d1", "nombre": "notas.txt", "mime_type": "text/plain"}]}
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            response = self._sincronizar()
        self.assertEqual(response.status_code, 404)


class TesoreriaFacturaSincronizarDriveTests(TestCase):
    """sincronizar_drive de una factura ya creada (09/Sep/2026, "en
    factura no veo el actualizar") - revisa primero su propia carpeta y,
    si no hay nada, la del ticket de origen."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.leer",))
        self.factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-sync-1", comprobante_folio="F-1")

    def _sincronizar(self):
        request = self.factory.post(f"/api/facturas/{self.factura.pk}/sincronizar_drive/")
        request.effective_scope = self.scope
        view = TesoreriaFacturaViewSet.as_view({"post": "sincronizar_drive"})
        return view(request, pk=self.factura.pk)

    def test_liga_pdf_y_xml_de_la_carpeta_propia(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {
            "archivos": [
                {"file_id": "drive-pdf", "nombre": "factura.pdf", "mime_type": "application/pdf"},
                {"file_id": "drive-xml", "nombre": "factura.xml", "mime_type": "application/xml"},
            ]
        }
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            response = self._sincronizar()
        self.assertEqual(response.status_code, 200)
        self.factura.refresh_from_db()
        self.assertEqual(self.factura.drive_file_id_pdf, "drive-pdf")
        self.assertEqual(self.factura.drive_file_id_xml, "drive-xml")

    def test_404_si_no_hay_nada_en_ninguna_carpeta(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {"archivos": []}
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            response = self._sincronizar()
        self.assertEqual(response.status_code, 404)

    def test_error_real_de_drive_no_se_confunde_con_404_generico(self):
        # 09/Sep/2026, hallazgo real: un error de verdad (permiso, cuota,
        # 502) se estaba tragando en silencio y devolviendo el mismo 404
        # generico de "no hay archivos" - imposible de diagnosticar.
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 502
        respuesta_falsa.content = b'{"detail": "El servicio de Drive no respondio"}'
        respuesta_falsa.json.return_value = {"detail": "El servicio de Drive no respondio"}
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            response = self._sincronizar()
        self.assertEqual(response.status_code, 502)
        self.assertIn("Drive", response.data["detail"])


class TesoreriaComplementoPagoDriveTests(TestCase):
    """ver_pdf/ver_xml/sincronizar_drive de ComplementoPago (10/Sep/2026) -
    mismo patron real que TesoreriaFactura, ver comentario equivalente."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.leer",))
        self.complemento = TesoreriaComplementoPago.objects.create(timbre_uuid="uuid-comp-drive", folio="C-1")

    def test_ver_pdf_sin_drive_file_id_da_404(self):
        request = self.factory.get(f"/api/complementos-pago/{self.complemento.pk}/ver_pdf/")
        request.effective_scope = self.scope
        view = TesoreriaComplementoPagoViewSet.as_view({"get": "ver_pdf"})
        response = view(request, pk=self.complemento.pk)
        self.assertEqual(response.status_code, 404)

    def test_ver_xml_sin_drive_file_id_da_404(self):
        request = self.factory.get(f"/api/complementos-pago/{self.complemento.pk}/ver_xml/")
        request.effective_scope = self.scope
        view = TesoreriaComplementoPagoViewSet.as_view({"get": "ver_xml"})
        response = view(request, pk=self.complemento.pk)
        self.assertEqual(response.status_code, 404)

    def test_sincronizar_drive_liga_pdf_y_xml(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {
            "archivos": [
                {"file_id": "drive-pdf", "nombre": "complemento.pdf", "mime_type": "application/pdf"},
                {"file_id": "drive-xml", "nombre": "complemento.xml", "mime_type": "application/xml"},
            ]
        }
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            request = self.factory.post(f"/api/complementos-pago/{self.complemento.pk}/sincronizar_drive/")
            request.effective_scope = self.scope
            view = TesoreriaComplementoPagoViewSet.as_view({"post": "sincronizar_drive"})
            response = view(request, pk=self.complemento.pk)
        self.assertEqual(response.status_code, 200)
        self.complemento.refresh_from_db()
        self.assertEqual(self.complemento.drive_file_id_pdf, "drive-pdf")
        self.assertEqual(self.complemento.drive_file_id_xml, "drive-xml")

    def test_sincronizar_drive_404_si_no_hay_nada(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {"archivos": []}
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            request = self.factory.post(f"/api/complementos-pago/{self.complemento.pk}/sincronizar_drive/")
            request.effective_scope = self.scope
            view = TesoreriaComplementoPagoViewSet.as_view({"post": "sincronizar_drive"})
            response = view(request, pk=self.complemento.pk)
        self.assertEqual(response.status_code, 404)


class TesoreriaNotaCreditoDriveTests(TestCase):
    """ver_pdf/ver_xml/sincronizar_drive de NotaCredito (10/Sep/2026) -
    mismo patron real que TesoreriaFactura, ver comentario equivalente."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.leer",))
        self.nota = TesoreriaNotaCredito.objects.create(timbre_uuid="uuid-nc-drive", comprobante_folio="N-1")

    def test_ver_pdf_sin_drive_file_id_da_404(self):
        request = self.factory.get(f"/api/notas-credito/{self.nota.pk}/ver_pdf/")
        request.effective_scope = self.scope
        view = TesoreriaNotaCreditoViewSet.as_view({"get": "ver_pdf"})
        response = view(request, pk=self.nota.pk)
        self.assertEqual(response.status_code, 404)

    def test_ver_xml_sin_drive_file_id_da_404(self):
        request = self.factory.get(f"/api/notas-credito/{self.nota.pk}/ver_xml/")
        request.effective_scope = self.scope
        view = TesoreriaNotaCreditoViewSet.as_view({"get": "ver_xml"})
        response = view(request, pk=self.nota.pk)
        self.assertEqual(response.status_code, 404)

    def test_sincronizar_drive_liga_pdf_y_xml(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {
            "archivos": [
                {"file_id": "drive-pdf", "nombre": "nota.pdf", "mime_type": "application/pdf"},
                {"file_id": "drive-xml", "nombre": "nota.xml", "mime_type": "application/xml"},
            ]
        }
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            request = self.factory.post(f"/api/notas-credito/{self.nota.pk}/sincronizar_drive/")
            request.effective_scope = self.scope
            view = TesoreriaNotaCreditoViewSet.as_view({"post": "sincronizar_drive"})
            response = view(request, pk=self.nota.pk)
        self.assertEqual(response.status_code, 200)
        self.nota.refresh_from_db()
        self.assertEqual(self.nota.drive_file_id_pdf, "drive-pdf")
        self.assertEqual(self.nota.drive_file_id_xml, "drive-xml")

    def test_sincronizar_drive_404_si_no_hay_nada(self):
        respuesta_falsa = MagicMock()
        respuesta_falsa.status_code = 200
        respuesta_falsa.json.return_value = {"archivos": []}
        with patch("tesoreria.views.requests.get", return_value=respuesta_falsa):
            request = self.factory.post(f"/api/notas-credito/{self.nota.pk}/sincronizar_drive/")
            request.effective_scope = self.scope
            view = TesoreriaNotaCreditoViewSet.as_view({"post": "sincronizar_drive"})
            response = view(request, pk=self.nota.pk)
        self.assertEqual(response.status_code, 404)


class _RespuestaFalsa:
    """Doble minimo de requests.Response para mockear requests.get/post sin
    levantar servidores reales (drive-service/mail-service)."""

    def __init__(self, status_code, content=b"", headers=None, text=""):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}
        self.text = text


class TesoreriaEnviarFacturaAdjuntosTests(TestCase):
    """Adjuntar PDF/XML real en el envio de facturas (07/Sep/2026) - antes
    enviar_factura solo ponia los links en el cuerpo del correo. link_pdf/
    link_xml son URLs pegadas a mano (sin drive_file_id, no hay Drive de
    por medio para Facturas), asi que _descargar_adjunto le pega
    directo a esa URL con requests.get."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.factura = TesoreriaFactura.objects.create(
            timbre_uuid="uuid-adjuntos-1",
            comprobante_folio="F-1",
            comprobante_total=100,
            link_pdf="https://proveedor.example/factura.pdf",
            link_xml="https://proveedor.example/factura.xml",
        )

    def test_adjunta_pdf_y_xml_cuando_la_descarga_funciona(self):
        request = self.factory.get("/")
        with patch(
            "tesoreria.mail_utils.requests.get",
            return_value=_RespuestaFalsa(200, content=b"contenido-pdf", headers={"Content-Type": "application/pdf"}),
        ), patch(
            "tesoreria.mail_utils.requests.post", return_value=_RespuestaFalsa(201)
        ) as mock_post:
            resultado = mail_utils.enviar_factura(request, "cliente@ejemplo.com", self.factura)

        self.assertTrue(resultado)
        payload_enviado = mock_post.call_args.kwargs["json"]
        self.assertEqual(len(payload_enviado["adjuntos"]), 2)
        self.assertEqual(payload_enviado["adjuntos"][0]["filename"], "F-1.pdf")
        self.assertEqual(payload_enviado["adjuntos"][1]["filename"], "F-1.xml")

    def test_si_falla_la_descarga_se_manda_sin_adjuntos_sin_bloquear_el_envio(self):
        # fail-open: un PDF/XML que no se pudo descargar no debe tumbar el
        # envio completo - el correo ya trae los links de respaldo en el
        # cuerpo (_renderizar_factura).
        request = self.factory.get("/")
        with patch(
            "tesoreria.mail_utils.requests.get", side_effect=requests.RequestException("sin red")
        ), patch(
            "tesoreria.mail_utils.requests.post", return_value=_RespuestaFalsa(201)
        ) as mock_post:
            resultado = mail_utils.enviar_factura(request, "cliente@ejemplo.com", self.factura)

        self.assertTrue(resultado)
        payload_enviado = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload_enviado["adjuntos"], [])

    def test_adjunto_que_excede_el_tamano_maximo_se_descarta(self):
        contenido_grande = b"x" * (mail_utils._TAMANO_MAXIMO_ADJUNTO_BYTES + 1)
        request = self.factory.get("/")
        with patch(
            "tesoreria.mail_utils.requests.get",
            return_value=_RespuestaFalsa(200, content=contenido_grande, headers={"Content-Type": "application/pdf"}),
        ), patch(
            "tesoreria.mail_utils.requests.post", return_value=_RespuestaFalsa(201)
        ) as mock_post:
            resultado = mail_utils.enviar_factura(request, "cliente@ejemplo.com", self.factura)

        self.assertTrue(resultado)
        payload_enviado = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload_enviado["adjuntos"], [])

    def test_prefiere_drive_file_id_sobre_link_externo(self):
        # 07/Sep/2026 - cuando la factura ya tiene drive_file_id_pdf (Motor
        # Documental la ligo, ver TesoreriaFacturaViewSet.confirmar_extraccion),
        # debe descargarse via drive-service autenticado, NO via el link
        # externo aunque tambien exista (compatibilidad historica).
        self.factura.drive_file_id_pdf = "drive-real-1"
        self.factura.mime_type_pdf = "application/pdf"
        self.factura.save(update_fields=["drive_file_id_pdf", "mime_type_pdf"])

        request = self.factory.get("/")
        with patch(
            "tesoreria.mail_utils.requests.get",
            return_value=_RespuestaFalsa(200, content=b"contenido-real-de-drive", headers={"Content-Type": "application/pdf"}),
        ) as mock_get, patch(
            "tesoreria.mail_utils.requests.post", return_value=_RespuestaFalsa(201)
        ) as mock_post:
            resultado = mail_utils.enviar_factura(request, "cliente@ejemplo.com", self.factura)

        self.assertTrue(resultado)
        # El PDF se pidio a drive-service por file_id (no a la URL externa
        # de link_pdf, que ni siquiera se toca) - el XML sigue via link
        # externo porque esta factura no tiene drive_file_id_xml.
        urls_llamadas = [llamada.args[0] for llamada in mock_get.call_args_list]
        self.assertTrue(any("drive-real-1" in u for u in urls_llamadas))
        self.assertFalse(any("proveedor.example/factura.pdf" in u for u in urls_llamadas))
        payload_enviado = mock_post.call_args.kwargs["json"]
        self.assertEqual(len(payload_enviado["adjuntos"]), 2)  # pdf via drive + xml via link externo

    def test_sin_link_pdf_ni_xml_no_intenta_descargar_nada(self):
        factura_sin_archivos = TesoreriaFactura.objects.create(timbre_uuid="uuid-sin-archivos")
        request = self.factory.get("/")
        with patch("tesoreria.mail_utils.requests.get") as mock_get, patch(
            "tesoreria.mail_utils.requests.post", return_value=_RespuestaFalsa(201)
        ) as mock_post:
            resultado = mail_utils.enviar_factura(request, "cliente@ejemplo.com", factura_sin_archivos)

        mock_get.assert_not_called()
        self.assertTrue(resultado)
        payload_enviado = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload_enviado["adjuntos"], [])


class TesoreriaMovimientoBancarioImportarTests(TestCase):
    """Primer paso de la conciliacion bancaria real (08/Sep/2026) - importar
    un extracto CSV/Excel crea un TesoreriaCorteEdc de encabezado y una
    TesoreriaMovimientoBancario por linea con fecha valida."""

    def setUp(self):
        self.factory = APIRequestFactory()
        banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=banco, clabe="002180000000000001", alias="Cuenta operativa", apertura="2026-01-01"
        )

    def _post_importar(self, archivo, perm_keys=("tesoreria.crear",)):
        request = self.factory.post(
            "/api/movimientos-bancarios/importar/",
            {"cuenta": self.cuenta.id_cuenta_bancaria, "file": archivo},
            format="multipart",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=perm_keys)
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "importar"})
        return view(request)

    def test_importar_csv_crea_corte_edc_y_movimientos(self):
        contenido = (
            b"Fecha,Descripcion,Referencia,Cargo,Abono,Saldo\n"
            b"01/09/2026,PAGO PROVEEDOR X,REF001,1500.50,,10000.00\n"
            b"02/09/2026,DEPOSITO CLIENTE,REF002,,5000.00,15000.00\n"
        )
        archivo = SimpleUploadedFile("extracto.csv", contenido, content_type="text/csv")
        # Drive real no esta disponible en pruebas - se mockea el resultado
        # exitoso (08/Sep/2026, "subir el extracto original a Drive") para
        # probar que el corte queda con link/drive_file_id/mime_type reales,
        # sin depender de una llamada de red de verdad.
        drive_ok = ({"web_view_link": "https://drive.google.com/x", "file_id": "abc123", "mime_type": "text/csv"}, None)
        with patch("tesoreria.views._subir_a_drive", return_value=drive_ok):
            response = self._post_importar(archivo)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["importados"], 2)
        self.assertEqual(response.data["errores"], [])

        corte = TesoreriaCorteEdc.objects.get(pk=response.data["corte_edc"])
        self.assertEqual(corte.cuenta_id, self.cuenta.id_cuenta_bancaria)
        self.assertEqual(corte.tipo, TesoreriaCorteEdc.TIPO_ESTADO_CUENTA)
        self.assertEqual(corte.formato, TesoreriaCorteEdc.FORMATO_CSV)
        self.assertEqual(corte.link, "https://drive.google.com/x")
        self.assertEqual(corte.drive_file_id, "abc123")
        self.assertEqual(corte.mime_type, "text/csv")

        movimientos = TesoreriaMovimientoBancario.objects.filter(corte_edc=corte).order_by("fecha")
        self.assertEqual(movimientos.count(), 2)
        primero = movimientos[0]
        self.assertEqual(str(primero.fecha), "2026-09-01")
        self.assertEqual(primero.cargo, Decimal("1500.50"))
        self.assertIsNone(primero.abono)
        self.assertEqual(primero.descripcion, "PAGO PROVEEDOR X")
        self.assertIsNone(primero.flujo)  # sin conciliar

    def test_importar_crcm_con_fila_de_metadata_antes_del_encabezado(self):
        # 11/Sep/2026, "Subida de archivos CRCM" - el estado de cuenta real
        # trae una fila "Cuenta  0124071131" antes del encabezado real; el
        # parser debe encontrar la fila de encabezados, no asumir fila 1.
        contenido = (
            b"Cuenta,0124071131,,,,,\n"
            b"Fecha Operacion,Concepto,Referencia,Referencia Ampliada,Cargo,Abono,Saldo\n"
            b"01/09/2026,PAGO PROVEEDOR X,REF001,REFAMP001,1500.50,,10000.00\n"
            b"02/09/2026,DEPOSITO CLIENTE,REF002,REFAMP002,,5000.00,15000.00\n"
        )
        archivo = SimpleUploadedFile("crcm.csv", contenido, content_type="text/csv")
        drive_ok = ({"web_view_link": "https://drive.google.com/x", "file_id": "abc123", "mime_type": "text/csv"}, None)
        with patch("tesoreria.views._subir_a_drive", return_value=drive_ok):
            response = self._post_importar(archivo)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["importados"], 2)
        movimientos = TesoreriaMovimientoBancario.objects.order_by("fecha")
        self.assertEqual(movimientos.count(), 2)
        self.assertEqual(movimientos[0].descripcion, "PAGO PROVEEDOR X")
        self.assertEqual(movimientos[0].cargo, Decimal("1500.50"))

    def test_importar_si_drive_falla_igual_importa_los_movimientos(self):
        """Best-effort (08/Sep/2026): drive-service caido no debe tumbar la
        importacion - ya se leyeron las filas reales, eso es lo que importa
        hoy. El corte solo se queda sin link/drive_file_id."""
        archivo = SimpleUploadedFile(
            "extracto.csv", b"Fecha,Cargo\n01/09/2026,100.00\n", content_type="text/csv"
        )
        drive_caido = (None, Response({"detail": "Drive no respondió"}, status=502))
        with patch("tesoreria.views._subir_a_drive", return_value=drive_caido):
            response = self._post_importar(archivo)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["importados"], 1)

        corte = TesoreriaCorteEdc.objects.get(pk=response.data["corte_edc"])
        self.assertEqual(corte.link, "")
        self.assertIsNone(corte.drive_file_id)

    def test_importar_sin_permiso_da_403(self):
        archivo = SimpleUploadedFile(
            "extracto.csv", b"Fecha,Cargo\n01/09/2026,100\n", content_type="text/csv"
        )
        response = self._post_importar(archivo, perm_keys=())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(TesoreriaMovimientoBancario.objects.count(), 0)

    def test_importar_formato_no_soportado(self):
        archivo = SimpleUploadedFile("extracto.pdf", b"no es un csv", content_type="application/pdf")
        response = self._post_importar(archivo)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(TesoreriaMovimientoBancario.objects.count(), 0)

    def test_importar_fila_con_monto_invalido_se_reporta_como_error(self):
        contenido = (
            b"Fecha,Descripcion,Cargo\n"
            b"01/09/2026,Fila buena,100.00\n"
            b"02/09/2026,Fila mala,no-es-un-monto\n"
        )
        archivo = SimpleUploadedFile("extracto.csv", contenido, content_type="text/csv")
        with patch("tesoreria.views._subir_a_drive", return_value=(None, None)):
            response = self._post_importar(archivo)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["importados"], 1)
        self.assertEqual(len(response.data["errores"]), 1)
        self.assertIn("Fila 3", response.data["errores"][0])


class TesoreriaMovimientoBancarioConciliacionTests(TestCase):
    """Matching automatico fecha+monto (08/Sep/2026), siguiente paso despues
    de importar el extracto - ver _sugerir_flujos_para_movimiento y
    TesoreriaMovimientoBancarioViewSet.sugerencias/conciliar_automatico."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.contraparte = TesoreriaContraparte.objects.create(
            razon_social="Constructora de prueba", tipo_persona=TesoreriaContraparte.TIPO_MORAL, email="c@c.com"
        )
        self.contrato = TesoreriaContrato.objects.create(
            id_contrato=f"{RFC_TIZARA}-{self.contraparte.id_contraparte}-001",
            sociedad=RFC_TIZARA,
            contraparte=self.contraparte,
            tipo=TesoreriaContrato.TIPO_INTERNO,
        )
        self.banco = TesoreriaBanco.objects.create(id_banxico="00002", banco="Banamex", alias="BMX")
        self.cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000001", alias="Cuenta operativa", apertura="2026-01-01"
        )
        self.otra_cuenta = TesoreriaCuenta.objects.create(
            banco=self.banco, clabe="002180000000000002", alias="Otra cuenta", apertura="2026-01-01"
        )
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("tesoreria.editar",))

    def _crear_flujo(self, total_mxp, fecha_pago, cuenta=None):
        return TesoreriaFlujo.objects.create(
            id_flujo=f"FLJ-{TesoreriaFlujo.objects.count() + 1:06d}",
            contrato=self.contrato,
            cuenta=cuenta or self.cuenta,
            total_mxp=Decimal(total_mxp),
            fecha_pago=fecha_pago,
            pagado=True,
        )

    def _crear_movimiento(self, abono=None, cargo=None, fecha="2026-09-01", cuenta=None):
        return TesoreriaMovimientoBancario.objects.create(
            cuenta=cuenta or self.cuenta,
            fecha=fecha,
            abono=Decimal(abono) if abono is not None else None,
            cargo=Decimal(cargo) if cargo is not None else None,
        )

    def test_sugerencias_devuelve_candidato_por_monto_y_fecha(self):
        flujo = self._crear_flujo("1500.50", "2026-09-01")
        movimiento = self._crear_movimiento(cargo="1500.50", fecha="2026-09-01")

        request = self.factory.get(f"/api/movimientos-bancarios/{movimiento.id}/sugerencias/")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"get": "sugerencias"})
        response = view(request, pk=movimiento.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id_flujo"], flujo.id_flujo)
        self.assertIn("mismo monto exacto", response.data[0]["motivos"])

    def test_sugerencias_excluye_flujo_de_otra_cuenta(self):
        self._crear_flujo("1500.50", "2026-09-01", cuenta=self.otra_cuenta)
        movimiento = self._crear_movimiento(cargo="1500.50", fecha="2026-09-01")

        request = self.factory.get(f"/api/movimientos-bancarios/{movimiento.id}/sugerencias/")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"get": "sugerencias"})
        response = view(request, pk=movimiento.id)

        self.assertEqual(response.data, [])

    def test_sugerencias_excluye_flujo_ya_ligado_a_otro_movimiento(self):
        flujo = self._crear_flujo("1500.50", "2026-09-01")
        primero = self._crear_movimiento(cargo="1500.50", fecha="2026-09-01")
        primero.flujo = flujo
        primero.save(update_fields=["flujo"])
        segundo = self._crear_movimiento(cargo="1500.50", fecha="2026-09-01")

        request = self.factory.get(f"/api/movimientos-bancarios/{segundo.id}/sugerencias/")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"get": "sugerencias"})
        response = view(request, pk=segundo.id)

        self.assertEqual(response.data, [])

    def test_conciliar_automatico_liga_match_de_alta_confianza(self):
        flujo = self._crear_flujo("5000.00", "2026-09-02")
        movimiento = self._crear_movimiento(abono="5000.00", fecha="2026-09-02")

        request = self.factory.post("/api/movimientos-bancarios/conciliar_automatico/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "conciliar_automatico"})
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["conciliados"], 1)
        movimiento.refresh_from_db()
        self.assertEqual(movimiento.flujo_id, flujo.id_flujo)

    def test_conciliar_automatico_no_liga_si_hay_mas_de_un_candidato(self):
        self._crear_flujo("1000.00", "2026-09-01")
        self._crear_flujo("1000.00", "2026-09-01")
        movimiento = self._crear_movimiento(cargo="1000.00", fecha="2026-09-01")

        request = self.factory.post("/api/movimientos-bancarios/conciliar_automatico/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "conciliar_automatico"})
        response = view(request)

        self.assertEqual(response.data["conciliados"], 0)
        self.assertEqual(response.data["ambiguos"], 1)
        movimiento.refresh_from_db()
        self.assertIsNone(movimiento.flujo)

    def test_conciliar_automatico_no_liga_si_fecha_esta_lejos(self):
        self._crear_flujo("1000.00", "2026-08-01")
        self._crear_movimiento(cargo="1000.00", fecha="2026-09-15")

        request = self.factory.post("/api/movimientos-bancarios/conciliar_automatico/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "conciliar_automatico"})
        response = view(request)

        self.assertEqual(response.data["conciliados"], 0)
        self.assertEqual(response.data["sin_match"], 1)

    def test_conciliar_automatico_respeta_filtro_de_cuenta(self):
        self._crear_flujo("1000.00", "2026-09-01", cuenta=self.otra_cuenta)
        self._crear_movimiento(cargo="1000.00", fecha="2026-09-01", cuenta=self.otra_cuenta)
        movimiento_cuenta_principal = self._crear_movimiento(cargo="2000.00", fecha="2026-09-01")
        self._crear_flujo("2000.00", "2026-09-01")

        request = self.factory.post(
            "/api/movimientos-bancarios/conciliar_automatico/",
            {"cuenta": self.cuenta.id_cuenta_bancaria},
            format="json",
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "conciliar_automatico"})
        response = view(request)

        self.assertEqual(response.data["conciliados"], 1)
        movimiento_cuenta_principal.refresh_from_db()
        self.assertIsNotNone(movimiento_cuenta_principal.flujo)

    def test_reporte_conciliacion_sin_cuenta_da_400(self):
        request = self.factory.get("/api/movimientos-bancarios/reporte_conciliacion/")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"get": "reporte_conciliacion"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_reporte_conciliacion_separa_conciliados_y_pendientes(self):
        flujo_conciliado = self._crear_flujo("1000.00", "2026-09-01")
        movimiento_conciliado = self._crear_movimiento(cargo="1000.00", fecha="2026-09-01")
        movimiento_conciliado.flujo = flujo_conciliado
        movimiento_conciliado.save(update_fields=["flujo"])

        # Linea de banco sin flujo interno ligado.
        self._crear_movimiento(cargo="300.00", fecha="2026-09-02")
        # Flujo interno (mismo rango de fechas) que ningun movimiento referencia.
        flujo_huerfano = self._crear_flujo("777.00", "2026-09-01")

        request = self.factory.get(
            "/api/movimientos-bancarios/reporte_conciliacion/",
            {"cuenta": self.cuenta.id_cuenta_bancaria},
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"get": "reporte_conciliacion"})
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["conciliados"]), 1)
        self.assertEqual(response.data["conciliados"][0]["id_flujo"], flujo_conciliado.id_flujo)
        self.assertTrue(response.data["conciliados"][0]["cuadra"])
        self.assertEqual(len(response.data["sin_conciliar_banco"]), 1)
        self.assertEqual(response.data["sin_conciliar_banco"][0]["monto"], Decimal("-300.00"))
        ids_huerfanos = [f["id_flujo"] for f in response.data["sin_conciliar_interno"]]
        self.assertIn(flujo_huerfano.id_flujo, ids_huerfanos)
        self.assertNotIn(flujo_conciliado.id_flujo, ids_huerfanos)
        self.assertEqual(response.data["totales"]["total_conciliado"], Decimal("1000.00"))

    def test_reporte_conciliacion_respeta_rango_de_fechas_explicito(self):
        # Flujo fuera del rango pedido no debe aparecer como "sin conciliar".
        self._crear_flujo("500.00", "2026-08-01")
        self._crear_movimiento(cargo="100.00", fecha="2026-09-01")

        request = self.factory.get(
            "/api/movimientos-bancarios/reporte_conciliacion/",
            {
                "cuenta": self.cuenta.id_cuenta_bancaria,
                "fecha_inicio": "2026-09-01",
                "fecha_fin": "2026-09-30",
            },
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"get": "reporte_conciliacion"})
        response = view(request)

        self.assertEqual(response.data["sin_conciliar_interno"], [])

    def test_crear_flujo_precarga_cuenta_concepto_monto(self):
        # 11/Sep/2026, "Subida de archivos CRCM para precargar Flujos" -
        # distinto de vincular (ese liga a un Flujo YA existente); esto
        # crea uno nuevo desde un movimiento sin match, con cuenta/concepto/
        # monto tomados del estado de cuenta.
        movimiento = self._crear_movimiento(abono="850.00", fecha="2026-09-05")
        movimiento.descripcion = "SPEI recibido de cliente"
        movimiento.save(update_fields=["descripcion"])

        request = self.factory.post(
            f"/api/movimientos-bancarios/{movimiento.id}/crear_flujo/",
            {"contrato": self.contrato.id_contrato},
            format="json",
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "crear_flujo"})
        response = view(request, pk=movimiento.id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["cuenta"], self.cuenta.id_cuenta_bancaria)
        self.assertEqual(response.data["concepto"], "SPEI recibido de cliente")
        self.assertEqual(Decimal(response.data["total_mxp"]), Decimal("850.00"))
        movimiento.refresh_from_db()
        self.assertEqual(movimiento.flujo_id, response.data["id_flujo"])

    def test_crear_flujo_sin_contrato_da_400(self):
        movimiento = self._crear_movimiento(cargo="200.00", fecha="2026-09-05")
        request = self.factory.post(f"/api/movimientos-bancarios/{movimiento.id}/crear_flujo/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "crear_flujo"})
        response = view(request, pk=movimiento.id)
        self.assertEqual(response.status_code, 400)

    def test_crear_flujo_si_ya_esta_conciliado_da_400(self):
        flujo = self._crear_flujo("100.00", "2026-09-05")
        movimiento = self._crear_movimiento(cargo="100.00", fecha="2026-09-05")
        movimiento.flujo = flujo
        movimiento.save(update_fields=["flujo"])

        request = self.factory.post(
            f"/api/movimientos-bancarios/{movimiento.id}/crear_flujo/",
            {"contrato": self.contrato.id_contrato},
            format="json",
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaMovimientoBancarioViewSet.as_view({"post": "crear_flujo"})
        response = view(request, pk=movimiento.id)
        self.assertEqual(response.status_code, 400)
