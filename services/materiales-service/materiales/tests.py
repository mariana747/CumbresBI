"""Primera suite del servicio (24/Ago/2026) - materiales-service tenia
modelos+CRUD reales desde el 21/Ago/2026 pero sin ningun test. Cubre lo que
de verdad tiene logica de negocio: permisos por accion, el descuento real de
almacen en SolicitudMaterial.entregar (con su regla de "no sin foto" y de
"no mas de lo disponible"), y el ciclo validar/autorizar/rechazar de
Requisicion con el snapshot de RequisicionLinea."""

from decimal import Decimal

from cumbresbi_scope.scope import EffectiveScope
from django.conf import settings
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from .models import ConceptoPresupuesto, EvidenciaRecepcion, MaterialCatalogo, Presupuesto, SolicitudMaterial
from .views import MaterialCatalogoViewSet, PresupuestoViewSet, RequisicionViewSet, SolicitudMaterialViewSet


class MaterialCatalogoCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/materiales/",
            {"material": "Cemento gris", "unidad_medida": "saco", "precio_unitario": "180.00"},
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = MaterialCatalogoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_materiales_crear(self):
        request = self.factory.post(
            "/api/materiales/",
            {
                "material": "Cemento gris",
                "unidad_medida": "saco",
                "precio_unitario": "180.00",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("materiales.crear",))
        view = MaterialCatalogoViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["cantidad_disponible"], "0.00")

    def test_lectura_sin_permiso_especial(self):
        MaterialCatalogo.objects.create(material="Varilla 3/8", unidad_medida="pza", precio_unitario="95.00")
        request = self.factory.get("/api/materiales/")
        request.effective_scope = EffectiveScope.anonymous()
        view = MaterialCatalogoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)


class RecibirCompraTests(TestCase):
    """recibir_compra (02/Sep/2026) es el enlace real con Compras -
    compras-tesoreria-service llama esto al registrar una Recepcion para
    sumar al inventario de Obra. Protegido por el secreto interno servicio-
    a-servicio, no por un perm_key de sesion (ver views.py)."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def _post(self, body, secreto="dev-secreto"):
        request = self.factory.post("/api/materiales/recibir_compra/", body, format="json")
        if secreto:
            request.META["HTTP_X_INTERNAL_SECRET"] = secreto
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = MaterialCatalogoViewSet.as_view({"post": "recibir_compra"})
        return view(request)

    def test_sin_secreto_ni_permiso_da_403(self):
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"):
            response = self._post({"material_nombre": "Cemento gris", "cantidad_recibida": 10}, secreto=None)
        self.assertEqual(response.status_code, 403)

    def test_crea_material_si_no_existe(self):
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"):
            response = self._post(
                {
                    "material_nombre": "Cemento gris",
                    "cantidad_recibida": 20,
                    "unidad_medida": "saco",
                    "precio_unitario": "180.00",
                }
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cantidad_disponible"], "20.00")
        self.assertEqual(MaterialCatalogo.objects.count(), 1)

    def test_suma_a_material_existente_sin_condicion_de_carrera(self):
        material = MaterialCatalogo.objects.create(
            material="Varilla 3/8", unidad_medida="pza", precio_unitario="95.00", cantidad_disponible=Decimal("5")
        )
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"):
            response = self._post({"material_nombre": "varilla 3/8", "cantidad_recibida": 15})
        self.assertEqual(response.status_code, 200)
        material.refresh_from_db()
        self.assertEqual(material.cantidad_disponible, Decimal("20"))
        self.assertEqual(MaterialCatalogo.objects.count(), 1)


class ActualizarPrecioCotizadoTests(TestCase):
    """actualizar_precio_cotizado (02/Sep/2026) es el enlace con Compras al
    confirmar una cotizacion - a diferencia de recibir_compra, NO es una
    entrega real todavia: sincroniza precio/proveedor pero nunca toca
    cantidad_disponible."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def _post(self, body, secreto="dev-secreto"):
        request = self.factory.post("/api/materiales/actualizar_precio_cotizado/", body, format="json")
        if secreto:
            request.META["HTTP_X_INTERNAL_SECRET"] = secreto
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = MaterialCatalogoViewSet.as_view({"post": "actualizar_precio_cotizado"})
        return view(request)

    def test_sin_secreto_ni_permiso_da_403(self):
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"):
            response = self._post({"material_nombre": "Cemento gris", "precio_unitario": "185.00"}, secreto=None)
        self.assertEqual(response.status_code, 403)

    def test_crea_material_con_cantidad_cero_si_no_existe(self):
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"):
            response = self._post(
                {
                    "material_nombre": "Cemento gris",
                    "precio_unitario": "185.00",
                    "unidad_medida": "saco",
                    "proveedor": "CP0001",
                }
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["precio_unitario"], "185.00")
        self.assertEqual(response.data["proveedor"], "CP0001")
        self.assertEqual(response.data["cantidad_disponible"], "0.00")

    def test_no_toca_cantidad_disponible_de_material_existente(self):
        material = MaterialCatalogo.objects.create(
            material="Varilla 3/8", unidad_medida="pza", precio_unitario="95.00", cantidad_disponible=Decimal("5")
        )
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"):
            response = self._post({"material_nombre": "varilla 3/8", "precio_unitario": "99.50"})
        self.assertEqual(response.status_code, 200)
        material.refresh_from_db()
        self.assertEqual(material.precio_unitario, Decimal("99.50"))
        self.assertEqual(material.cantidad_disponible, Decimal("5"))
        self.assertEqual(MaterialCatalogo.objects.count(), 1)


class SolicitudMaterialEntregarTests(TestCase):
    """`entregar` es la pieza con mas logica real: exige evidencia
    fotografica, descuenta el almacen de verdad, y no deja
    cantidad_disponible en negativo."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.material = MaterialCatalogo.objects.create(
            material="Cemento gris", unidad_medida="saco", precio_unitario="180.00", cantidad_disponible=Decimal("10")
        )
        self.solicitud = SolicitudMaterial.objects.create(
            proyecto="AAA", material=self.material, cantidad_solicitada=Decimal("4"), solicitado_por="u001"
        )
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("materiales.editar",))

    def _entregar(self):
        request = self.factory.post(f"/api/solicitudes/{self.solicitud.id_solicitud}/entregar/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = SolicitudMaterialViewSet.as_view({"post": "entregar"})
        return view(request, pk=self.solicitud.id_solicitud)

    def test_no_se_puede_entregar_sin_evidencia(self):
        response = self._entregar()
        self.assertEqual(response.status_code, 400)
        self.material.refresh_from_db()
        self.assertEqual(self.material.cantidad_disponible, Decimal("10"))

    def test_entregar_con_evidencia_descuenta_el_almacen(self):
        EvidenciaRecepcion.objects.create(
            solicitud=self.solicitud, link_drive="https://drive/foto.jpg", fecha="2026-08-24", hora="10:00", registrado_por="u001"
        )
        response = self._entregar()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], SolicitudMaterial.ESTADO_ENTREGADO)

        self.material.refresh_from_db()
        self.assertEqual(self.material.cantidad_disponible, Decimal("6"))

    def test_entregar_requiere_permiso_materiales_editar(self):
        EvidenciaRecepcion.objects.create(
            solicitud=self.solicitud, link_drive="https://drive/foto.jpg", fecha="2026-08-24", hora="10:00", registrado_por="u001"
        )
        request = self.factory.post(f"/api/solicitudes/{self.solicitud.id_solicitud}/entregar/", {}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = SolicitudMaterialViewSet.as_view({"post": "entregar"})
        response = view(request, pk=self.solicitud.id_solicitud)
        self.assertEqual(response.status_code, 403)

    def test_rechazar_no_descuenta_almacen(self):
        request = self.factory.post(f"/api/solicitudes/{self.solicitud.id_solicitud}/rechazar/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = SolicitudMaterialViewSet.as_view({"post": "rechazar"})
        response = view(request, pk=self.solicitud.id_solicitud)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], SolicitudMaterial.ESTADO_RECHAZADO)

        self.material.refresh_from_db()
        self.assertEqual(self.material.cantidad_disponible, Decimal("10"))

    def test_no_se_puede_solicitar_mas_de_lo_disponible(self):
        """Validacion en el serializer (no en entregar) - falla ANTES de
        crear la solicitud, no hasta que se intenta entregar."""
        request = self.factory.post(
            "/api/solicitudes/",
            {
                "proyecto": "AAA",
                "material": self.material.id_material,
                "cantidad_solicitada": "99",
                "solicitado_por": "u001",
                "created_by": "u001",
                "updated_by": "u001",
            },
            format="json",
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("materiales.crear",))
        view = SolicitudMaterialViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("cantidad_solicitada", response.data)


class MaterialesScopeTests(TestCase):
    """31/Ago/2026 (auditoria de scope): este servicio nunca declaro
    ScopedManager pese a tener `proyecto` como columna propia desde el
    inicio - Presupuesto/SolicitudMaterial eran de lectura abierta.
    Confirma que un usuario acotado a un proyecto no ve el de otro."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.material = MaterialCatalogo.objects.create(
            material="Cemento gris", unidad_medida="saco", precio_unitario="180.00"
        )

    def test_usuario_de_un_proyecto_no_ve_presupuestos_de_otro(self):
        Presupuesto.objects.create(proyecto="AAA", monto_total=Decimal("1000"))
        Presupuesto.objects.create(proyecto="BBB", monto_total=Decimal("2000"))

        request = self.factory.get("/api/presupuestos/")
        request.effective_scope = EffectiveScope(is_global=False, proyecto_ids=("AAA",))
        view = PresupuestoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["proyecto"], "AAA")

    def test_usuario_de_un_proyecto_no_ve_solicitudes_de_otro(self):
        SolicitudMaterial.objects.create(
            proyecto="AAA", material=self.material, cantidad_solicitada=Decimal("1"), solicitado_por="u001"
        )
        SolicitudMaterial.objects.create(
            proyecto="BBB", material=self.material, cantidad_solicitada=Decimal("1"), solicitado_por="u001"
        )

        request = self.factory.get("/api/solicitudes/")
        request.effective_scope = EffectiveScope(is_global=False, proyecto_ids=("BBB",))
        view = SolicitudMaterialViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["proyecto"], "BBB")

    def test_global_ve_ambos_proyectos(self):
        Presupuesto.objects.create(proyecto="AAA", monto_total=Decimal("1000"))
        Presupuesto.objects.create(proyecto="BBB", monto_total=Decimal("2000"))

        request = self.factory.get("/api/presupuestos/")
        request.effective_scope = EffectiveScope(is_global=True)
        view = PresupuestoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 2)

    def test_anonimo_no_ve_nada(self):
        Presupuesto.objects.create(proyecto="AAA", monto_total=Decimal("1000"))
        request = self.factory.get("/api/presupuestos/")
        request.effective_scope = EffectiveScope.anonymous()
        view = PresupuestoViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 0)


class RequisicionCicloTests(TestCase):
    """perform_create genera el folio y el snapshot de RequisicionLinea a
    partir de ConceptoPresupuesto; validar/autorizar/rechazar mueven el
    estado con las reglas de orden (no se autoriza sin validar antes)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.presupuesto = Presupuesto.objects.create(proyecto="AAA", monto_total=Decimal("50000.00"))
        self.material = MaterialCatalogo.objects.create(
            material="Cemento gris", unidad_medida="saco", precio_unitario="180.00", proveedor="cp000abc"
        )
        ConceptoPresupuesto.objects.create(
            presupuesto=self.presupuesto,
            etapa_constructiva="Losa cimentacion",
            concepto="Cemento para losa",
            material=self.material,
            cantidad=Decimal("10"),
            precio_unitario=Decimal("180.00"),
            importe=Decimal("1800.00"),
        )
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("materiales.crear",))
        self.scope_editar = EffectiveScope(is_global=True, perm_keys=("materiales.editar",))

    def _crear_requisicion(self, num_viviendas=2):
        request = self.factory.post(
            "/api/requisiciones/",
            {
                "proyecto": "AAA",
                "presupuesto": self.presupuesto.id_presupuesto,
                "etapa_constructiva": "Losa cimentacion",
                "num_viviendas": num_viviendas,
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = RequisicionViewSet.as_view({"post": "create"})
        return view(request)

    def test_crear_genera_folio_y_snapshot_de_lineas(self):
        response = self._crear_requisicion(num_viviendas=2)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["folio"].startswith("AAA-"))
        self.assertEqual(len(response.data["lineas"]), 1)

        linea = response.data["lineas"][0]
        self.assertEqual(linea["cantidad_por_vivienda"], "10.0000")
        self.assertEqual(linea["cantidad_total"], "20.00")
        self.assertEqual(linea["importe"], "3600.00")
        self.assertEqual(linea["proveedor_cotizacion"], "cp000abc")

    def test_no_se_puede_autorizar_sin_validar_primero(self):
        creado = self._crear_requisicion()
        req_id = creado.data["id_requisicion"]

        request = self.factory.post(f"/api/requisiciones/{req_id}/autorizar/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = RequisicionViewSet.as_view({"post": "autorizar"})
        response = view(request, pk=req_id)
        self.assertEqual(response.status_code, 400)

    def test_ciclo_completo_validar_y_autorizar(self):
        creado = self._crear_requisicion()
        req_id = creado.data["id_requisicion"]

        validar_request = self.factory.post(f"/api/requisiciones/{req_id}/validar/", {}, format="json")
        validar_request.effective_scope = self.scope_editar
        validar_view = RequisicionViewSet.as_view({"post": "validar"})
        validar_view(validar_request, pk=req_id)

        autorizar_request = self.factory.post(f"/api/requisiciones/{req_id}/autorizar/", {}, format="json")
        autorizar_request.effective_scope = self.scope_editar
        autorizar_view = RequisicionViewSet.as_view({"post": "autorizar"})
        response = autorizar_view(autorizar_request, pk=req_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], "AUTORIZADA")

    def test_rechazar_una_requisicion_ya_autorizada_falla(self):
        creado = self._crear_requisicion()
        req_id = creado.data["id_requisicion"]

        for accion in ("validar", "autorizar"):
            request = self.factory.post(f"/api/requisiciones/{req_id}/{accion}/", {}, format="json")
            request.effective_scope = self.scope_editar
            view = RequisicionViewSet.as_view({"post": accion})
            view(request, pk=req_id)

        rechazar_request = self.factory.post(f"/api/requisiciones/{req_id}/rechazar/", {}, format="json")
        rechazar_request.effective_scope = self.scope_editar
        rechazar_view = RequisicionViewSet.as_view({"post": "rechazar"})
        response = rechazar_view(rechazar_request, pk=req_id)
        self.assertEqual(response.status_code, 400)
