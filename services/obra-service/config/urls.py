from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from obra.views import (
    ObraConceptoViewSet,
    ObraCorteSemanalViewSet,
    ObraEstimacionViewSet,
    ObraEtapaViewSet,
    ObraEvidenciaViewSet,
    ObraLoteViewSet,
)

router = DefaultRouter()
router.register("etapas", ObraEtapaViewSet, basename="obraetapa")
router.register("conceptos", ObraConceptoViewSet, basename="obraconcepto")
router.register("lotes", ObraLoteViewSet, basename="obralote")
router.register("estimaciones", ObraEstimacionViewSet, basename="obraestimacion")
router.register("evidencias", ObraEvidenciaViewSet, basename="obraevidencia")
router.register("cortes", ObraCorteSemanalViewSet, basename="obracortesemanal")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
