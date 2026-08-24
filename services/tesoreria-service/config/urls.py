from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from tesoreria.views import (
    TesoreriaBancoViewSet,
    TesoreriaContraparteViewSet,
    TesoreriaContratoViewSet,
    TesoreriaCuentaViewSet,
    TesoreriaFlujoViewSet,
)

router = DefaultRouter()
router.register("contrapartes", TesoreriaContraparteViewSet, basename="tesoreriacontraparte")
router.register("bancos", TesoreriaBancoViewSet, basename="tesoreriabanco")
router.register("cuentas", TesoreriaCuentaViewSet, basename="tesoreriacuenta")
router.register("contratos", TesoreriaContratoViewSet, basename="tesoreriacontrato")
router.register("flujos", TesoreriaFlujoViewSet, basename="tesoreriaflujo")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
