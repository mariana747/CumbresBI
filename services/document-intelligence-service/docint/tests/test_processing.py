"""Pruebas de la bitacora de auditoria real conectada al analisis de
documentos (17/Ago/2026) - antes solo se mencionaba en un comentario del
modelo (docint/models.py), nunca se implementaba de verdad. Se mockea
emitir_evento_auditoria (no habla con audit-service real) y el provider
(no habla con Gemini real)."""

from unittest.mock import patch

from django.test import TestCase

from docint.contracts import DocumentAnalysisResult
from docint.models import AnalysisJob
from docint.processing import ejecutar_analisis, ejecutar_con_reintentos
from docint.storage import upload_staging


def _resultado_fake():
    return DocumentAnalysisResult(
        detected_document_type="pld.ine",
        matches_expected_type=True,
        confidence=0.95,
        extracted_data={"curp": "CURP000000HDFRRL01"},
        validation_errors=[],
        warnings=[],
    )


def _job_de_prueba(**overrides):
    gcs_uri = upload_staging(b"contenido-fake", "application/pdf", analysis_id="test")
    defaults = {
        "gcs_uri": gcs_uri,
        "mime_type": "application/pdf",
        "expected_document_type": "pld.ine",
        "internal_prompt_key": "pld.ine",
        "metadata": {"carpeta": "PLD/Nuevos Clientes/cp000001", "nombre_archivo": "ine_juan.pdf"},
        "servicio_solicitante": "pld-service",
        "solicitado_por": "analista01",
    }
    defaults.update(overrides)
    return AnalysisJob.objects.create(**defaults)


class AuditoriaAnalisisTests(TestCase):
    @patch("docint.processing.emitir_evento_auditoria")
    @patch("docint.processing.get_provider")
    def test_analisis_exitoso_emite_evento_con_carpeta_como_entidad_id(self, mock_get_provider, mock_emitir):
        mock_get_provider.return_value.analyze.return_value = _resultado_fake()
        job = _job_de_prueba()

        ejecutar_analisis(job)

        mock_emitir.assert_called_once()
        args, kwargs = mock_emitir.call_args
        self.assertEqual(args[0], "analizar_documento")
        self.assertEqual(args[1], "documento_kyc")
        self.assertEqual(args[2], "PLD/Nuevos Clientes/cp000001")
        self.assertEqual(kwargs["actor_user_id"], "analista01")
        self.assertEqual(kwargs["valores_nuevos"]["tipo_documento_detectado"], "pld.ine")
        self.assertEqual(kwargs["valores_nuevos"]["confianza"], 0.95)

    @patch("docint.processing.emitir_evento_auditoria")
    @patch("docint.processing.get_provider")
    def test_sin_carpeta_en_metadata_usa_el_id_del_job(self, mock_get_provider, mock_emitir):
        mock_get_provider.return_value.analyze.return_value = _resultado_fake()
        job = _job_de_prueba(metadata={})

        ejecutar_analisis(job)

        args, _ = mock_emitir.call_args
        self.assertEqual(args[2], job.id)

    @patch("docint.processing.emitir_evento_auditoria")
    @patch("docint.processing.get_provider")
    def test_falla_definitiva_tras_agotar_intentos_tambien_se_audita(self, mock_get_provider, mock_emitir):
        mock_get_provider.return_value.analyze.side_effect = RuntimeError("Gemini no disponible")
        job = _job_de_prueba(max_intentos=1, intentos=1)

        listo = ejecutar_con_reintentos(job)

        self.assertTrue(listo)
        job.refresh_from_db()
        self.assertEqual(job.status, AnalysisJob.ERROR)
        mock_emitir.assert_called_once()
        args, kwargs = mock_emitir.call_args
        self.assertEqual(args[0], "analizar_documento_fallido")
        self.assertEqual(args[2], "PLD/Nuevos Clientes/cp000001")
        self.assertIn("error_mensaje", kwargs["valores_nuevos"])

    @patch("docint.processing.emitir_evento_auditoria")
    @patch("docint.processing.get_provider")
    def test_falla_reintentable_no_se_audita_todavia(self, mock_get_provider, mock_emitir):
        """Mientras queden reintentos, no es una falla definitiva - no hay
        nada de cumplimiento que registrar hasta que se agoten (o tenga
        exito en un reintento posterior)."""
        mock_get_provider.return_value.analyze.side_effect = RuntimeError("Gemini no disponible")
        job = _job_de_prueba(max_intentos=3, intentos=0)

        listo = ejecutar_con_reintentos(job)

        self.assertFalse(listo)
        mock_emitir.assert_not_called()
