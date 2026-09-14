from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from rrhh.views import RrhhEmpleadoViewSet, RrhhPuestoViewSet

router = DefaultRouter()
router.register("empleados", RrhhEmpleadoViewSet, basename="rrhhempleado")
router.register("puestos", RrhhPuestoViewSet, basename="rrhhpuesto")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
