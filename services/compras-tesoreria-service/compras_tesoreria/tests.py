"""Primera suite del servicio (02/Sep/2026) - compras-tesoreria-service
tenia solo el esqueleto de Fase 0 hasta este corte. Cubre permisos por
accion, RLS por proyecto, y el flujo feliz completo: SolicitudCompra ->
Cotizacion (confirmar_extraccion, el enlace con el Motor Documental) ->
OrdenCompra (generar_desde_cotizacion) -> Recepcion (parcial y total)."""

from decimal import Decimal

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .models import Cotizacion, OrdenCompra, SolicitudCompra
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
        linea_cemento = next(l for l in response.data["lineas"] if "Cemento" in l["descripcion"])

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
        linea_varilla = next(l for l in OrdenCompraViewSet.as_view({"get": "retrieve"})(
            self._get_request_scoped(f"/api/ordenes/{orden_id}/"), pk=orden_id
        ).data["lineas"] if "Varilla" in l["descripcion"])
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
