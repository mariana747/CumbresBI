"""emitir_evento_auditoria (18/Ago/2026): antes solo atrapaba
RequestException (red caida) - un 4xx/5xx de audit-service rechazando el
evento se perdia en silencio, sin ningun log. Ver mismo hallazgo en
pld-service/pld/audit_utils.py."""

from unittest.mock import Mock, patch

import requests
from django.test import TestCase

from docint.audit_utils import emitir_evento_auditoria


class EmitirEventoAuditoriaTests(TestCase):
    def test_no_truena_si_audit_service_no_responde(self):
        with patch("docint.audit_utils.requests.post", side_effect=requests.RequestException()):
            with self.assertLogs("docint.audit_utils", level="WARNING") as logs:
                emitir_evento_auditoria("analizar_documento", "documento_kyc", "carpeta-x")
        self.assertIn("No se pudo registrar", logs.output[0])

    def test_loguea_si_audit_service_rechaza_el_evento(self):
        respuesta = Mock(status_code=400, ok=False, text="entidad_id invalido")
        with patch("docint.audit_utils.requests.post", return_value=respuesta):
            with self.assertLogs("docint.audit_utils", level="WARNING") as logs:
                emitir_evento_auditoria("analizar_documento", "documento_kyc", "carpeta-x")
        self.assertIn("rechazo el evento", logs.output[0])
        self.assertIn("400", logs.output[0])

    def test_no_loguea_nada_si_audit_service_acepta_el_evento(self):
        respuesta = Mock(status_code=201, ok=True)
        with patch("docint.audit_utils.requests.post", return_value=respuesta):
            with self.assertNoLogs("docint.audit_utils", level="WARNING"):
                emitir_evento_auditoria("analizar_documento", "documento_kyc", "carpeta-x")
