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
    TesoreriaBanco,
    TesoreriaComplementoPago,
    TesoreriaContraparte,
    TesoreriaContrato,
    TesoreriaCuenta,
    TesoreriaFactura,
    TesoreriaFlujo,
)
from .views import (
    TesoreriaBancoViewSet,
    TesoreriaContraparteRelacionViewSet,
    TesoreriaContraparteViewSet,
    TesoreriaContratoViewSet,
    TesoreriaCuentaViewSet,
    TesoreriaFacturaViewSet,
    TesoreriaFlujoViewSet,
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
        from .models import TesoreriaContraparteRelacion

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
