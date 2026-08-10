from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from iam.auth_views import google_callback, google_start, logout, me
from iam.views import (
    GeneralSociedadViewSet,
    IamGroupViewSet,
    IamMagicLinkViewSet,
    IamPermissionViewSet,
    IamRoleViewSet,
    IamUserCentroAccessViewSet,
    IamUserContratoAccessViewSet,
    IamUserGroupViewSet,
    IamUserRoleViewSet,
    IamUserViewSet,
)

router = DefaultRouter()
router.register("sociedades", GeneralSociedadViewSet, basename="generalsociedad")
router.register("users", IamUserViewSet, basename="iamuser")
router.register("roles", IamRoleViewSet, basename="iamrole")
router.register("permissions", IamPermissionViewSet, basename="iampermission")
router.register("user-roles", IamUserRoleViewSet, basename="iamuserrole")
router.register("groups", IamGroupViewSet, basename="iamgroup")
router.register("user-groups", IamUserGroupViewSet, basename="iamusergroup")
router.register("user-centro-access", IamUserCentroAccessViewSet, basename="iamusercentroaccess")
router.register("user-contrato-access", IamUserContratoAccessViewSet, basename="iamusercontratoaccess")
router.register("magic-links", IamMagicLinkViewSet, basename="iammagiclink")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/me/", me, name="me"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("auth/google/start", google_start, name="oidc-start"),
    path("auth/google/callback", google_callback, name="oidc-callback"),
    path("auth/logout", logout, name="oidc-logout"),
]
