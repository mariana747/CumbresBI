"""Pruebas de AnalyzeView/AnalysisStatusView/ProcesarAnalisisView (actualizado
17/Ago/2026 para la migracion async con Cloud Tasks, ver plan y
docint/views.py): POST /analyze ya no analiza en linea - persiste el archivo
en staging, crea un AnalysisJob y encola el analisis (docint.tasks), y
responde 202 de inmediato con {analysis_id, status}. El resultado se consulta
con polling via GET /analyze/<id>/status. Se mockean drive.py y el provider
(via DOCINT_TASKS_ENABLED=False -> ejecucion in-process sincrona con
threading, ver docint/tasks.py::_ejecutar_in_process) para no depender de un
Drive/Gemini reales.

Las vistas exigen un perm_key exacto en request.effective_scope
(cumbresbi_scope.permissions.require_permission) - como estas pruebas llaman
la vista directo con APIRequestFactory (sin pasar por el middleware real),
el scope se inyecta a mano, mismo patron que pld-service/pld/tests.py."""

import time
from unittest.mock import patch

from cumbresbi_scope import EffectiveScope
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIRequestFactory

from docint.contracts import DocumentAnalysisResult
from docint.models import AnalysisJob, AnalysisRequestLog
from docint.views import AnalysisStatusView, AnalyzeView


def _resultado_fake():
    return DocumentAnalysisResult(
        detected_document_type="pld.ine",
        matches_expected_type=True,
        confidence=0.95,
        extracted_data={"curp": "CURP000000HDFRRL01"},
        validation_errors=[],
        warnings=[],
    )


def _esperar_job_terminal(job_id, timeout=2.0):
    """El modo dev ejecuta el analisis en un hilo aparte (fire-and-forget,
    ver docint/tasks.py::_ejecutar_in_process) - las pruebas deben esperar a
    que termine antes de revisar el resultado.

    Espera tambien a que exista el AnalysisRequestLog (17/Ago/2026, CI
    flaky): ejecutar_analisis guarda job.status=COMPLETADO ANTES de crear
    el AnalysisRequestLog (ver processing.py) - en un runner lento/cargado
    el hilo podia quedar justo entre esas dos lineas cuando esta funcion ya
    veia COMPLETADO, y la prueba afirmaba AnalysisRequestLog.count()==1
    antes de que existiera de verdad."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = AnalysisJob.objects.get(id=job_id)
        if job.status == AnalysisJob.ERROR:
            return job
        if job.status == AnalysisJob.COMPLETADO and AnalysisRequestLog.objects.exists():
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} no termino a tiempo (status={job.status})")


class AnalyzeViewTests(TransactionTestCase):
    """TransactionTestCase (no TestCase): el modo dev corre el analisis en un
    hilo aparte con su propia conexion (ver docint/tasks.py::_ejecutar_in_process)
    - con TestCase, la transaccion de la prueba nunca se confirma y ese hilo
    jamas ve el AnalysisJob recien creado."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = AnalyzeView.as_view()
        self.scope = EffectiveScope(is_global=True, perm_keys=("docint.crear",))

    def test_requiere_drive_file_id_carpeta_y_perm_key(self):
        request = self.factory.post("/analyze", {}, format="json")
        request.effective_scope = self.scope
        response = self.view(request)
        self.assertEqual(response.status_code, 400)

    def test_sin_permiso_da_403(self):
        request = self.factory.post(
            "/analyze",
            {"drive_file_id": "abc123", "carpeta": "PLD/cp000001", "perm_key": "pld-compliance.crear"},
            format="json",
        )
        request.effective_scope = EffectiveScope.anonymous()
        response = self.view(request)
        self.assertEqual(response.status_code, 403)

    @patch("docint.processing.emitir_evento_auditoria")
    @patch("docint.views.drive.fetch_bytes")
    @patch("docint.processing.get_provider")
    def test_analiza_leyendo_bytes_desde_drive(self, mock_get_provider, mock_fetch_bytes, mock_emitir_evento):
        # emitir_evento_auditoria mockeado (17/Ago/2026): de lo contrario
        # intenta de verdad un POST a audit-service, que no existe en las
        # pruebas - la resolucion DNS del host falla mucho mas lento que el
        # timeout=2 que asume audit_utils.py (requests no limita el tiempo
        # de resolucion DNS con su parametro timeout), lo que mantenia
        # _ANALYSIS_LOCK tomado varios segundos y volvia flakies estas
        # pruebas y las que corren justo despues.
        mock_fetch_bytes.return_value = b"contenido-fake-del-ine"
        mock_get_provider.return_value.analyze.return_value = _resultado_fake()

        request = self.factory.post(
            "/analyze",
            {
                "drive_file_id": "abc123",
                "carpeta": "PLD/cp000001",
                "perm_key": "pld-compliance.crear",
                "nombre_archivo": "ine_juan.pdf",
                "mime_type": "application/pdf",
                "expected_document_type": "pld.ine",
                "servicio_solicitante": "pld-service",
            },
            format="json",
        )
        request.effective_scope = self.scope
        response = self.view(request)

        self.assertEqual(response.status_code, 202)
        analysis_id = response.data["analysis_id"]

        job = _esperar_job_terminal(analysis_id)
        self.assertEqual(job.status, AnalysisJob.COMPLETADO)
        self.assertEqual(job.resultado["detected_document_type"], "pld.ine")
        self.assertEqual(job.resultado["extracted_data"]["curp"], "CURP000000HDFRRL01")

        mock_fetch_bytes.assert_called_once_with(
            file_id="abc123",
            carpeta="PLD/cp000001",
            perm_key="pld-compliance.crear",
            headers={},
            cookies={},
        )
        self.assertEqual(AnalysisRequestLog.objects.count(), 1)

    @patch("docint.processing.emitir_evento_auditoria")
    @patch("docint.views.drive.fetch_bytes")
    @patch("docint.processing.get_provider")
    def test_reenvia_authorization_header_a_drive_service(self, mock_get_provider, mock_fetch_bytes, mock_emitir_evento):
        mock_fetch_bytes.return_value = b"bytes"
        mock_get_provider.return_value.analyze.return_value = _resultado_fake()

        request = self.factory.post(
            "/analyze",
            {
                "drive_file_id": "abc123",
                "carpeta": "PLD/cp000001",
                "perm_key": "pld-compliance.crear",
            },
            format="json",
            HTTP_AUTHORIZATION="Bearer un-jwt-cualquiera",
        )
        request.effective_scope = self.scope
        response = self.view(request)
        _esperar_job_terminal(response.data["analysis_id"])

        _, kwargs = mock_fetch_bytes.call_args
        self.assertEqual(kwargs["headers"], {"Authorization": "Bearer un-jwt-cualquiera"})

    @patch("docint.views.drive.fetch_bytes")
    def test_drive_error_se_traduce_a_502(self, mock_fetch_bytes):
        from docint import drive

        mock_fetch_bytes.side_effect = drive.DriveError("no se pudo descargar")

        request = self.factory.post(
            "/analyze",
            {"drive_file_id": "abc123", "carpeta": "PLD/cp000001", "perm_key": "pld-compliance.crear"},
            format="json",
        )
        request.effective_scope = self.scope
        response = self.view(request)
        self.assertEqual(response.status_code, 502)


class AnalysisStatusViewTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = AnalysisStatusView.as_view()
        self.scope = EffectiveScope(is_global=True, perm_keys=("docint.leer",))

    def test_sin_permiso_da_403(self):
        request = self.factory.get("/analyze/no-existe/status")
        request.effective_scope = EffectiveScope.anonymous()
        response = self.view(request, analysis_id="no-existe")
        self.assertEqual(response.status_code, 403)

    def test_analysis_id_inexistente_da_404(self):
        request = self.factory.get("/analyze/no-existe/status")
        request.effective_scope = self.scope
        response = self.view(request, analysis_id="no-existe")
        self.assertEqual(response.status_code, 404)

    def test_regresa_status_resultado_y_error_del_job(self):
        job = AnalysisJob.objects.create(
            gcs_uri="local:///tmp/fake",
            mime_type="application/pdf",
            expected_document_type="pld.ine",
            internal_prompt_key="pld.ine",
            metadata={},
            servicio_solicitante="pld-service",
            status=AnalysisJob.COMPLETADO,
            resultado={"detected_document_type": "pld.ine"},
        )
        request = self.factory.get(f"/analyze/{job.id}/status")
        request.effective_scope = self.scope
        response = self.view(request, analysis_id=job.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], AnalysisJob.COMPLETADO)
        self.assertEqual(response.data["result"], {"detected_document_type": "pld.ine"})
        self.assertIsNone(response.data["error"])
