from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from materiales.views import (
    ConceptoPresupuestoViewSet,
    EvidenciaRecepcionViewSet,
    ManoObraCatalogoViewSet,
    MaterialCatalogoViewSet,
    PresupuestoFirmaViewSet,
    PresupuestoViewSet,
    RequisicionViewSet,
    SolicitudMaterialViewSet,
)

router = DefaultRouter()
router.register("materiales", MaterialCatalogoViewSet, basename="materialcatalogo")
router.register("mano-obra", ManoObraCatalogoViewSet, basename="manoobracatalogo")
router.register("presupuestos", PresupuestoViewSet, basename="presupuesto")
router.register("conceptos-presupuesto", ConceptoPresupuestoViewSet, basename="conceptopresupuesto")
router.register("presupuesto-firmas", PresupuestoFirmaViewSet, basename="presupuestofirma")
router.register("solicitudes", SolicitudMaterialViewSet, basename="solicitudmaterial")
router.register("evidencias-recepcion", EvidenciaRecepcionViewSet, basename="evidenciarecepcion")
router.register("requisiciones", RequisicionViewSet, basename="requisicion")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
