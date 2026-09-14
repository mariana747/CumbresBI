from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from auditoria.views import BitacoraAuditoriaViewSet

router = DefaultRouter()
router.register("bitacora", BitacoraAuditoriaViewSet, basename="bitacoraauditoria")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
