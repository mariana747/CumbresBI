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

from unittest.mock import Mock, patch

import requests
from cumbresbi_scope.scope import EffectiveScope
from django.conf import settings
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from .audit_utils import emitir_evento_auditoria
from .auth_views import LoginRechazadoSinInvitacion, _upsert_identity
from .models import GeneralSociedad, IamInvitation, IamRole, IamUser, IamUserRole
from .session_utils import decode_session_jwt, issue_session_jwt
from .views import (
    GeneralSociedadViewSet,
    IamInvitationViewSet,
    IamRoleViewSet,
    IamUserRoleViewSet,
    IamUserViewSet,
)


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


class IamRoleCrearTests(TestCase):
    """31/Ago/2026 (pedido de Mariana: "super admin debe poder crear roles
    para colaboradores externos") - IamRoleViewSet.create() antes existia
    en la ruta pero el serializer era 100% read_only, asi que no tenia
    forma real de llenarse. Mismo criterio de permiso que
    IamUserRoleViewSet.create (iam.crear)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.actor = IamUser.objects.create(user_id="usr00010", primary_email="admin@cumbresbi.mx")

    def _crear_rol(self, scope, **overrides):
        body = {"role_key": "PLD_EXTERNO_TEST", "role_name": "PLD externo (prueba)"}
        body.update(overrides)
        request = self.factory.post("/api/roles/", body, format="json")
        request.effective_scope = scope
        view = IamRoleViewSet.as_view({"post": "create"})
        return view(request)

    def test_sin_permiso_da_403(self):
        response = self._crear_rol(EffectiveScope(is_global=True, perm_keys=(), identity_user_id=self.actor.user_id))
        self.assertEqual(response.status_code, 403)

    def test_con_iam_crear_crea_el_rol(self):
        scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",), identity_user_id=self.actor.user_id)
        response = self._crear_rol(scope)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role_key"], "PLD_EXTERNO_TEST")
        self.assertEqual(response.data["permisos"], [])

        rol = IamRole.objects.get(role_key="PLD_EXTERNO_TEST")
        self.assertEqual(rol.created_by, self.actor)
        self.assertEqual(rol.updated_by, self.actor)

    def test_sin_actor_identificado_da_400(self):
        # identity_user_id ausente/desconocido - no se puede resolver
        # created_by (FK obligatoria, ver IamRole.created_by).
        scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        response = self._crear_rol(scope)
        self.assertEqual(response.status_code, 400)

    def test_role_key_duplicado_da_400(self):
        scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",), identity_user_id=self.actor.user_id)
        self._crear_rol(scope)
        response = self._crear_rol(scope)
        self.assertEqual(response.status_code, 400)

    def test_crear_rol_externo(self):
        scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",), identity_user_id=self.actor.user_id)
        response = self._crear_rol(scope, role_key="ABOGADA_EXTERNA_TEST", tipo="EXTERNO")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["tipo"], "EXTERNO")

    def test_rol_nuevo_es_interno_por_default(self):
        scope = EffectiveScope(is_global=True, perm_keys=("iam.crear",), identity_user_id=self.actor.user_id)
        response = self._crear_rol(scope)
        self.assertEqual(response.data["tipo"], "INTERNO")


class IamRoleExternoScopeTests(TestCase):
    """31/Ago/2026 (pedido de Mariana: "en matriz de permisos hay que
    dividir entre internos y externos, ya que en externos se debe asignar
    su sociedad y proyecto") - un rol EXTERNO nunca se puede otorgar en
    alcance GLOBAL."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.actor = IamUser.objects.create(user_id="usr00013", primary_email="admin3@cumbresbi.mx")
        self.target = IamUser.objects.create(user_id="usr00014", primary_email="destino3@cumbresbi.mx")
        self.rol_externo = IamRole.objects.create(
            role_key="TEST_ROLE_EXTERNO", role_name="Rol de prueba (externo)", tipo=IamRole.TIPO_EXTERNO,
            created_by=self.actor, updated_by=self.actor,
        )
        self.scope_crear = EffectiveScope(
            is_global=True, perm_keys=("iam.crear",), identity_user_id=self.actor.user_id
        )

    def test_no_se_puede_otorgar_rol_externo_en_global(self):
        request = self.factory.post(
            "/api/user-roles/",
            {"user": self.target.user_id, "role": self.rol_externo.role_id, "scope_type": "GLOBAL"},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = IamUserRoleViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_si_se_puede_otorgar_rol_externo_acotado_a_sociedad(self):
        request = self.factory.post(
            "/api/user-roles/",
            {
                "user": self.target.user_id,
                "role": self.rol_externo.role_id,
                "scope_type": "SOCIEDAD",
                "scope_id": "#####3",
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = IamUserRoleViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 201)


class IamRoleBorrarRealTests(TestCase):
    """31/Ago/2026 ("quiero agregar tambien un borrado real") - DELETE
    real, pero bloqueado si el rol tiene alguna IamUserRole activa."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.actor = IamUser.objects.create(user_id="usr00015", primary_email="admin4@cumbresbi.mx")
        self.target = IamUser.objects.create(user_id="usr00016", primary_email="destino4@cumbresbi.mx")
        self.role = IamRole.objects.create(
            role_key="TEST_ROLE_BORRAR", role_name="Rol de prueba (borrar)",
            created_by=self.actor, updated_by=self.actor,
        )
        self.scope_editar = EffectiveScope(
            is_global=True, perm_keys=("iam.editar",), identity_user_id=self.actor.user_id
        )

    def _borrar(self):
        request = self.factory.delete(f"/api/roles/{self.role.role_id}/")
        request.effective_scope = self.scope_editar
        view = IamRoleViewSet.as_view({"delete": "destroy"})
        return view(request, pk=self.role.role_id)

    def test_borrar_requiere_iam_editar(self):
        request = self.factory.delete(f"/api/roles/{self.role.role_id}/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=(), identity_user_id=self.actor.user_id)
        view = IamRoleViewSet.as_view({"delete": "destroy"})
        response = view(request, pk=self.role.role_id)
        self.assertEqual(response.status_code, 403)

    def test_no_se_puede_borrar_con_asignacion_activa(self):
        IamUserRole.objects.create(user=self.target, role=self.role, scope_type="GLOBAL")
        response = self._borrar()
        self.assertEqual(response.status_code, 400)
        self.assertTrue(IamRole.objects.filter(pk=self.role.role_id).exists())

    def test_si_se_puede_borrar_sin_asignaciones(self):
        response = self._borrar()
        self.assertEqual(response.status_code, 204)
        self.assertFalse(IamRole.objects.filter(pk=self.role.role_id).exists())

    def test_si_se_puede_borrar_con_asignacion_ya_revocada(self):
        assignment = IamUserRole.objects.create(user=self.target, role=self.role, scope_type="GLOBAL")
        assignment.revoked_at = timezone.now()
        assignment.save(update_fields=["revoked_at"])
        response = self._borrar()
        self.assertEqual(response.status_code, 204)


class IamRoleDesactivarTests(TestCase):
    """31/Ago/2026 ("se pueden borrar?" -> soft-delete, no DELETE real).
    Un rol desactivado no se puede asignar a nadie nuevo, pero las
    asignaciones que ya existian antes de desactivarlo siguen vigentes."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.actor = IamUser.objects.create(user_id="usr00011", primary_email="admin2@cumbresbi.mx")
        self.target = IamUser.objects.create(user_id="usr00012", primary_email="destino2@cumbresbi.mx")
        self.role = IamRole.objects.create(
            role_key="TEST_ROLE_DESACT", role_name="Rol de prueba (desactivar)",
            created_by=self.actor, updated_by=self.actor,
        )
        self.scope_editar = EffectiveScope(
            is_global=True, perm_keys=("iam.editar",), identity_user_id=self.actor.user_id
        )

    def test_desactivar_requiere_iam_editar(self):
        request = self.factory.post(f"/api/roles/{self.role.role_id}/desactivar/", {}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=(), identity_user_id=self.actor.user_id)
        view = IamRoleViewSet.as_view({"post": "desactivar"})
        response = view(request, pk=self.role.role_id)
        self.assertEqual(response.status_code, 403)

    def test_desactivar_y_reactivar(self):
        request = self.factory.post(f"/api/roles/{self.role.role_id}/desactivar/", {}, format="json")
        request.effective_scope = self.scope_editar
        view = IamRoleViewSet.as_view({"post": "desactivar"})
        response = view(request, pk=self.role.role_id)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["activo"])

        request2 = self.factory.post(f"/api/roles/{self.role.role_id}/activar/", {}, format="json")
        request2.effective_scope = self.scope_editar
        view2 = IamRoleViewSet.as_view({"post": "activar"})
        response2 = view2(request2, pk=self.role.role_id)
        self.assertEqual(response2.status_code, 200)
        self.assertTrue(response2.data["activo"])

    def test_no_se_puede_asignar_un_rol_desactivado(self):
        self.role.activo = False
        self.role.save(update_fields=["activo"])

        request = self.factory.post(
            "/api/user-roles/", {"user": self.target.user_id, "role": self.role.role_id}, format="json"
        )
        request.effective_scope = EffectiveScope(
            is_global=True, perm_keys=("iam.crear",), identity_user_id=self.actor.user_id
        )
        view = IamUserRoleViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 400)

    def test_asignaciones_existentes_siguen_vigentes_tras_desactivar(self):
        # Una asignacion creada ANTES de desactivar el rol no se revoca sola.
        assignment = IamUserRole.objects.create(user=self.target, role=self.role, scope_type="GLOBAL")
        self.role.activo = False
        self.role.save(update_fields=["activo"])
        self.assertIsNone(IamUserRole.objects.get(pk=assignment.pk).revoked_at)


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


class EmitirEventoAuditoriaTests(TestCase):
    """18/Ago/2026: antes solo se atrapaba RequestException (red caida) - un
    4xx/5xx de audit-service rechazando el evento se perdia en silencio, sin
    ningun log. Ver mismo hallazgo en pld-service/pld/audit_utils.py."""

    def test_no_truena_si_audit_service_no_responde(self):
        with patch("iam.audit_utils.requests.post", side_effect=requests.RequestException()):
            with self.assertLogs("iam.audit_utils", level="WARNING") as logs:
                emitir_evento_auditoria("iam_users.suspend", "iam_users", "usr00001")
        self.assertIn("No se pudo registrar", logs.output[0])

    def test_loguea_si_audit_service_rechaza_el_evento(self):
        respuesta = Mock(status_code=400, ok=False, text="entidad_id invalido")
        with patch("iam.audit_utils.requests.post", return_value=respuesta):
            with self.assertLogs("iam.audit_utils", level="WARNING") as logs:
                emitir_evento_auditoria("iam_users.suspend", "iam_users", "usr00001")
        self.assertIn("rechazo el evento", logs.output[0])
        self.assertIn("400", logs.output[0])

    def test_no_loguea_nada_si_audit_service_acepta_el_evento(self):
        respuesta = Mock(status_code=201, ok=True)
        with patch("iam.audit_utils.requests.post", return_value=respuesta):
            with self.assertNoLogs("iam.audit_utils", level="WARNING"):
                emitir_evento_auditoria("iam_users.suspend", "iam_users", "usr00001")


class SessionRefreshTests(TestCase):
    """/auth/refresh (Opcion A, ver memoria de sesion): reemite la cookie
    de sesion con los roles/permisos ACTUALES de BD sin pedir login de
    nuevo. self.client (Django test client) en vez de APIRequestFactory
    porque aqui si importa el manejo real de cookies (set_cookie/
    delete_cookie), a diferencia del resto de este archivo que ataca los
    ViewSets con effective_scope inyectado a mano."""

    def setUp(self):
        self.user = IamUser.objects.create(user_id="usr07001", primary_email="refresh@cypcumbres.mx")
        self.role, _ = IamRole.objects.get_or_create(
            role_key="TEST_ROLE_REFRESH",
            defaults={"role_name": "Rol de prueba (refresh tests)", "created_by": self.user, "updated_by": self.user},
        )

    def _set_session_cookie(self):
        self.client.cookies[settings.SESSION_COOKIE_NAME_JWT] = issue_session_jwt(self.user)

    def test_sin_cookie_da_401(self):
        response = self.client.get("/auth/refresh")
        self.assertEqual(response.status_code, 401)

    def test_cookie_invalida_da_401(self):
        self.client.cookies[settings.SESSION_COOKIE_NAME_JWT] = "token-basura"
        response = self.client.get("/auth/refresh")
        self.assertEqual(response.status_code, 401)

    def test_usuario_suspendido_da_401_y_borra_la_cookie(self):
        self._set_session_cookie()
        self.user.status = IamUser.STATUS_SUSPENDED
        self.user.save(update_fields=["status"])
        response = self.client.get("/auth/refresh")
        self.assertEqual(response.status_code, 401)
        # delete_cookie() manda Set-Cookie con valor vacio + Max-Age=0, no
        # omite el header - se verifica el valor, no la presencia del nombre.
        self.assertEqual(response.cookies[settings.SESSION_COOKIE_NAME_JWT].value, "")

    def test_refresca_con_los_roles_actuales_de_bd(self):
        """El caso real que motivo /auth/refresh: un admin otorga un rol
        DESPUES de que el usuario ya tenia su JWT viejo (sin ese rol) - el
        refresh debe traer el rol nuevo sin que el usuario cierre sesion."""
        self._set_session_cookie()
        old_claims = decode_session_jwt(self.client.cookies[settings.SESSION_COOKIE_NAME_JWT].value)
        self.assertNotIn("TEST_ROLE_REFRESH", old_claims["role_keys"])

        IamUserRole.objects.create(user=self.user, role=self.role, scope_type=IamUserRole.SCOPE_GLOBAL)

        response = self.client.get("/auth/refresh")
        self.assertEqual(response.status_code, 200)
        new_token = self.client.cookies[settings.SESSION_COOKIE_NAME_JWT].value
        new_claims = decode_session_jwt(new_token)
        self.assertIn("TEST_ROLE_REFRESH", new_claims["role_keys"])
