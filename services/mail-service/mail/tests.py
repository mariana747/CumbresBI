import base64
from unittest.mock import patch

from cumbresbi_scope.scope import EffectiveScope
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from . import gmailclient
from .views import SendEmailView


class SendEmailViewTests(SimpleTestCase):
    # Sin base de datos (DATABASES = {}, ver config/settings.py - proxy
    # stateless hacia Gmail API) - TestCase normal truena al intentar
    # limpiar tablas al final de cada prueba; SimpleTestCase no lo intenta.
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = SendEmailView.as_view()
        # 07/Sep/2026 (hallazgo real): este entorno dev SI trae
        # GMAIL_SERVICE_ACCOUNT_JSON real configurado (la credencial de
        # mariana@cypcumbres.mx) - sin este mock, estas pruebas mandaban
        # correo REAL a "a@b.com" cada vez que corrian, en vez de quedarse
        # en modo simulado como asumia el nombre de los tests.
        parche = patch("mail.gmailclient._modo_real", return_value=False)
        parche.start()
        self.addCleanup(parche.stop)

    def _post(self, data, perm="", scope=None):
        request = self.factory.post(f"/api/send/?perm={perm}", data, format="json")
        request.effective_scope = scope or EffectiveScope(is_global=True, perm_keys=("iam.crear",))
        return self.view(request)

    def test_requiere_perm_query_param(self):
        response = self._post({"to": "a@b.com", "subject": "hola", "html_body": "<p>hola</p>"}, perm="")
        self.assertEqual(response.status_code, 400)

    def test_requiere_permiso_exacto(self):
        response = self._post(
            {"to": "a@b.com", "subject": "hola", "html_body": "<p>hola</p>"},
            perm="iam.crear",
            scope=EffectiveScope(is_global=True, perm_keys=()),
        )
        self.assertEqual(response.status_code, 403)

    def test_requiere_campos(self):
        response = self._post({}, perm="iam.crear")
        self.assertEqual(response.status_code, 400)

    def test_modo_simulado_regresa_201(self):
        response = self._post(
            {"to": "a@b.com", "subject": "hola", "html_body": "<p>hola</p>"}, perm="iam.crear"
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("message_id", response.data)

    def test_modo_simulado_con_adjuntos_regresa_201(self):
        # 07/Sep/2026: /api/send/ ahora acepta "adjuntos" (usado por
        # tesoreria-service al enviar facturas con PDF/XML real) - en modo
        # simulado (sin GMAIL_SERVICE_ACCOUNT_JSON) ni siquiera intenta
        # decodificar el base64, solo registra el envio.
        response = self._post(
            {
                "to": "a@b.com",
                "subject": "Factura F-1",
                "html_body": "<p>hola</p>",
                "adjuntos": [
                    {"filename": "F-1.pdf", "content_type": "application/pdf", "data_b64": "Zm9v"},
                ],
            },
            perm="iam.crear",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("message_id", response.data)


class GmailClientAdjuntosTests(SimpleTestCase):
    """send_email con adjuntos (07/Sep/2026) - _modo_real() se mockea
    explicito en vez de asumir que GMAIL_SERVICE_ACCOUNT_JSON esta vacio:
    este entorno dev SI trae la credencial real configurada (hallazgo real
    corriendo esta suite, no era el default documentado), asi que confiar
    en el default hubiera intentado mandar correo real / pegarle a Google
    de verdad en cada corrida."""

    def test_modo_simulado_no_truena_con_adjuntos(self):
        from unittest.mock import patch

        with patch("mail.gmailclient._modo_real", return_value=False):
            resultado = gmailclient.send_email(
                to="a@b.com",
                subject="hola",
                html_body="<p>hola</p>",
                adjuntos=[{"filename": "x.pdf", "content_type": "application/pdf", "data_b64": base64.b64encode(b"contenido").decode()}],
            )
        self.assertEqual(resultado["message_id"], "sim-no-enviado")

    def test_modo_simulado_sin_adjuntos_sigue_funcionando(self):
        from unittest.mock import patch

        # No debe dejar de funcionar el camino sin adjuntos (adjuntos=None
        # por default) despues de agregar el parametro.
        with patch("mail.gmailclient._modo_real", return_value=False):
            resultado = gmailclient.send_email(to="a@b.com", subject="hola", html_body="<p>hola</p>")
        self.assertEqual(resultado["message_id"], "sim-no-enviado")

    def test_modo_real_arma_multipart_con_el_adjunto_real(self):
        # Fuerza el camino real (MIMEMultipart) sin credenciales de verdad -
        # mockea _modo_real/_servicio_real, y verifica que el "raw" que se
        # manda a la API decodifica a un correo multipart con el adjunto
        # real adentro (no solo que no truene).
        import email
        from unittest.mock import MagicMock, patch

        contenido_adjunto = b"contenido-del-pdf"
        servicio_falso = MagicMock()
        servicio_falso.users().messages().send().execute.return_value = {"id": "msg-123"}

        with patch("mail.gmailclient._modo_real", return_value=True), patch(
            "mail.gmailclient._servicio_real", return_value=servicio_falso
        ):
            resultado = gmailclient.send_email(
                to="a@b.com",
                subject="Factura F-1",
                html_body="<p>hola</p>",
                adjuntos=[
                    {
                        "filename": "F-1.pdf",
                        "content_type": "application/pdf",
                        "data_b64": base64.b64encode(contenido_adjunto).decode(),
                    }
                ],
            )

        self.assertEqual(resultado["message_id"], "msg-123")
        raw_enviado = servicio_falso.users().messages().send.call_args.kwargs["body"]["raw"]
        mensaje = email.message_from_bytes(base64.urlsafe_b64decode(raw_enviado))
        self.assertTrue(mensaje.is_multipart())
        adjuntos_decodificados = [
            parte.get_payload(decode=True) for parte in mensaje.walk() if parte.get_filename() == "F-1.pdf"
        ]
        self.assertEqual(adjuntos_decodificados, [contenido_adjunto])
