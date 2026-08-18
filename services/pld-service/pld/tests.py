"""Pruebas de alcance (Fase 1, punto 2: columna real sociedad_rfc en
PldContraparteKyc). A diferencia de iam-service, aqui SI hay filtro fino
por sociedad (no solo el gate GLOBAL/no-GLOBAL) - demuestra que un usuario
de una sociedad NO ve los expedientes de otra (requisito de cierre de
Fase 1, punto 3 del plan: "2 usuarios de distinto alcance, uno no ve los
datos del otro").
"""

import datetime
from unittest.mock import Mock, patch

import requests
from cumbresbi_scope.scope import EffectiveScope
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from .audit_utils import emitir_evento_auditoria
from .models import PldContraparteDoc, PldContraparteKyc, PldTicketCliente
from .ticket_utils import hash_token
from .views import PldContraparteDocViewSet, PldContraparteKycViewSet, PldTicketClienteViewSet

RFC_TIZARA = "#####1"
RFC_CAPITAL = "#####2"


def _kyc(id_contraparte, sociedad_rfc):
    return PldContraparteKyc.objects.create(
        id_contraparte=id_contraparte,
        fecha_nac_const=datetime.date(1990, 1, 1),
        pais_nac_const="Mexico",
        nacionalidad="Mexicana",
        ocupacion_act_economica="Empresario",
        dom_calle="Calle 1",
        dom_numero_ext="1",
        dom_numero_int="1",
        dom_colonia="Centro",
        dom_municipio_alcaldia="CDMX",
        dom_estado="CDMX",
        dom_cp="01000",
        dom_pais="Mexico",
        telefono_fijo="5555555555",
        telefono_sms="5555555555",
        estado_civil="SOLTERO",
        ident_fideicomiso="FID1",
        aprobado_por="system01",
        fecha_vencimiento=datetime.date(2030, 1, 1),
        sociedad_rfc=sociedad_rfc,
    )


def _with_scope(request, scope):
    request.effective_scope = scope
    return request


class PldContraparteKycScopeTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc_tizara = _kyc("cp000001", RFC_TIZARA)
        self.kyc_capital = _kyc("cp000002", RFC_CAPITAL)
        self.kyc_sin_sociedad = _kyc("cp000003", None)

    def _listar(self, scope):
        request = _with_scope(self.factory.get("/api/kyc/"), scope)
        view = PldContraparteKycViewSet.as_view({"get": "list"})
        return view(request)

    def test_global_ve_los_tres_expedientes(self):
        response = self._listar(EffectiveScope(is_global=True))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)

    def test_usuario_de_tizara_solo_ve_su_expediente(self):
        scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        response = self._listar(scope)
        ids = {row["id_contraparte"] for row in response.data}
        self.assertEqual(ids, {"cp000001"})

    def test_usuario_de_capital_no_ve_el_expediente_de_tizara(self):
        """El caso de seguridad clave: dos usuarios de distinta sociedad,
        ninguno ve los datos del otro."""
        scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_CAPITAL,))
        response = self._listar(scope)
        ids = {row["id_contraparte"] for row in response.data}
        self.assertEqual(ids, {"cp000002"})
        self.assertNotIn("cp000001", ids)

    def test_expediente_sin_sociedad_asignada_es_invisible_para_no_global(self):
        """Backfill pendiente (ver memoria "empresas-alcance-fase1"): un
        expediente con sociedad_rfc=NULL no hace match con ninguna
        sociedad - queda fuera hasta que se le asigne una."""
        scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA, RFC_CAPITAL))
        response = self._listar(scope)
        ids = {row["id_contraparte"] for row in response.data}
        self.assertNotIn("cp000003", ids)

    def test_anonimo_no_ve_nada(self):
        response = self._listar(EffectiveScope.anonymous())
        self.assertEqual(len(response.data), 0)


class PldContraparteDocScopeTests(TestCase):
    """El documento hereda el alcance de su expediente KYC padre
    (SCOPE_FIELD_SOCIEDAD = "kyc__sociedad_rfc")."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc_tizara = _kyc("cp000001", RFC_TIZARA)
        self.kyc_capital = _kyc("cp000002", RFC_CAPITAL)
        PldContraparteDoc.objects.create(kyc=self.kyc_tizara, denominacion="INE")
        PldContraparteDoc.objects.create(kyc=self.kyc_capital, denominacion="Acta constitutiva")

    def _listar(self, scope):
        request = _with_scope(self.factory.get("/api/kyc-docs/"), scope)
        view = PldContraparteDocViewSet.as_view({"get": "list"})
        return view(request)

    def test_usuario_de_tizara_solo_ve_los_documentos_de_su_sociedad(self):
        scope = EffectiveScope(is_global=False, sociedad_rfcs=(RFC_TIZARA,))
        response = self._listar(scope)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["denominacion"], "INE")


class CumplimientoDePermisosEnEscrituraTests(TestCase):
    """Cumplimiento real de permisos en escritura (plan Fase 1): crear un
    expediente requiere "pld-compliance.crear"; aprobarlo requiere
    "pld-compliance.aprobar" - un perm_key distinto, a proposito
    (segregacion de funciones PLD_ANALISTA/PLD_APROBADOR,
    roles-y-permisos.md sec. 2/6)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc = _kyc("cp000009", RFC_TIZARA)

    def _crear_kyc(self, scope):
        request = self.factory.post(
            "/api/kyc/",
            {
                "id_contraparte": "cp000010",
                "fecha_nac_const": "1990-01-01",
                "pais_nac_const": "Mexico",
                "nacionalidad": "Mexicana",
                "ocupacion_act_economica": "Empresario",
                "dom_calle": "Calle 1",
                "dom_numero_ext": "1",
                "dom_numero_int": "1",
                "dom_colonia": "Centro",
                "dom_municipio_alcaldia": "CDMX",
                "dom_estado": "CDMX",
                "dom_cp": "01000",
                "dom_pais": "Mexico",
                "telefono_fijo": "5555555555",
                "telefono_sms": "5555555555",
                "estado_civil": "SOLTERO",
                "ident_fideicomiso": "FID9",
                "aprobado_por": "system01",
                "fecha_vencimiento": "2030-01-01",
                "sociedad_rfc": RFC_TIZARA,
                "created_by": "system01",
                "updated_by": "system01",
            },
            format="json",
        )
        request.effective_scope = scope
        view = PldContraparteKycViewSet.as_view({"post": "create"})
        return view(request)

    def _aprobar_kyc(self, scope):
        request = self.factory.post(f"/api/kyc/{self.kyc.id_kyc}/aprobar/", {"aprobado_por": "usr00001"})
        request.effective_scope = scope
        view = PldContraparteKycViewSet.as_view({"post": "aprobar"})
        return view(request, pk=self.kyc.id_kyc)

    def test_analista_sin_permiso_no_puede_crear_expediente(self):
        response = self._crear_kyc(EffectiveScope(is_global=True, perm_keys=()))
        self.assertEqual(response.status_code, 403)

    def test_analista_con_permiso_si_puede_crear_expediente(self):
        response = self._crear_kyc(EffectiveScope(is_global=True, perm_keys=("pld-compliance.crear",)))
        self.assertEqual(response.status_code, 201)

    def test_analista_no_puede_aprobar_su_propio_permiso_de_crear(self):
        """Segregacion de funciones: tener "crear" no da "aprobar"."""
        response = self._aprobar_kyc(EffectiveScope(is_global=True, perm_keys=("pld-compliance.crear",)))
        self.assertEqual(response.status_code, 403)

    def test_aprobador_con_permiso_si_puede_aprobar(self):
        response = self._aprobar_kyc(EffectiveScope(is_global=True, perm_keys=("pld-compliance.aprobar",)))
        self.assertEqual(response.status_code, 200)

    def test_borrar_documento_sin_permiso_da_403(self):
        # Hallazgo real (18/Ago/2026): "destroy" no estaba en get_permissions
        # de PldContraparteDocViewSet - caia al default global de DRF
        # (AllowAny), cualquiera podia borrar documentos sin sesion.
        doc = PldContraparteDoc.objects.create(kyc=self.kyc, denominacion="INE duplicado")
        request = self.factory.delete(f"/api/kyc-docs/{doc.id_kyc_doc}/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = PldContraparteDocViewSet.as_view({"delete": "destroy"})
        response = view(request, pk=doc.id_kyc_doc)
        self.assertEqual(response.status_code, 403)
        self.assertTrue(PldContraparteDoc.objects.filter(pk=doc.id_kyc_doc).exists())

    def test_borrar_documento_con_permiso_editar_si_funciona(self):
        doc = PldContraparteDoc.objects.create(kyc=self.kyc, denominacion="INE duplicado")
        request = self.factory.delete(f"/api/kyc-docs/{doc.id_kyc_doc}/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("pld-compliance.editar",))
        view = PldContraparteDocViewSet.as_view({"delete": "destroy"})
        response = view(request, pk=doc.id_kyc_doc)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(PldContraparteDoc.objects.filter(pk=doc.id_kyc_doc).exists())


class PldTicketClienteTests(TestCase):
    """Frontend de PldTicketCliente (magic link de KYC externo, Fase 2
    Semana 9): crear/revocar requieren permiso real, "validar" es publico
    (el cliente externo canjea por token, sin sesion previa - mismo
    criterio que IamMagicLink, ver memoria de sesion
    "iam-magic-link-alcance")."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc = _kyc("cp000099", RFC_TIZARA)

    def _crear_ticket(self, scope):
        request = self.factory.post(
            "/api/ticket-cliente/",
            {
                "kyc": self.kyc.id_kyc,
                "email": "cliente@externo.com",
                "issued_by": "usr00001",
                "expires_at": (timezone.now() + datetime.timedelta(minutes=30)).isoformat(),
                "max_uses": 1,
            },
            format="json",
        )
        request.effective_scope = scope
        view = PldTicketClienteViewSet.as_view({"post": "create"})
        return view(request)

    def test_crear_sin_permiso_da_403(self):
        response = self._crear_ticket(EffectiveScope(is_global=True, perm_keys=()))
        self.assertEqual(response.status_code, 403)

    def test_crear_con_permiso_regresa_token_en_claro(self):
        response = self._crear_ticket(EffectiveScope(is_global=True, perm_keys=("pld-compliance.crear",)))
        self.assertEqual(response.status_code, 201)
        self.assertIn("token", response.data)
        self.assertTrue(response.data["token"])
        # El hash del token en claro debe coincidir con el guardado - la
        # unica prueba real de que "validar" despues va a poder encontrarlo.
        ticket = PldTicketCliente.objects.get(pk=response.data["id_pld_ticket"])
        self.assertEqual(ticket.token_hash, hash_token(response.data["token"]))

    def test_revocar_requiere_permiso_editar(self):
        ticket = PldTicketCliente.objects.create(
            kyc=self.kyc,
            email="cliente@externo.com",
            issued_by="usr00001",
            token_hash=hash_token("token-de-prueba"),
            expires_at=timezone.now() + datetime.timedelta(minutes=30),
            max_uses=1,
        )
        request = self.factory.post(f"/api/ticket-cliente/{ticket.id_pld_ticket}/revocar/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("pld-compliance.crear",))
        view = PldTicketClienteViewSet.as_view({"post": "revocar"})
        response = view(request, pk=ticket.id_pld_ticket)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(f"/api/ticket-cliente/{ticket.id_pld_ticket}/revocar/")
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("pld-compliance.editar",))
        response2 = view(request2, pk=ticket.id_pld_ticket)
        self.assertEqual(response2.status_code, 200)
        ticket.refresh_from_db()
        self.assertIsNotNone(ticket.revoked_at)

    def test_validar_es_publico_y_regresa_el_kyc(self):
        """El cliente externo no tiene sesion - validar debe funcionar con
        EffectiveScope.anonymous(), sin necesitar ningun perm_key."""
        ticket = PldTicketCliente.objects.create(
            kyc=self.kyc,
            email="cliente@externo.com",
            issued_by="usr00001",
            token_hash=hash_token("token-valido-123"),
            expires_at=timezone.now() + datetime.timedelta(minutes=30),
            max_uses=1,
        )
        request = self.factory.post("/api/ticket-cliente/validar/", {"token": "token-valido-123"}, format="json")
        request.effective_scope = EffectiveScope.anonymous()
        view = PldTicketClienteViewSet.as_view({"post": "validar"})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["kyc"]["id_contraparte"], "cp000099")
        ticket.refresh_from_db()
        self.assertEqual(ticket.uses_count, 1)

    def test_validar_token_revocado_da_403(self):
        PldTicketCliente.objects.create(
            kyc=self.kyc,
            email="cliente@externo.com",
            issued_by="usr00001",
            token_hash=hash_token("token-revocado"),
            expires_at=timezone.now() + datetime.timedelta(minutes=30),
            max_uses=1,
            revoked_at=timezone.now(),
        )
        request = self.factory.post("/api/ticket-cliente/validar/", {"token": "token-revocado"}, format="json")
        request.effective_scope = EffectiveScope.anonymous()
        view = PldTicketClienteViewSet.as_view({"post": "validar"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_validar_token_agotado_da_403(self):
        PldTicketCliente.objects.create(
            kyc=self.kyc,
            email="cliente@externo.com",
            issued_by="usr00001",
            token_hash=hash_token("token-agotado"),
            expires_at=timezone.now() + datetime.timedelta(minutes=30),
            max_uses=1,
            uses_count=1,
        )
        request = self.factory.post("/api/ticket-cliente/validar/", {"token": "token-agotado"}, format="json")
        request.effective_scope = EffectiveScope.anonymous()
        view = PldTicketClienteViewSet.as_view({"post": "validar"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_validar_token_inexistente_da_404(self):
        request = self.factory.post("/api/ticket-cliente/validar/", {"token": "no-existe"}, format="json")
        request.effective_scope = EffectiveScope.anonymous()
        view = PldTicketClienteViewSet.as_view({"post": "validar"})
        response = view(request)
        self.assertEqual(response.status_code, 404)


class WorkflowEstadoLlenadoTests(TestCase):
    """Workflow hibrido de estado_llenado (docs/architecture/
    pld-fase2-alcance.md sec. 3, decision de Mariana 12/Ago/2026): se
    recalcula solo segun el status de los documentos, salvo override
    manual via PATCH."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc = _kyc("cp000050", RFC_TIZARA)

    def test_expediente_sin_documentos_es_pendiente(self):
        self.assertEqual(self.kyc.estado_llenado, PldContraparteKyc.ESTADO_PENDIENTE)

    def test_agregar_documento_no_entregado_marca_incompleto(self):
        PldContraparteDoc.objects.create(
            kyc=self.kyc, denominacion="INE", status=PldContraparteDoc.STATUS_PENDIENTE
        )
        self.kyc.refresh_from_db()
        self.assertEqual(self.kyc.estado_llenado, PldContraparteKyc.ESTADO_INCOMPLETO)

    def test_todos_los_documentos_entregados_o_aprobados_marca_entregado(self):
        PldContraparteDoc.objects.create(
            kyc=self.kyc, denominacion="INE", status=PldContraparteDoc.STATUS_ENTREGADO
        )
        PldContraparteDoc.objects.create(
            kyc=self.kyc, denominacion="CURP", status=PldContraparteDoc.STATUS_APROBADO
        )
        self.kyc.refresh_from_db()
        self.assertEqual(self.kyc.estado_llenado, PldContraparteKyc.ESTADO_ENTREGADO)

    def test_override_manual_detiene_el_recalculo_automatico(self):
        """PATCH directo a estado_llenado prende estado_llenado_manual - a
        partir de ahi, agregar documentos NO debe pisar ese valor."""
        request = self.factory.patch(
            f"/api/kyc/{self.kyc.id_kyc}/", {"estado_llenado": "ENTREGADO"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("pld-compliance.editar",))
        view = PldContraparteKycViewSet.as_view({"patch": "partial_update"})
        response = view(request, pk=self.kyc.id_kyc)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["estado_llenado_manual"])

        # Agregar un documento pendiente normalmente forzaria INCOMPLETO -
        # pero el override manual debe ganar.
        PldContraparteDoc.objects.create(
            kyc=self.kyc, denominacion="INE", status=PldContraparteDoc.STATUS_PENDIENTE
        )
        self.kyc.refresh_from_db()
        self.assertEqual(self.kyc.estado_llenado, PldContraparteKyc.ESTADO_ENTREGADO)
        self.assertTrue(self.kyc.estado_llenado_manual)

    def test_reactivar_auto_estado_recalcula_y_apaga_el_override(self):
        self.kyc.estado_llenado_manual = True
        self.kyc.estado_llenado = PldContraparteKyc.ESTADO_ENTREGADO
        self.kyc.save(update_fields=["estado_llenado_manual", "estado_llenado"])
        PldContraparteDoc.objects.create(
            kyc=self.kyc, denominacion="INE", status=PldContraparteDoc.STATUS_PENDIENTE
        )

        request = self.factory.post(f"/api/kyc/{self.kyc.id_kyc}/reactivar_auto_estado/")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("pld-compliance.editar",))
        view = PldContraparteKycViewSet.as_view({"post": "reactivar_auto_estado"})
        response = view(request, pk=self.kyc.id_kyc)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["estado_llenado_manual"])
        self.assertEqual(response.data["estado_llenado"], PldContraparteKyc.ESTADO_INCOMPLETO)


class ConfirmarExtraccionTests(TestCase):
    """confirmar_extraccion (docs/architecture/pld-fase2-alcance.md sec. 1,
    memoria de sesion "pld-flujo-extraccion-vs-archivo"): guarda en el
    expediente solo los campos ya validados por el analista, filtrados
    contra CAMPOS_CONFIRMABLES."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc = _kyc("cp000060", RFC_TIZARA)
        # confirmar_extraccion ahora emite auditoria (18/Ago/2026, ver
        # pld/audit_utils.py) - se mockea aqui para todas las pruebas de la
        # clase, no solo la que la verifica explicitamente, para no pegarle
        # a audit-service real desde pruebas que no la necesitan.
        patcher = patch("requests.post", return_value=Mock(status_code=200))
        self.mock_audit_post = patcher.start()
        self.addCleanup(patcher.stop)

    def _confirmar(self, campos, scope=None):
        request = self.factory.post(
            f"/api/kyc/{self.kyc.id_kyc}/confirmar_extraccion/", {"campos": campos}, format="json"
        )
        request.effective_scope = scope or EffectiveScope(
            is_global=True, perm_keys=("pld-compliance.editar",)
        )
        view = PldContraparteKycViewSet.as_view({"post": "confirmar_extraccion"})
        return view(request, pk=self.kyc.id_kyc)

    def test_requiere_permiso_editar(self):
        response = self._confirmar(
            {"curp": "CURP000000HDFRRL01"}, scope=EffectiveScope(is_global=True, perm_keys=())
        )
        self.assertEqual(response.status_code, 403)

    def test_guarda_solo_los_campos_confirmables(self):
        response = self._confirmar(
            {
                "curp": "CURP000000HDFRRL01",
                "clave_elector": "Alguien Que No Tiene Columna Propia",
            }
        )
        self.assertEqual(response.status_code, 200)
        self.kyc.refresh_from_db()
        self.assertEqual(self.kyc.curp, "CURP000000HDFRRL01")
        # "clave_elector" no es un campo del modelo - se ignora, no truena.
        self.assertNotIn("clave_elector", response.data)

    def test_rechaza_si_ningun_campo_es_confirmable(self):
        response = self._confirmar({"clave_elector": "Alguien"})
        self.assertEqual(response.status_code, 400)

    def test_alias_razon_social_se_guarda_como_nombre_completo(self):
        # ALIAS_CAMPOS (18/Ago/2026, ver views.py) - el Motor Documental
        # extrae "razon_social" (acta constitutiva) o "razon_social_o_nombre"
        # (constancia fiscal) segun el documento; ambos se traducen al mismo
        # campo del modelo antes de guardarse.
        response = self._confirmar({"razon_social": "Consultoria y Proyectos Cumbres SA de CV"})
        self.assertEqual(response.status_code, 200)
        self.kyc.refresh_from_db()
        self.assertEqual(self.kyc.nombre_completo, "Consultoria y Proyectos Cumbres SA de CV")

    def test_extraccion_ine_llena_domicilio_y_fecha_nacimiento(self):
        # Regresion (18/Ago/2026, hallazgo real: el prompt de pld.ine pedia
        # un objeto anidado "domicilio" y "fecha_nacimiento" en vez de los
        # nombres planos que este endpoint acepta - el domicilio y la fecha
        # de nacimiento se perdian en silencio aunque Gemini los extrajera
        # bien. Ver docint/prompts.py, campos ya corregidos a plano/
        # fecha_nac_const - esta prueba fija el contrato para que no se
        # vuelva a romper la alineacion entre ambos servicios.
        campos = {
            "nombre_completo": "Juan Perez Lopez",
            "curp": "PELJ900101HDFRRN01",
            "fecha_nac_const": "1990-01-01",
            "dom_calle": "Laurel",
            "dom_numero_ext": "14",
            "dom_colonia": "Centro",
            "dom_municipio_alcaldia": "Cuauhtemoc",
            "dom_estado": "CDMX",
            "dom_cp": "06000",
            "tipo_identificacion": "INE",
            "numero_identificacion": "1234567890",
        }
        response = self._confirmar(campos)
        self.assertEqual(response.status_code, 200)
        self.kyc.refresh_from_db()
        self.assertEqual(self.kyc.fecha_nac_const.isoformat(), "1990-01-01")
        self.assertEqual(self.kyc.dom_calle, "Laurel")
        self.assertEqual(self.kyc.dom_numero_ext, "14")
        self.assertEqual(self.kyc.dom_colonia, "Centro")
        self.assertEqual(self.kyc.dom_municipio_alcaldia, "Cuauhtemoc")
        self.assertEqual(self.kyc.dom_estado, "CDMX")
        self.assertEqual(self.kyc.dom_cp, "06000")

    def test_rechaza_body_vacio(self):
        response = self._confirmar({})
        self.assertEqual(response.status_code, 400)

    def test_confirmar_extraccion_emite_evento_de_auditoria(self):
        response = self._confirmar({"curp": "CURP000000HDFRRL01"})
        self.assertEqual(response.status_code, 200)
        payload = self.mock_audit_post.call_args.kwargs["json"]
        self.assertEqual(payload["accion"], "pld_contrapartes_kyc.confirmar_extraccion")
        self.assertEqual(payload["entidad_id"], str(self.kyc.id_kyc))
        self.assertEqual(payload["valores_nuevos"]["campos"], {"curp": "CURP000000HDFRRL01"})


class SubirDocumentoPublicoTests(TestCase):
    """Formulario publico de KYC externo (docs/architecture/
    pld-fase2-alcance.md sec. 2, memoria de sesion
    "motor-documental-seleccion-archivos-drive"): subir_documento es
    publico (sin sesion), verifica reCAPTCHA y sube a Drive usando el
    secreto interno servicio-a-servicio, no un JWT de usuario."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc = _kyc("cp000070", RFC_TIZARA)
        self.ticket = PldTicketCliente.objects.create(
            kyc=self.kyc,
            email="cliente@externo.com",
            issued_by="usr00001",
            token_hash=hash_token("token-valido"),
            expires_at=timezone.now() + datetime.timedelta(minutes=30),
            max_uses=5,
        )
        self.view = PldTicketClienteViewSet.as_view({"post": "subir_documento"})

    def _subir(self, token="token-valido", recaptcha_token="cualquier-cosa", archivo=None):
        archivo = archivo or SimpleUploadedFile("ine.pdf", b"contenido-fake", content_type="application/pdf")
        request = self.factory.post(
            "/api/ticket-cliente/subir_documento/",
            {"token": token, "recaptcha_token": recaptcha_token, "file": archivo},
        )
        request.effective_scope = EffectiveScope.anonymous()
        return self.view(request)

    def test_es_publico_sin_sesion(self):
        with patch("pld.views.recaptcha.verificar", return_value=True), patch("pld.views.requests.post") as mock_post:
            mock_post.return_value = Mock(
                status_code=201,
                json=lambda: {
                    "file_id": "abc123",
                    "web_view_link": "https://drive/abc123",
                    "mime_type": "application/pdf",
                    "tamano_bytes": 14,
                },
            )
            response = self._subir()
        self.assertEqual(response.status_code, 201)

    def test_token_invalido_da_404(self):
        response = self._subir(token="no-existe")
        self.assertEqual(response.status_code, 404)

    def test_recaptcha_invalido_rechaza(self):
        with patch("pld.views.recaptcha.verificar", return_value=False):
            response = self._subir()
        self.assertEqual(response.status_code, 400)

    def test_sin_expediente_asociado_rechaza(self):
        ticket_sin_kyc = PldTicketCliente.objects.create(
            email="otro@externo.com",
            issued_by="usr00001",
            token_hash=hash_token("token-sin-kyc"),
            expires_at=timezone.now() + datetime.timedelta(minutes=30),
            max_uses=5,
        )
        with patch("pld.views.recaptcha.verificar", return_value=True):
            response = self._subir(token="token-sin-kyc")
        self.assertEqual(response.status_code, 400)
        ticket_sin_kyc.refresh_from_db()

    def test_no_consume_uses_count_del_ticket(self):
        """A diferencia de validar(), subir varios documentos bajo el mismo
        link no debe agotarlo - eso lo controla el paso de "validar" al
        cargar la pagina, no cada subida individual."""
        with patch("pld.views.recaptcha.verificar", return_value=True), patch("pld.views.requests.post") as mock_post:
            mock_post.return_value = Mock(
                status_code=201,
                json=lambda: {
                    "file_id": "abc123",
                    "web_view_link": "https://drive/abc123",
                    "mime_type": "application/pdf",
                    "tamano_bytes": 14,
                },
            )
            self._subir()
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.uses_count, 0)

    def test_guarda_el_documento_con_los_datos_de_drive(self):
        with patch("pld.views.recaptcha.verificar", return_value=True), patch("pld.views.requests.post") as mock_post:
            mock_post.return_value = Mock(
                status_code=201,
                json=lambda: {
                    "file_id": "abc123",
                    "web_view_link": "https://drive/abc123",
                    "mime_type": "application/pdf",
                    "tamano_bytes": 14,
                },
            )
            self._subir()
        doc = PldContraparteDoc.objects.get(kyc=self.kyc)
        self.assertEqual(doc.drive_file_id, "abc123")
        self.assertEqual(doc.status, PldContraparteDoc.STATUS_ENTREGADO)
        self.assertEqual(doc.created_by, "externo")

    def test_subir_publico_emite_evento_de_auditoria_con_actor_externo(self):
        with patch("pld.views.recaptcha.verificar", return_value=True), patch("requests.post") as mock_post:
            mock_post.return_value = Mock(
                status_code=201,
                content=b"{}",
                json=lambda: {
                    "file_id": "abc123",
                    "web_view_link": "https://drive/abc123",
                    "mime_type": "application/pdf",
                    "tamano_bytes": 14,
                },
            )
            self._subir()
        audit_calls = [c for c in mock_post.call_args_list if "bitacora" in c.args[0]]
        self.assertEqual(len(audit_calls), 1)
        payload = audit_calls[0].kwargs["json"]
        self.assertEqual(payload["accion"], "pld_contrapartes_docs.subir")
        self.assertEqual(payload["actor_user_id"], "externo")
        self.assertEqual(payload["valores_nuevos"]["id_contraparte"], "cp000070")


class ActualizarDatosPublicoTests(TestCase):
    """actualizar_datos (17/Ago/2026): el cliente externo edita sus propios
    datos de KYC sin sesion, canjeando el mismo token del link publico -
    debe auditarse con el mismo criterio que subir_documento (actor
    "externo", ver pld/views.py::PldTicketClienteViewSet.actualizar_datos)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.kyc = _kyc("cp000080", RFC_TIZARA)
        self.ticket = PldTicketCliente.objects.create(
            kyc=self.kyc,
            email="cliente@externo.com",
            issued_by="usr00001",
            token_hash=hash_token("token-datos"),
            expires_at=timezone.now() + datetime.timedelta(minutes=30),
            max_uses=5,
        )
        self.view = PldTicketClienteViewSet.as_view({"post": "actualizar_datos"})

    def test_actualizar_datos_emite_evento_de_auditoria(self):
        request = self.factory.post(
            "/api/ticket-cliente/actualizar_datos/",
            {"token": "token-datos", "campos": {"telefono_sms": "5511112222"}},
            format="json",
        )
        request.effective_scope = EffectiveScope.anonymous()
        with patch("requests.post", return_value=Mock(status_code=200)) as mock_post:
            response = self.view(request)
        self.assertEqual(response.status_code, 200)
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["accion"], "pld_contrapartes_kyc.actualizar_datos")
        self.assertEqual(payload["actor_user_id"], "externo")
        self.assertEqual(payload["valores_nuevos"]["campos"], {"telefono_sms": "5511112222"})


class AuditoriaMotorDocumentalTests(TestCase):
    """Auditoria especifica del Motor Documental dentro de PLD (18/Ago/2026):
    hasta ahora la unica bitacora relacionada era la generica de docint
    (analisis IA, sin contexto de expediente/cliente) - estas pruebas
    verifican que las decisiones humanas de negocio (aprobar, subir/eliminar
    documento, cambiar estado_cuenta) tambien emiten un evento hacia
    audit-service, con id_contraparte/nombre_completo en valores_nuevos para
    que el frontend de Auditoria los pueda mostrar sin parsear JSON crudo."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope = EffectiveScope(
            is_global=True,
            perm_keys=("pld-compliance.aprobar", "pld-compliance.editar", "pld-compliance.crear"),
        )
        self.kyc = _kyc("cp000200", RFC_TIZARA)

    def test_aprobar_emite_evento_de_auditoria(self):
        request = _with_scope(
            self.factory.post(f"/api/kyc/{self.kyc.id_kyc}/aprobar/", {"aprobado_por": "usr00001"}),
            self.scope,
        )
        view = PldContraparteKycViewSet.as_view({"post": "aprobar"})
        with patch("pld.audit_utils.requests.post") as mock_post:
            response = view(request, pk=self.kyc.id_kyc)
        self.assertEqual(response.status_code, 200)
        mock_post.assert_called_once()
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["servicio_origen"], "pld-service")
        self.assertEqual(payload["accion"], "pld_contrapartes_kyc.aprobar")
        self.assertEqual(payload["entidad"], "pld_contrapartes_kyc")
        self.assertEqual(payload["entidad_id"], str(self.kyc.id_kyc))
        self.assertEqual(payload["actor_user_id"], "usr00001")
        self.assertEqual(payload["valores_nuevos"]["id_contraparte"], "cp000200")

    def test_congelar_emite_evento_con_estado_anterior_y_nuevo(self):
        request = _with_scope(
            self.factory.post(f"/api/kyc/{self.kyc.id_kyc}/congelar/", {"actor_user_id": "usr00002"}),
            self.scope,
        )
        view = PldContraparteKycViewSet.as_view({"post": "congelar"})
        with patch("pld.audit_utils.requests.post") as mock_post:
            response = view(request, pk=self.kyc.id_kyc)
        self.assertEqual(response.status_code, 200)
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["accion"], "pld_contrapartes_kyc.congelar")
        self.assertEqual(payload["valores_previos"]["estado_cuenta"], PldContraparteKyc.CUENTA_ACTIVA)
        self.assertEqual(payload["valores_nuevos"]["estado_cuenta"], PldContraparteKyc.CUENTA_CONGELADA)

    def test_subir_documento_emite_evento_de_auditoria(self):
        doc = PldContraparteDoc.objects.create(kyc=self.kyc, denominacion="INE")
        archivo = SimpleUploadedFile("ine.pdf", b"contenido", content_type="application/pdf")
        request = _with_scope(
            self.factory.post(
                f"/api/kyc-docs/{doc.id_kyc_doc}/subir/",
                {"file": archivo, "actor_user_id": "usr00003"},
            ),
            self.scope,
        )
        view = PldContraparteDocViewSet.as_view({"post": "subir"})
        # pld.views.requests y pld.audit_utils.requests son el mismo modulo
        # "requests" (singleton de Python) - patchear "post" en ambos por
        # separado pisa el mismo atributo dos veces, no dos mocks distintos.
        # Un solo mock con side_effect que distingue por URL.
        with patch("requests.post") as mock_post:
            def _side_effect(url, *args, **kwargs):
                if url == f"{settings.AUDIT_SERVICE_URL}/api/bitacora/registrar_evento/":
                    return Mock(status_code=200)
                return Mock(
                    status_code=201,
                    content=b"{}",
                    json=lambda: {
                        "file_id": "abc123",
                        "web_view_link": "https://drive/abc123",
                        "mime_type": "application/pdf",
                        "tamano_bytes": 9,
                    },
                )

            mock_post.side_effect = _side_effect
            response = view(request, pk=doc.id_kyc_doc)
        self.assertEqual(response.status_code, 200)
        audit_calls = [c for c in mock_post.call_args_list if "bitacora" in c.args[0]]
        self.assertEqual(len(audit_calls), 1)
        payload = audit_calls[0].kwargs["json"]
        self.assertEqual(payload["accion"], "pld_contrapartes_docs.subir")
        self.assertEqual(payload["entidad"], "pld_contrapartes_docs")
        self.assertEqual(payload["entidad_id"], str(doc.id_kyc_doc))
        self.assertEqual(payload["valores_nuevos"]["nombre_completo"], self.kyc.nombre_completo)
        self.assertEqual(payload["valores_nuevos"]["denominacion"], "INE")

    def test_eliminar_documento_emite_evento_antes_de_borrarlo(self):
        doc = PldContraparteDoc.objects.create(kyc=self.kyc, denominacion="INE duplicado", drive_file_id="abc999")
        request = _with_scope(self.factory.delete(f"/api/kyc-docs/{doc.id_kyc_doc}/"), self.scope)
        view = PldContraparteDocViewSet.as_view({"delete": "destroy"})
        with patch("pld.audit_utils.requests.post") as mock_post:
            response = view(request, pk=doc.id_kyc_doc)
        self.assertEqual(response.status_code, 204)
        payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(payload["accion"], "pld_contrapartes_docs.eliminar")
        self.assertEqual(payload["entidad_id"], str(doc.id_kyc_doc))
        self.assertEqual(payload["valores_previos"]["denominacion"], "INE duplicado")
        self.assertEqual(payload["valores_previos"]["drive_file_id"], "abc999")


class EmitirEventoAuditoriaTests(TestCase):
    """18/Ago/2026: antes solo se atrapaba RequestException (red caida) - un
    4xx/5xx de audit-service rechazando el evento (ej. actor_user_id mas
    largo que la columna, hallazgo real de un smoke test en vivo) se perdia
    en silencio, sin ningun log."""

    def test_no_truena_si_audit_service_no_responde(self):
        with patch("pld.audit_utils.requests.post", side_effect=requests.RequestException()):
            with self.assertLogs("pld.audit_utils", level="WARNING") as logs:
                emitir_evento_auditoria("pld_contrapartes_kyc.aprobar", "pld_contrapartes_kyc", "ba9fa64b")
        self.assertIn("No se pudo registrar", logs.output[0])

    def test_loguea_si_audit_service_rechaza_el_evento(self):
        respuesta = Mock(status_code=400, ok=False, text="actor_user_id demasiado largo")
        with patch("pld.audit_utils.requests.post", return_value=respuesta):
            with self.assertLogs("pld.audit_utils", level="WARNING") as logs:
                emitir_evento_auditoria("pld_contrapartes_kyc.aprobar", "pld_contrapartes_kyc", "ba9fa64b")
        self.assertIn("rechazo el evento", logs.output[0])
        self.assertIn("400", logs.output[0])

    def test_no_loguea_nada_si_audit_service_acepta_el_evento(self):
        respuesta = Mock(status_code=201, ok=True)
        with patch("pld.audit_utils.requests.post", return_value=respuesta):
            with self.assertNoLogs("pld.audit_utils", level="WARNING"):
                emitir_evento_auditoria("pld_contrapartes_kyc.aprobar", "pld_contrapartes_kyc", "ba9fa64b")
