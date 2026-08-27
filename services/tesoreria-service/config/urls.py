from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from tesoreria.views import (
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
    TesoreriaTicketProveedorViewSet,
    TesoreriaTicketReembolsoViewSet,
)

router = DefaultRouter()
router.register("contrapartes", TesoreriaContraparteViewSet, basename="tesoreriacontraparte")
router.register("contrapartes-relacion", TesoreriaContraparteRelacionViewSet, basename="tesoreriacontraparterelacion")
router.register("bancos", TesoreriaBancoViewSet, basename="tesoreriabanco")
router.register("cuentas", TesoreriaCuentaViewSet, basename="tesoreriacuenta")
router.register("contratos", TesoreriaContratoViewSet, basename="tesoreriacontrato")
router.register("flujos", TesoreriaFlujoViewSet, basename="tesoreriaflujo")
router.register("facturas", TesoreriaFacturaViewSet, basename="tesoreriafactura")
router.register("factura-conceptos", FacturaConceptoViewSet, basename="facturaconcepto")
router.register("factura-traslados", FacturaTrasladoViewSet, basename="facturatraslado")
router.register("factura-doctos-relacionados", FacturaDoctoRelacionadoViewSet, basename="facturadoctorelacionado")
router.register("complementos-pago", TesoreriaComplementoPagoViewSet, basename="tesoreriacomplementopago")
router.register("notas-credito", TesoreriaNotaCreditoViewSet, basename="tesoreriannotacredito")
router.register("nota-credito-conceptos", FacturaNotaCreditoViewSet, basename="facturanotacredito")
router.register("rec-nominas", TesoreriaRecNominaViewSet, basename="tesoreriarecnomina")
router.register("cortes-edc", TesoreriaCorteEdcViewSet, basename="tesoreriacorteedc")
router.register("saldos", TesoreriaSaldoViewSet, basename="tesoreriasaldo")
router.register("tickets-reembolso", TesoreriaTicketReembolsoViewSet, basename="tesoreriaticketreembolso")
router.register("tickets-proveedor", TesoreriaTicketProveedorViewSet, basename="tesoreriaticketproveedor")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
