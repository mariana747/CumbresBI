from cumbresbi_scope.scope import EffectiveScope
from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from .views import SendEmailView


class SendEmailViewTests(SimpleTestCase):
    # Sin base de datos (DATABASES = {}, ver config/settings.py - proxy
    # stateless hacia Gmail API) - TestCase normal truena al intentar
    # limpiar tablas al final de cada prueba; SimpleTestCase no lo intenta.
    def setUp(self):
        self.factory = APIRequestFactory()
        self.view = SendEmailView.as_view()

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
