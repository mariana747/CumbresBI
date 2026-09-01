"""Pruebas de driveclient.py - primeras del servicio (01/Sep/2026). Se
enfocan en _traducir_error_drive, la pieza nueva mas riesgosa de romper en
silencio: si algun dia alguien vuelve a meter str(exc) crudo en un mensaje,
estas pruebas lo detectan.

No hay pruebas de las funciones reales contra Drive (upload_bytes,
list_files, etc.) porque requieren credenciales reales o mockear
googleapiclient completo - fuera de alcance de este primer corte, que solo
cierra el hallazgo real de "errores crudos de Google expuestos al cliente"
(ver memoria de sesion)."""

from unittest.mock import Mock

from django.test import SimpleTestCase

from drive.driveclient import DriveError, _traducir_error_drive


def _http_error(status: int, contenido: bytes = b'{"error": {"message": "detalle interno de Google"}}'):
    """HttpError real de googleapiclient, no un mock generico - asi la
    prueba usa el mismo camino de codigo (isinstance check, exc.resp.status)
    que el codigo de produccion."""
    from googleapiclient.errors import HttpError

    resp = Mock(status=status)
    return HttpError(resp, contenido)


class TraducirErrorDriveTests(SimpleTestCase):
    def test_403_da_mensaje_de_permisos_sin_exponer_el_original(self):
        exc = _http_error(403)
        resultado = _traducir_error_drive(exc, "subir 'archivo.pdf'")
        self.assertIsInstance(resultado, DriveError)
        self.assertIn("permiso", str(resultado).lower())
        self.assertNotIn("detalle interno de Google", str(resultado))

    def test_401_tambien_da_mensaje_de_permisos(self):
        resultado = _traducir_error_drive(_http_error(401), "listar carpetas")
        self.assertIn("permiso", str(resultado).lower())

    def test_404_da_mensaje_de_no_encontrado(self):
        resultado = _traducir_error_drive(_http_error(404), "descargar el archivo 'x'")
        self.assertIn("no se encontró", str(resultado).lower())

    def test_429_da_mensaje_de_limite_de_solicitudes(self):
        resultado = _traducir_error_drive(_http_error(429), "subir 'x'")
        self.assertIn("límite", str(resultado).lower())

    def test_503_da_mensaje_de_servicio_no_disponible(self):
        resultado = _traducir_error_drive(_http_error(503), "listar 'PLD/x'")
        self.assertIn("no está disponible", str(resultado).lower())

    def test_error_generico_no_http_da_mensaje_de_conexion(self):
        # Ej. timeout de red, DNS - no es un HttpError con status.
        resultado = _traducir_error_drive(ConnectionError("timed out talking to googleapis.com"), "subir 'x'")
        self.assertIsInstance(resultado, DriveError)
        self.assertNotIn("googleapis.com", str(resultado))

    def test_ningun_mensaje_incluye_str_del_original(self):
        # Regresion explicita del hallazgo real: antes se hacia
        # f"...: {exc}", metiendo el repr crudo de HttpError (JSON completo
        # de Google) en el mensaje. Ninguno de los mensajes traducidos debe
        # volver a incluirlo.
        for status in (401, 403, 404, 429, 500, 502, 503, 504, 418):
            resultado = _traducir_error_drive(_http_error(status), "hacer algo")
            self.assertNotIn("detalle interno de Google", str(resultado))
