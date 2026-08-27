from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from iam.auth_views import canjear_acceso_externo, google_callback, google_start, logout, me, refresh
from iam.views import (
    GeneralSociedadViewSet,
    IamExternalCollaboratorViewSet,
    IamGroupViewSet,
    IamInvitationViewSet,
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
router.register("invitaciones", IamInvitationViewSet, basename="iaminvitation")
router.register("acceso-externo", IamExternalCollaboratorViewSet, basename="iamexternalcollaborator")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/me/", me, name="me"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("auth/google/start", google_start, name="oidc-start"),
    path("auth/google/callback", google_callback, name="oidc-callback"),
    path("auth/logout", logout, name="oidc-logout"),
    path("auth/refresh", refresh, name="session-refresh"),
    path("auth/acceso-externo/<str:token>", canjear_acceso_externo, name="canjear-acceso-externo"),
]

# TEMPORAL (ver iam/dev_views.py) - ni siquiera se registra la ruta si
# DEBUG=False, para no depender solo del 404 interno de la vista.
if settings.DEBUG:
    from iam.dev_views import dev_role_switch

    urlpatterns.append(path("auth/dev/switch-role", dev_role_switch, name="dev-role-switch"))
