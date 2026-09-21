"""Cubre permisos por accion, RLS por proyecto, y el flujo completo:
SolicitudCompra -> Cotizacion -> OrdenCompra -> Recepcion."""

from decimal import Decimal
from unittest.mock import Mock, patch

from cumbresbi_scope.scope import EffectiveScope
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .models import Cotizacion, OrdenCompra, OrdenCompraLinea, Recepcion, SolicitudCompra
from .views import CotizacionViewSet, OrdenCompraViewSet, RecepcionViewSet, SolicitudCompraViewSet

PROYECTO_A = "PRYA"
PROYECTO_B = "PRYB"


class SolicitudCompraCrudTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post(
            "/api/solicitudes/", {"proyecto": PROYECTO_A, "descripcion": "Cemento"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = SolicitudCompraViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_compras_crear(self):
        request = self.factory.post(
            "/api/solicitudes/", {"proyecto": PROYECTO_A, "descripcion": "Cemento"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("compras.crear",), identity_user_id="u001")
        view = SolicitudCompraViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["estado"], SolicitudCompra.ESTADO_PENDIENTE)
        self.assertEqual(response.data["solicitado_por"], "u001")

    def test_lectura_por_proyecto_no_ve_otro_proyecto(self):
        SolicitudCompra.objects.create(
            proyecto=PROYECTO_A, descripcion="A", created_by="u001", updated_by="u001"
        )
        SolicitudCompra.objects.create(
            proyecto=PROYECTO_B, descripcion="B", created_by="u001", updated_by="u001"
        )
        request = self.factory.get("/api/solicitudes/")
        request.effective_scope = EffectiveScope(is_global=False, proyecto_ids=(PROYECTO_A,))
        view = SolicitudCompraViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["proyecto"], PROYECTO_A)


class FlujoCompletoCompraTests(TestCase):
    """Flujo feliz: solicitud -> 2 cotizaciones -> confirmar_extraccion en
    una -> generar orden desde esa -> recepcion parcial -> recepcion
    total."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_aprobar = EffectiveScope(
            is_global=True, perm_keys=("compras.crear", "compras.editar", "compras.aprobar"), identity_user_id="u001"
        )
        self.solicitud = SolicitudCompra.objects.create(
            proyecto=PROYECTO_A, descripcion="Cemento y varilla", created_by="u001", updated_by="u001"
        )

    def _crear_cotizacion(self, proveedor_nombre):
        request = self.factory.post(
            "/api/cotizaciones/",
            {"solicitud": self.solicitud.id_solicitud, "proveedor_nombre": proveedor_nombre},
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = CotizacionViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        return response.data["id_cotizacion"]

    def test_confirmar_extraccion_requiere_compras_aprobar(self):
        cotizacion_id = self._crear_cotizacion("Materiales del Norte SA de CV")
        request = self.factory.post(f"/api/cotizaciones/{cotizacion_id}/confirmar_extraccion/", {}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("compras.editar",))
        view = CotizacionViewSet.as_view({"post": "confirmar_extraccion"})
        response = view(request, pk=cotizacion_id)
        self.assertEqual(response.status_code, 403)

    def test_flujo_completo(self):
        # 1. La solicitud recibe 2 cotizaciones de proveedores distintos.
        cotizacion_ganadora = self._crear_cotizacion("Materiales del Norte SA de CV")
        self._crear_cotizacion("Proveedor Alterno SA de CV")
        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, SolicitudCompra.ESTADO_EN_COTIZACION)

        # 2. confirmar_extraccion - simula lo que el analista confirmo
        # despues de que el Motor Documental extrajo el documento
        # (prompt compras.cotizacion).
        request = self.factory.post(
            f"/api/cotizaciones/{cotizacion_ganadora}/confirmar_extraccion/",
            {
                "campos": {"total": "5800.00", "moneda": "MXN"},
                "lineas": [
                    {"descripcion": "Cemento gris 50kg", "cantidad": "20", "precio_unitario": "180.00", "importe": "3600.00"},
                    {"descripcion": "Varilla 3/8", "cantidad": "40", "precio_unitario": "55.00", "importe": "2200.00"},
                ],
            },
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = CotizacionViewSet.as_view({"post": "confirmar_extraccion"})
        response = view(request, pk=cotizacion_ganadora)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], Cotizacion.ESTADO_CONFIRMADA)
        self.assertEqual(len(response.data["lineas"]), 2)

        # 3. Genera la orden desde la cotizacion confirmada - la otra
        # cotizacion de la misma solicitud queda descartada.
        request = self.factory.post(
            "/api/ordenes/generar_desde_cotizacion/", {"cotizacion": cotizacion_ganadora}, format="json"
        )
        request.effective_scope = self.scope_aprobar
        view = OrdenCompraViewSet.as_view({"post": "generar_desde_cotizacion"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        orden_id = response.data["id_orden"]
        self.assertEqual(response.data["estado"], OrdenCompra.ESTADO_BORRADOR)
        self.assertEqual(len(response.data["lineas"]), 2)
        linea_cemento = next(linea for linea in response.data["lineas"] if "Cemento" in linea["descripcion"])

        self.solicitud.refresh_from_db()
        self.assertEqual(self.solicitud.estado, SolicitudCompra.ESTADO_ORDEN_GENERADA)
        self.assertEqual(
            Cotizacion.objects.get(pk=cotizacion_ganadora).estado, Cotizacion.ESTADO_GANADORA
        )
        otra = Cotizacion.objects.exclude(pk=cotizacion_ganadora).get(solicitud=self.solicitud)
        self.assertEqual(otra.estado, Cotizacion.ESTADO_DESCARTADA)

        # 4. Recepcion parcial (10 de 20 sacos de cemento) - la orden queda
        # RECIBIDA_PARCIAL.
        request = self.factory.post(
            "/api/recepciones/",
            {
                "orden": orden_id,
                "fecha": "2026-09-02",
                "hora": "10:00:00",
                "lineas": [{"orden_linea": linea_cemento["id_linea"], "cantidad_recibida": "10"}],
            },
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = RecepcionViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        orden = OrdenCompra.objects.get(pk=orden_id)
        self.assertEqual(orden.estado, OrdenCompra.ESTADO_RECIBIDA_PARCIAL)

        # 5. No se puede recibir mas de lo que falta.
        request = self.factory.post(
            "/api/recepciones/",
            {
                "orden": orden_id,
                "fecha": "2026-09-03",
                "hora": "10:00:00",
                "lineas": [{"orden_linea": linea_cemento["id_linea"], "cantidad_recibida": "15"}],
            },
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = RecepcionViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

        # 6. Completa la recepcion de ambas lineas - la orden pasa a
        # RECIBIDA_TOTAL.
        linea_varilla = next(
            linea
            for linea in OrdenCompraViewSet.as_view({"get": "retrieve"})(
                self._get_request_scoped(f"/api/ordenes/{orden_id}/"), pk=orden_id
            ).data["lineas"]
            if "Varilla" in linea["descripcion"]
        )
        request = self.factory.post(
            "/api/recepciones/",
            {
                "orden": orden_id,
                "fecha": "2026-09-04",
                "hora": "10:00:00",
                "lineas": [
                    {"orden_linea": linea_cemento["id_linea"], "cantidad_recibida": "10"},
                    {"orden_linea": linea_varilla["id_linea"], "cantidad_recibida": "40"},
                ],
            },
            format="json",
        )
        request.effective_scope = self.scope_aprobar
        view = RecepcionViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        orden.refresh_from_db()
        self.assertEqual(orden.estado, OrdenCompra.ESTADO_RECIBIDA_TOTAL)

    def _get_request_scoped(self, path):
        request = self.factory.get(path)
        request.effective_scope = self.scope_aprobar
        return request


class RecepcionSincronizaInventarioTests(TestCase):
    """Verifica que RecepcionViewSet.create llama a materiales-service con
    los datos correctos, y que un fallo de red no tumba el registro local."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("compras.crear",), identity_user_id="u001")
        solicitud = SolicitudCompra.objects.create(
            proyecto="PRYA", descripcion="Cemento", created_by="u001", updated_by="u001"
        )
        cotizacion = Cotizacion.objects.create(
            solicitud=solicitud, proveedor="CP0001", proveedor_nombre="Materiales del Norte",
            created_by="u001", updated_by="u001",
        )
        self.orden = OrdenCompra.objects.create(
            folio="OC-TEST-0001", proyecto="PRYA", solicitud=solicitud, cotizacion=cotizacion,
            proveedor="CP0001", proveedor_nombre="Materiales del Norte", created_by="u001", updated_by="u001",
        )
        self.linea = OrdenCompraLinea.objects.create(
            orden=self.orden, descripcion="Cemento gris 50kg", cantidad=Decimal("20"), precio_unitario=Decimal("180.00"),
            importe=Decimal("3600.00"),
        )

    def _registrar_recepcion(self, cantidad="10"):
        request = self.factory.post(
            "/api/recepciones/",
            {
                "orden": self.orden.id_orden,
                "fecha": "2026-09-02",
                "hora": "10:00:00",
                "lineas": [{"orden_linea": self.linea.id_linea, "cantidad_recibida": cantidad}],
            },
            format="json",
        )
        request.effective_scope = self.scope
        view = RecepcionViewSet.as_view({"post": "create"})
        return view(request)

    def test_sin_secreto_configurado_no_llama_a_materiales(self):
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", ""), patch(
            "compras_tesoreria.views.requests.post"
        ) as mock_post:
            response = self._registrar_recepcion()
        self.assertEqual(response.status_code, 201)
        mock_post.assert_not_called()

    def test_con_secreto_llama_a_materiales_con_los_datos_de_la_linea(self):
        mock_response = Mock(status_code=200)
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"), patch(
            "compras_tesoreria.views.requests.post", return_value=mock_response
        ) as mock_post:
            response = self._registrar_recepcion(cantidad="10")
        self.assertEqual(response.status_code, 201)
        mock_post.assert_called_once()
        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs["json"]["material_nombre"], "Cemento gris 50kg")
        self.assertEqual(kwargs["json"]["cantidad_recibida"], "10")
        self.assertEqual(kwargs["headers"]["X-Internal-Secret"], "dev-secreto")

    def test_fallo_de_red_no_tumba_la_recepcion_local(self):
        import requests

        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"), patch(
            "compras_tesoreria.views.requests.post", side_effect=requests.RequestException("caido")
        ):
            response = self._registrar_recepcion()
        self.assertEqual(response.status_code, 201)
        self.linea.refresh_from_db()
        self.assertEqual(self.linea.cantidad_recibida, Decimal("10"))


class ConfirmarExtraccionSincronizaCatalogoTests(TestCase):
    """Verifica que confirmar_extraccion llama a materiales-service por
    cada linea con precio_unitario, y que un fallo de red no tumba la
    confirmacion local."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("compras.crear", "compras.aprobar"), identity_user_id="u001")
        self.solicitud = SolicitudCompra.objects.create(
            proyecto="PRYA", descripcion="Cemento", created_by="u001", updated_by="u001"
        )
        self.cotizacion = Cotizacion.objects.create(
            solicitud=self.solicitud, proveedor="CP0001", proveedor_nombre="Materiales del Norte",
            created_by="u001", updated_by="u001",
        )

    def _confirmar(self, lineas):
        request = self.factory.post(
            f"/api/cotizaciones/{self.cotizacion.id_cotizacion}/confirmar_extraccion/",
            {"lineas": lineas},
            format="json",
        )
        request.effective_scope = self.scope
        view = CotizacionViewSet.as_view({"post": "confirmar_extraccion"})
        return view(request, pk=self.cotizacion.id_cotizacion)

    def test_sin_secreto_configurado_no_llama_a_materiales(self):
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", ""), patch(
            "compras_tesoreria.views.requests.post"
        ) as mock_post:
            response = self._confirmar([{"descripcion": "Cemento gris 50kg", "cantidad": "20", "precio_unitario": "180.00", "importe": "3600.00"}])
        self.assertEqual(response.status_code, 200)
        mock_post.assert_not_called()

    def test_con_secreto_llama_a_materiales_por_cada_linea(self):
        mock_response = Mock(status_code=200)
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"), patch(
            "compras_tesoreria.views.requests.post", return_value=mock_response
        ) as mock_post:
            response = self._confirmar(
                [
                    {"descripcion": "Cemento gris 50kg", "cantidad": "20", "precio_unitario": "180.00", "importe": "3600.00"},
                    {"descripcion": "Varilla 3/8", "cantidad": "40", "precio_unitario": "55.00", "importe": "2200.00"},
                ]
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mock_post.call_count, 2)
        primera_llamada_url = mock_post.call_args_list[0].args[0]
        self.assertIn("actualizar_precio_cotizado", primera_llamada_url)
        primer_payload = mock_post.call_args_list[0].kwargs["json"]
        self.assertEqual(primer_payload["material_nombre"], "Cemento gris 50kg")
        self.assertEqual(primer_payload["precio_unitario"], "180.00")
        self.assertEqual(primer_payload["proveedor"], "CP0001")

    def test_linea_sin_precio_no_llama_a_materiales(self):
        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"), patch(
            "compras_tesoreria.views.requests.post"
        ) as mock_post:
            response = self._confirmar([{"descripcion": "Cemento gris 50kg", "cantidad": "20", "precio_unitario": "", "importe": "0"}])
        self.assertEqual(response.status_code, 200)
        mock_post.assert_not_called()

    def test_fallo_de_red_no_tumba_la_confirmacion_local(self):
        import requests

        with patch.object(settings, "MATERIALES_INTERNAL_SECRET", "dev-secreto"), patch(
            "compras_tesoreria.views.requests.post", side_effect=requests.RequestException("caido")
        ):
            response = self._confirmar([{"descripcion": "Cemento gris 50kg", "cantidad": "20", "precio_unitario": "180.00", "importe": "3600.00"}])
        self.assertEqual(response.status_code, 200)
        self.cotizacion.refresh_from_db()
        self.assertEqual(self.cotizacion.estado, Cotizacion.ESTADO_CONFIRMADA)
        self.assertEqual(self.cotizacion.lineas.count(), 1)


class CrearDesdeRequisicionTests(TestCase):
    """Verifica el endpoint que materiales-service llama al autorizar una
    Requisicion (21/Sep/2026) - solo el secreto interno debe poder crearla
    sin compras.crear, y debe ser idempotente por `requisicion`."""

    def setUp(self):
        self.factory = APIRequestFactory()

    def _llamar(self, payload, secreto=None):
        request = self.factory.post("/api/solicitudes/crear_desde_requisicion/", payload, format="json")
        if secreto is not None:
            request.META["HTTP_X_INTERNAL_SECRET"] = secreto
        view = SolicitudCompraViewSet.as_view({"post": "crear_desde_requisicion"})
        return view(request)

    def test_sin_secreto_ni_permiso_da_403(self):
        with patch.object(settings, "COMPRAS_INTERNAL_SECRET", "dev-secreto"):
            response = self._llamar({"requisicion": "REQ00001", "proyecto": "PRYA", "descripcion": "Cemento"})
        self.assertEqual(response.status_code, 403)

    def test_con_secreto_correcto_crea_la_solicitud(self):
        with patch.object(settings, "COMPRAS_INTERNAL_SECRET", "dev-secreto"):
            response = self._llamar(
                {"requisicion": "REQ00001", "proyecto": "PRYA", "descripcion": "Requisición X — Cimentación", "solicitado_por": "u001"},
                secreto="dev-secreto",
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["requisicion"], "REQ00001")
        self.assertEqual(response.data["solicitado_por"], "u001")
        self.assertEqual(SolicitudCompra.objects.count(), 1)

    def test_secreto_incorrecto_da_403(self):
        with patch.object(settings, "COMPRAS_INTERNAL_SECRET", "dev-secreto"):
            response = self._llamar(
                {"requisicion": "REQ00001", "proyecto": "PRYA", "descripcion": "Cemento"}, secreto="otro-secreto"
            )
        self.assertEqual(response.status_code, 403)

    def test_es_idempotente_por_requisicion(self):
        with patch.object(settings, "COMPRAS_INTERNAL_SECRET", "dev-secreto"):
            primera = self._llamar(
                {"requisicion": "REQ00001", "proyecto": "PRYA", "descripcion": "Requisición X"}, secreto="dev-secreto"
            )
            segunda = self._llamar(
                {"requisicion": "REQ00001", "proyecto": "PRYA", "descripcion": "Requisición X (reintento)"},
                secreto="dev-secreto",
            )
        self.assertEqual(primera.status_code, 201)
        self.assertEqual(segunda.status_code, 200)
        self.assertEqual(primera.data["id_solicitud"], segunda.data["id_solicitud"])
        self.assertEqual(SolicitudCompra.objects.count(), 1)

    def test_campos_faltantes_da_400(self):
        with patch.object(settings, "COMPRAS_INTERNAL_SECRET", "dev-secreto"):
            response = self._llamar({"requisicion": "REQ00001"}, secreto="dev-secreto")
        self.assertEqual(response.status_code, 400)


class SubirEvidenciaRecepcionTests(TestCase):
    """Evidencia fotografica real de una Recepcion (21/Sep/2026, "falta el
    componente de tomar fotos") - sube a Drive via drive-service, mismo
    patron que TesoreriaFlujoViewSet.subir_comprobante."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(is_global=True, perm_keys=("compras.crear",), identity_user_id="u001")
        solicitud = SolicitudCompra.objects.create(
            proyecto="PRYA", descripcion="Cemento", created_by="u001", updated_by="u001"
        )
        cotizacion = Cotizacion.objects.create(
            solicitud=solicitud, proveedor="CP0001", proveedor_nombre="Materiales del Norte",
            created_by="u001", updated_by="u001",
        )
        orden = OrdenCompra.objects.create(
            folio="OC-TEST-0002", proyecto="PRYA", solicitud=solicitud, cotizacion=cotizacion,
            proveedor="CP0001", proveedor_nombre="Materiales del Norte", created_by="u001", updated_by="u001",
        )
        self.recepcion = Recepcion.objects.create(
            orden=orden, fecha="2026-09-21", hora="10:00:00", created_by="u001", updated_by="u001"
        )

    def _subir(self, archivo=None):
        request = self.factory.post(
            f"/api/recepciones/{self.recepcion.id_recepcion}/subir_evidencia/",
            {"file": archivo} if archivo else {},
            format="multipart",
        )
        request.effective_scope = self.scope
        view = RecepcionViewSet.as_view({"post": "subir_evidencia"})
        return view(request, pk=self.recepcion.id_recepcion)

    def test_sin_archivo_da_400(self):
        response = self._subir()
        self.assertEqual(response.status_code, 400)

    def test_con_archivo_sube_a_drive_y_guarda_el_link(self):
        mock_response = Mock(status_code=201)
        mock_response.json.return_value = {"web_view_link": "https://drive.google.com/file/x", "file_id": "abc123"}
        archivo = SimpleUploadedFile("foto.jpg", b"contenido", content_type="image/jpeg")
        with patch("compras_tesoreria.views.requests.post", return_value=mock_response) as mock_post:
            response = self._subir(archivo)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["link_drive"], "https://drive.google.com/file/x")
        self.recepcion.refresh_from_db()
        self.assertEqual(self.recepcion.link_drive, "https://drive.google.com/file/x")
        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs["params"]["perm"], "compras.editar")
        self.assertIn(self.recepcion.id_recepcion, kwargs["data"]["carpeta"])

    def test_fallo_de_red_no_tumba_nada(self):
        import requests

        archivo = SimpleUploadedFile("foto.jpg", b"contenido", content_type="image/jpeg")
        with patch("compras_tesoreria.views.requests.post", side_effect=requests.RequestException("caido")):
            response = self._subir(archivo)
        self.assertEqual(response.status_code, 502)
        self.recepcion.refresh_from_db()
        self.assertIsNone(self.recepcion.link_drive)
