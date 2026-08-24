"""Primera suite del servicio (24/Ago/2026) - obra-service existia desde
21/Ago/2026 (feat(obra-service): nuevo servicio de avance de obra) pero sin
ningun test, mismo punto de partida que tenia materiales-service antes de
este mismo pase. Cubre lo que de verdad tiene logica de negocio: permisos
por accion, ScopedManager (alcance por proyecto), el consecutivo de
ObraEstimacion, y el ciclo revisar/aprobar con segregacion captura/decision
(mismo criterio que PldContraparteKycViewSet en pld-service)."""

from decimal import Decimal

from cumbresbi_scope.scope import EffectiveScope
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from .models import ObraConcepto, ObraCorteSemanal, ObraEstimacion, ObraEtapa, ObraEvidencia, ObraLote
from .views import ObraCorteSemanalViewSet, ObraEstimacionViewSet, ObraEvidenciaViewSet, ObraLoteViewSet

PROYECTO_A = "AAA"
PROYECTO_B = "BBB"


class ObraLoteScopeTests(TestCase):
    """Primer recurso de este servicio con alcance real (SCOPE_FIELD_PROYECTO,
    ver models.py) - mismo criterio que TesoreriaContratoTests en
    tesoreria-service: un usuario de un proyecto no ve los lotes de otro."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("obra.crear",))

    def _crear_lote(self, proyecto, numero_lote="1"):
        request = self.factory.post(
            "/api/lotes/",
            {"proyecto": proyecto, "numero_lote": numero_lote},
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = ObraLoteViewSet.as_view({"post": "create"})
        return view(request)

    def test_crear_sin_permiso_da_403(self):
        request = self.factory.post("/api/lotes/", {"proyecto": PROYECTO_A, "numero_lote": "1"}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=())
        view = ObraLoteViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_usuario_de_un_proyecto_no_ve_lotes_de_otro(self):
        self._crear_lote(PROYECTO_A)
        self._crear_lote(PROYECTO_B)

        request = self.factory.get("/api/lotes/")
        request.effective_scope = EffectiveScope(is_global=False, proyecto_ids=(PROYECTO_A,))
        view = ObraLoteViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["proyecto"], PROYECTO_A)

    def test_anonimo_no_ve_nada(self):
        self._crear_lote(PROYECTO_A)
        request = self.factory.get("/api/lotes/")
        request.effective_scope = EffectiveScope.anonymous()
        view = ObraLoteViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual(len(response.data), 0)

    def test_orden_numerico_no_lexicografico(self):
        # numero_lote es CharField - sin el Cast a entero de get_queryset,
        # "10" ordenaria antes de "2" (orden de texto). Confirma que el
        # Cast funciona: 2 antes de 10.
        self._crear_lote(PROYECTO_A, numero_lote="10")
        self._crear_lote(PROYECTO_A, numero_lote="2")

        request = self.factory.get("/api/lotes/")
        request.effective_scope = EffectiveScope(is_global=True)
        view = ObraLoteViewSet.as_view({"get": "list"})
        response = view(request)
        self.assertEqual([r["numero_lote"] for r in response.data], ["2", "10"])


class ObraEstimacionTests(TestCase):
    """Captura diaria de avance - numero_estimacion se calcula en
    perform_create (siguiente consecutivo 1-4 dentro del concepto+lote),
    mismo criterio que TesoreriaContrato.id_contrato."""

    def setUp(self):
        self.factory = APIRequestFactory()
        etapa = ObraEtapa.objects.create(numero=Decimal("1.0"), nombre="Losa cimentacion")
        self.concepto = ObraConcepto.objects.create(etapa=etapa, numero="1.1", descripcion="Trazo y nivelacion")
        self.lote = ObraLote.objects.create(proyecto=PROYECTO_A, numero_lote="1")
        self.scope_crear = EffectiveScope(is_global=True, perm_keys=("obra.crear",))

    def _crear_estimacion(self, porcentaje="0.25"):
        request = self.factory.post(
            "/api/estimaciones/",
            {
                "concepto": self.concepto.id_concepto,
                "lote": self.lote.id_lote,
                "porcentaje": porcentaje,
                "fecha_captura": "2026-08-24",
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = ObraEstimacionViewSet.as_view({"post": "create"})
        return view(request)

    def test_numero_estimacion_es_consecutivo_por_concepto_y_lote(self):
        response1 = self._crear_estimacion()
        self.assertEqual(response1.status_code, 201)
        self.assertEqual(response1.data["numero_estimacion"], 1)

        response2 = self._crear_estimacion()
        self.assertEqual(response2.data["numero_estimacion"], 2)

    def test_consecutivo_es_independiente_por_lote(self):
        self._crear_estimacion()
        otro_lote = ObraLote.objects.create(proyecto=PROYECTO_A, numero_lote="2")
        request = self.factory.post(
            "/api/estimaciones/",
            {
                "concepto": self.concepto.id_concepto,
                "lote": otro_lote.id_lote,
                "porcentaje": "0.5",
                "fecha_captura": "2026-08-24",
            },
            format="json",
        )
        request.effective_scope = self.scope_crear
        view = ObraEstimacionViewSet.as_view({"post": "create"})
        response = view(request)
        self.assertEqual(response.data["numero_estimacion"], 1)


class ObraEvidenciaTests(TestCase):
    """revisar() requiere obra.aprobar, no obra.crear/.editar - segregacion
    captura/revision (mismo criterio que PldContraparteKycViewSet.aprobar)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        etapa = ObraEtapa.objects.create(numero=Decimal("1.0"), nombre="Losa cimentacion")
        concepto = ObraConcepto.objects.create(etapa=etapa, numero="1.1", descripcion="Trazo y nivelacion")
        lote = ObraLote.objects.create(proyecto=PROYECTO_A, numero_lote="1")
        self.evidencia = ObraEvidencia.objects.create(
            concepto=concepto, lote=lote, fecha_captura="2026-08-24", link_drive="https://drive/foto.jpg"
        )

    def test_revisar_requiere_permiso_obra_aprobar(self):
        request = self.factory.post(
            f"/api/evidencias/{self.evidencia.id_evidencia}/revisar/", {"revisado_por": "u001"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("obra.editar",))
        view = ObraEvidenciaViewSet.as_view({"post": "revisar"})
        response = view(request, pk=self.evidencia.id_evidencia)
        self.assertEqual(response.status_code, 403)

        request2 = self.factory.post(
            f"/api/evidencias/{self.evidencia.id_evidencia}/revisar/", {"revisado_por": "u001"}, format="json"
        )
        request2.effective_scope = EffectiveScope(is_global=True, perm_keys=("obra.aprobar",))
        response2 = view(request2, pk=self.evidencia.id_evidencia)
        self.assertEqual(response2.status_code, 200)
        self.assertTrue(response2.data["revisado"])
        self.assertEqual(response2.data["revisado_por"], "u001")

    def test_revisar_sin_revisado_por_da_400(self):
        request = self.factory.post(f"/api/evidencias/{self.evidencia.id_evidencia}/revisar/", {}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("obra.aprobar",))
        view = ObraEvidenciaViewSet.as_view({"post": "revisar"})
        response = view(request, pk=self.evidencia.id_evidencia)
        self.assertEqual(response.status_code, 400)


class ObraCorteSemanalAprobarTests(TestCase):
    """aprobar() congela un snapshot real (ObraCorteSemanalDetalle) del %
    acumulado por concepto+lote - el hallazgo del 21/Ago/2026 ("el corte
    aprobado no reflejaba lo que se envio si alguien seguia editando
    estimaciones despues"). Idempotente: re-aprobar no duplica filas."""

    def setUp(self):
        self.factory = APIRequestFactory()
        etapa = ObraEtapa.objects.create(numero=Decimal("1.0"), nombre="Losa cimentacion")
        self.concepto = ObraConcepto.objects.create(etapa=etapa, numero="1.1", descripcion="Trazo y nivelacion")
        self.lote = ObraLote.objects.create(proyecto=PROYECTO_A, numero_lote="1")
        ObraEstimacion.objects.create(
            concepto=self.concepto, lote=self.lote, numero_estimacion=1, porcentaje=Decimal("0.6"), fecha_captura="2026-08-24"
        )
        self.corte = ObraCorteSemanal.objects.create(proyecto=PROYECTO_A, fecha_corte="2026-08-21", semana_de_fase=1)

    def _aprobar(self, aprobado_por="u001"):
        request = self.factory.post(
            f"/api/cortes-semanales/{self.corte.id_corte}/aprobar/", {"aprobado_por": aprobado_por}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("obra.aprobar",))
        view = ObraCorteSemanalViewSet.as_view({"post": "aprobar"})
        return view(request, pk=self.corte.id_corte)

    def test_aprobar_requiere_permiso_distinto_a_crear(self):
        request = self.factory.post(
            f"/api/cortes-semanales/{self.corte.id_corte}/aprobar/", {"aprobado_por": "u001"}, format="json"
        )
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("obra.crear",))
        view = ObraCorteSemanalViewSet.as_view({"post": "aprobar"})
        response = view(request, pk=self.corte.id_corte)
        self.assertEqual(response.status_code, 403)

    def test_aprobar_congela_snapshot_del_acumulado(self):
        response = self._aprobar()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["estado"], ObraCorteSemanal.ESTADO_APROBADO)

        self.corte.refresh_from_db()
        self.assertEqual(self.corte.detalles.count(), 1)
        detalle = self.corte.detalles.first()
        self.assertEqual(detalle.porcentaje_acumulado, Decimal("0.6"))

    def test_reaprobar_no_duplica_detalle(self):
        self._aprobar()
        self._aprobar(aprobado_por="u002")
        self.corte.refresh_from_db()
        self.assertEqual(self.corte.detalles.count(), 1)

    def test_aprobar_sin_aprobado_por_da_400(self):
        request = self.factory.post(f"/api/cortes-semanales/{self.corte.id_corte}/aprobar/", {}, format="json")
        request.effective_scope = EffectiveScope(is_global=True, perm_keys=("obra.aprobar",))
        view = ObraCorteSemanalViewSet.as_view({"post": "aprobar"})
        response = view(request, pk=self.corte.id_corte)
        self.assertEqual(response.status_code, 400)
