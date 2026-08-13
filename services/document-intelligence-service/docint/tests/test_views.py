"""Pruebas de AnalyzeView (decision de Mariana, 12/Ago/2026, ver memoria de
sesion "motor-documental-seleccion-archivos-drive"): ya no se sube un
archivo directo del navegador - se pide por referencia (drive_file_id/
carpeta) y docint lee los bytes de drive-service. Se mockean drive.py y el
provider para no depender de un Drive/Gemini reales."""

from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from docint.contracts import DocumentAnalysisResult
from docint.models import AnalysisRequestLog
from docint.views import AnalyzeView


def _resultado_fake():
    return DocumentAnalysisResult(
        detected_document_type="pld.ine",
        matches_expected_type=True,
        confidence=0.95,
        extracted_data={"curp": "CURP000000HDFRRL01"},
        validation_errors=[],
        warnings=[],
    )


class AnalyzeViewTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = AnalyzeView.as_view()

    def test_requiere_drive_file_id_carpeta_y_perm_key(self):
        request = self.factory.post("/analyze", {}, format="json")
        response = self.view(request)
        self.assertEqual(response.status_code, 400)

    @patch("docint.views.get_provider")
    @patch("docint.views.drive.fetch_bytes")
    def test_analiza_leyendo_bytes_desde_drive(self, mock_fetch_bytes, mock_get_provider):
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
        response = self.view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detected_document_type"], "pld.ine")
        self.assertEqual(response.data["extracted_data"]["curp"], "CURP000000HDFRRL01")

        mock_fetch_bytes.assert_called_once_with(
            file_id="abc123",
            carpeta="PLD/cp000001",
            perm_key="pld-compliance.crear",
            headers={},
            cookies={},
        )
        self.assertEqual(AnalysisRequestLog.objects.count(), 1)

    @patch("docint.views.get_provider")
    @patch("docint.views.drive.fetch_bytes")
    def test_reenvia_authorization_header_a_drive_service(self, mock_fetch_bytes, mock_get_provider):
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
        self.view(request)

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
        response = self.view(request)
        self.assertEqual(response.status_code, 502)
