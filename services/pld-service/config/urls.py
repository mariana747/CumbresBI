from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from pld.views import PldContraparteDocViewSet, PldContraparteKycViewSet

router = DefaultRouter()
router.register("kyc", PldContraparteKycViewSet, basename="pldcontrapartekyc")
router.register("kyc-docs", PldContraparteDocViewSet, basename="pldcontrapartedoc")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
