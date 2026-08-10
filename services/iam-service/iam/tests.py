"""Pruebas de alcance (Fase 1, punto 1: ScopedManager conectado a los
ViewSets). Objetivo: demostrar que solo GLOBAL ve datos y cualquier otro
alcance no ve nada (fail-closed), ya que IamUser/IamUserRole todavia no
declaran SCOPE_FIELD_* (columna real de sociedad/proyecto - punto 2 del
plan, ver memoria de sesion "empresas-alcance-fase1").

Se evita firmar un JWT real: se ataca el ViewSet directo via
APIRequestFactory, adjuntando `request.effective_scope` a mano - es lo
mismo que hace EffectiveScopeMiddleware en produccion, sin la parte de
verificar la firma (eso ya esta cubierto en libs/cumbresbi-scope/tests).
"""

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from .auth_views import LoginRechazadoSinInvitacion, _upsert_identity
from .models import GeneralSociedad, IamInvitation, IamRole, IamUser, IamUserRole
from .views import GeneralSociedadViewSet, IamInvitationViewSet, IamUserRoleViewSet, IamUserViewSet


def _with_scope(request, scope):
    request.effective_scope = scope
    return request


class IamUserScopeTests(TestCase):
    """Directorio de usuarios (IamUserViewSet) - gate GLOBAL/no-GLOBAL."""

    def setUp(self):
        self.factory = APIRequestFactory()
        IamUser.objects.create(user_id="usr00001", primary_email="ana@cumbresbi.mx")
        IamUser.objects.create(user_id="usr00002", primary_email="beto@cumbresbi.mx")

    def _listar(self, scope):
        request = _with_scope(self.factory.get("/api/users/"), scope)
        view = IamUserViewSet.as_view({"get": "list"})
        return view(request)

    def test_global_ve_todo_el_directorio(self):
        response = self._listar(EffectiveScope(is_global=True))
        self.assertEqual(response.status_code, 200)
        emails = {row["primary_email"] for row in response.data}
        self.assertIn("ana@cumbresbi.mx", emails)
        self.assertIn("beto@cumbresbi.mx", emails)

    def test_sociedad_no_ve_nada_sin_columna_de_alcance(self):
        """IamUser aun no tiene sociedad_rfc/proyecto_id (gap documentado en
        roles-y-permisos.md) - cualquier alcance no-GLOBAL cae en
        fail-closed, no en fail-open."""
        scope = EffectiveScope(is_global=False, sociedad_rfcs=("#####1",))
        response = self._listar(scope)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_anonimo_no_ve_nada(self):
        response = self._listar(EffectiveScope.anonymous())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)


class IamUserRoleScopeTests(TestCase):
    """Historial de asignacion de roles (IamUserRoleViewSet) - mismo gate."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.test_user = IamUser.objects.create(user_id="usr09999", primary_email="ana@cumbresbi.mx")
        self.role, _ = IamRole.objects.get_or_create(
            role_key="TEST_ROLE_SCOPE",
            defaults={
                "role_name": "Rol de prueba (scope tests)",
                "created_by": self.test_user,
                "updated_by": self.test_user,
            },
        )
        self.assignment = IamUserRole.objects.create(
            user=self.test_user, role=self.role, scope_type=IamUserRole.SCOPE_GLOBAL
        )

    def _listar(self, scope):
        request = _with_scope(self.factory.get("/api/user-roles/"), scope)
        view = IamUserRoleViewSet.as_view({"get": "list"})
        return view(request)

    def test_global_ve_las_asignaciones(self):
        response = self._listar(EffectiveScope(is_global=True))
        self.assertEqual(response.status_code, 200)
        ids = {row["assignment_id"] for row in response.data}
        self.assertIn(self.assignment.assignment_id, ids)

    def test_no_global_no_ve_nada(self):
        response = self._listar(EffectiveScope(is_global=False, proyecto_ids=("p1",)))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)


class CumplimientoDePermisosEnEscrituraTests(TestCase):
    """Cumplimiento real de permisos en escritura (plan Fase 1, punto
    agregado 10/Ago/2026): otorgar/revocar un rol ya no basta con tener
    sesion - hace falta el perm_key exacto ("iam.crear"/"iam.editar").
    Antes de esto, cualquier alcance (incluso GLOBAL) podia escribir."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.actor = IamUser.objects.create(user_id="usr00003", primary_email="actor@cumbresbi.mx")
        self.target = IamUser.objects.create(user_id="usr00004", primary_email="destino@cumbresbi.mx")
        self.role = IamRole.objects.get_or_create(
            role_key="TEST_ROLE_PERM",
            defaults={"role_name": "Rol de prueba (permisos)", "created_by": self.actor, "updated_by": self.actor},
        )[0]

    def _otorgar_rol(self, scope):
        request = self.factory.post(
            "/api/user-roles/", {"user": self.target.user_id, "role": self.role.role_id}, format="json"
        )
        request.effective_scope = scope
        view = IamUserRoleViewSet.as_view({"post": "create"})
        return view(request)

    def test_global_sin_permiso_no_puede_otorgar_rol(self):
        """El gap que motivo este trabajo: GLOBAL (ve todo) no implica
        poder escribir - necesita el perm_key "iam.crear" asignado."""
        scope = EffectiveScope(is_global=True, perm_keys=())
        response = self._otorgar_rol(scope)
        self.assertEqual(response.status_code, 403)

    def test_con_permiso_iam_crear_si_puede_otorgar_rol(self):
        scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        response = self._otorgar_rol(scope)
        self.assertEqual(response.status_code, 201)

    def test_revocar_requiere_iam_editar_no_iam_crear(self):
        """Otorgar y revocar son permisos distintos - tener uno no da el otro."""
        assignment = IamUserRole.objects.create(user=self.target, role=self.role, scope_type="GLOBAL")
        request = self.factory.post(f"/api/user-roles/{assignment.assignment_id}/revoke/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        view = IamUserRoleViewSet.as_view({"post": "revoke"})
        response = view(request, pk=assignment.assignment_id)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(f"/api/user-roles/{assignment.assignment_id}/revoke/")
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.editar",))
        response2 = view(request2, pk=assignment.assignment_id)
        self.assertEqual(response2.status_code, 200)


class GeneralSociedadCrudTests(TestCase):
    """CRUD real de Sociedades (Gestion organizacional, /admin/organizacion) -
    el unico catalogo generico real (general_sociedades existe en el ERD;
    Centro/Proyecto NO, pertenecen a modulos que todavia no se construyen -
    ver memoria de sesion, decision 10/Ago/2026)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.sociedad = GeneralSociedad.objects.create(rfc="TEST010101ABC", razon_social="Sociedad de prueba")

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post("/api/sociedades/", {"rfc": "NEW010101XYZ", "razon_social": "Nueva"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = GeneralSociedadViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_iam_crear(self):
        request = self.factory.post("/api/sociedades/", {"rfc": "NEW010101XYZ", "razon_social": "Nueva"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        view = GeneralSociedadViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(GeneralSociedad.objects.filter(rfc="NEW010101XYZ").exists())

    def test_editar_requiere_iam_editar(self):
        request = self.factory.patch(f"/api/sociedades/{self.sociedad.rfc}/", {"razon_social": "Editada"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        view = GeneralSociedadViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=self.sociedad.rfc)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.patch(f"/api/sociedades/{self.sociedad.rfc}/", {"razon_social": "Editada"})
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.editar",))
        response2 = view(request2, pk=self.sociedad.rfc)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(response2.data["razon_social"], "Editada")

    def test_lectura_sigue_sin_permiso_especial(self):
        """Ver el catalogo de sociedades sigue abierto (igual que antes) -
        el gate nuevo es solo sobre escritura."""
        request = self.factory.get("/api/sociedades/")
        request.effective_scope = EffectiveScope.anonymous()
        view = GeneralSociedadViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(response.status_code, 200)


class GateDeInvitacionFormalTests(TestCase):
    """Pruebas del gate hibrido (decision 10/Ago/2026, ver memoria de
    sesion "iam-invitacion-alcance-incierto"): _upsert_identity ya NO
    autocrea el IamUser de cualquier correo del dominio aprobado - solo
    entra si ya tiene IamUser (login libre) o hay una IamInvitation
    pendiente para ese correo (invitacion formal)."""

    def _claims(self, email, sub="sub-000", name="Persona de Prueba"):
        return {"email": email, "sub": sub, "name": name, "email_verified": True, "hd": "cypcumbres.mx"}

    def test_usuario_ya_registrado_entra_con_login_libre(self):
        existente = IamUser.objects.create(user_id="usr00777", primary_email="ya@cypcumbres.mx")
        user = _upsert_identity(self._claims("ya@cypcumbres.mx"))
        self.assertEqual(user.user_id, existente.user_id)

    def test_correo_nuevo_sin_invitacion_se_rechaza_sin_crear_usuario(self):
        with self.assertRaises(LoginRechazadoSinInvitacion):
            _upsert_identity(self._claims("nuevo@cypcumbres.mx"))
        self.assertFalse(IamUser.objects.filter(primary_email__iexact="nuevo@cypcumbres.mx").exists())

    def test_correo_nuevo_con_invitacion_pendiente_entra_y_la_marca_aceptada(self):
        invitacion = IamInvitation.objects.create(email="invitado@cypcumbres.mx")
        user = _upsert_identity(self._claims("invitado@cypcumbres.mx"))
        self.assertEqual(user.primary_email, "invitado@cypcumbres.mx")
        invitacion.refresh_from_db()
        self.assertIsNotNone(invitacion.accepted_at)

    def test_invitacion_revocada_no_sirve(self):
        IamInvitation.objects.create(email="revocado@cypcumbres.mx", revoked_at=timezone.now())
        with self.assertRaises(LoginRechazadoSinInvitacion):
            _upsert_identity(self._claims("revocado@cypcumbres.mx"))

    def test_invitacion_ya_aceptada_no_sirve_dos_veces(self):
        """Si ya se acepto (el usuario ya existe) el flujo normal entra por
        el camino de 'ya registrado' - esto cubre el caso borde de que
        alguien borre su IamUser pero la invitacion ya aceptada no
        deberia revivir el gate abierto."""
        IamInvitation.objects.create(email="dos-veces@cypcumbres.mx", accepted_at=timezone.now())
        with self.assertRaises(LoginRechazadoSinInvitacion):
            _upsert_identity(self._claims("dos-veces@cypcumbres.mx"))


class IamInvitationViewSetTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.admin = IamUser.objects.create(user_id="usr00888", primary_email="admin@cypcumbres.mx")

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post("/api/invitaciones/", {"email": "nueva@cypcumbres.mx"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = IamInvitationViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_iam_crear(self):
        request = self.factory.post("/api/invitaciones/", {"email": "nueva@cypcumbres.mx"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        view = IamInvitationViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(IamInvitation.objects.filter(email="nueva@cypcumbres.mx").exists())

    def test_no_se_puede_invitar_un_correo_que_ya_tiene_usuario(self):
        IamUser.objects.create(user_id="usr00999", primary_email="existente@cypcumbres.mx")
        request = self.factory.post("/api/invitaciones/", {"email": "existente@cypcumbres.mx"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        view = IamInvitationViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_no_se_puede_duplicar_invitacion_pendiente(self):
        IamInvitation.objects.create(email="repetido@cypcumbres.mx")
        request = self.factory.post("/api/invitaciones/", {"email": "repetido@cypcumbres.mx"})
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        view = IamInvitationViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_revocar_requiere_iam_editar(self):
        invitacion = IamInvitation.objects.create(email="porrevocar@cypcumbres.mx", invited_by=self.admin)
        request = self.factory.post(f"/api/invitaciones/{invitacion.invitation_id}/revocar/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        view = IamInvitationViewSet.as_view({"post": "revocar"})
        response = view(request, pk=invitacion.invitation_id)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(f"/api/invitaciones/{invitacion.invitation_id}/revocar/")
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("iam.editar",))
        response2 = view(request2, pk=invitacion.invitation_id)
        self.assertEqual(response2.status_code, 200)
        invitacion.refresh_from_db()
        self.assertIsNotNone(invitacion.revoked_at)
