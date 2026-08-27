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

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
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
    TesoreriaFactura,
    TesoreriaFlujo,
    TesoreriaNotaCredito,
    TesoreriaRecNomina,
    TesoreriaSaldo,
)
from .reportes import calcular_reporte_diario
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
    TesoreriaNotaCreditoViewSet,
    TesoreriaRecNominaViewSet,
    TesoreriaSaldoViewSet,
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
        self.assertEqual(response2.data["razon_social"], "Editada")

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

    def _crear_contrato(self, sociedad, scope=None):
        request = self.factory.post(
            "/api/contratos/",
            {"sociedad": sociedad, "contraparte": self.contraparte.id_contraparte, "tipo": "INTERNO"},
            format="json",
        )
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
        self.scope_aprobar = EffectiveScope(is_global=True, perm_keys=("tesoreria.aprobar",))

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

        request2 = self.factory.get("/api/flujos/")
        request2.effective_scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        response2 = view(request2)
        self.assertEqual(len(response2.data), 1)

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

        request = self.factory.post(f"/api/flujos/{flujo_id}/aprobar/", {"autorizado_por": "u001"}, format="json")
        request.effective_scope = self.scope_editar
        view = TesoreriaFlujoViewSet.as_view({"post": "aprobar"})
        response = view(request, pk=flujo_id)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(f"/api/flujos/{flujo_id}/aprobar/", {"autorizado_por": "u001"}, format="json")
        request2.effective_scope = self.scope_aprobar
        response2 = view(request2, pk=flujo_id)
        self.assertEqual(response2.status_code, 200)
        self.assertTrue(response2.data["autorizacion"])
        self.assertEqual(response2.data["validacion_estado"], TesoreriaFlujo.VALIDACION_APROBADA)

    def test_ciclo_completo_aprobar_y_registrar_pago(self):
        creado = self._crear_flujo()
        flujo_id = creado.data["id_flujo"]

        aprobar_request = self.factory.post(
            f"/api/flujos/{flujo_id}/aprobar/", {"autorizado_por": "u001"}, format="json"
        )
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


class TesoreriaFacturaMarcarEstadoTests(TestCase):
    """marcar_estado() - ciclo de vida propio (24/Ago/2026, pedido explicito
    de Mariana): PENDIENTE/EN_PROCESO/ACEPTADA/RECHAZADA. Aceptar exige
    link_pdf + link_xml ya cargados."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.editar",))
        self.factura = TesoreriaFactura.objects.create(timbre_uuid="uuid-estado", comprobante_folio="F-1")

    def test_sin_permiso_da_403(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "EN_PROCESO"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("facturacion-cfdi.crear",))
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 403)

    def test_estado_invalido_da_400(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "NO_EXISTE"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 400)

    def test_en_proceso_no_exige_archivos(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "EN_PROCESO"}, format="json"
        )
        request.effective_scope = self.scope_editar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "EN_PROCESO")

    def test_aceptar_sin_archivos_da_400(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "ACEPTADA"}, format="json"
        )
        request.effective_scope = self.scope_editar
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
        request.effective_scope = self.scope_editar
        view = TesoreriaFacturaViewSet.as_view({"post": "marcar_estado"})
        response = view(request, pk=self.factura.pk)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "ACEPTADA")

    def test_rechazar_no_exige_archivos(self):
        request = self.factory.post(
            f"/api/facturas/{self.factura.pk}/marcar_estado/", {"estado": "RECHAZADA"}, format="json"
        )
        request.effective_scope = self.scope_editar
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
        request.effective_scope = self.scope_editar
        view = TesoreriaFacturaViewSet.as_view({"post": "confirmar_extraccion"})
        response = view(request, pk=factura.pk)
        self.assertEqual(response.status_code, 200)
        factura.refresh_from_db()
        self.assertEqual(factura.contraparte_id, self.proveedor.id_contraparte)

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
