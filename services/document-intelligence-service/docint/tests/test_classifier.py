from django.test import SimpleTestCase

from docint.classifier import classify_by_filename


class ClassifyByFilenameTests(SimpleTestCase):
    def test_ine_variantes_de_nombre(self):
        for filename in ["INE_juan_perez.pdf", "ine juan perez.jpg", "credencial_votar.png", "IFE-Maria.pdf"]:
            prompt_key, matched = classify_by_filename(filename)
            self.assertEqual(prompt_key, "pld.ine")
            self.assertTrue(matched)

    def test_acentos_y_mayusculas_no_afectan(self):
        prompt_key, matched = classify_by_filename("Comprobante_Domicilio.PDF")
        self.assertEqual(prompt_key, "pld.comprobante_domicilio")
        self.assertTrue(matched)

    def test_cotizacion_proveedor(self):
        prompt_key, matched = classify_by_filename("cotizacion_proveedor_003.pdf")
        self.assertEqual(prompt_key, "compras.cotizacion")
        self.assertTrue(matched)

    def test_factura_cfdi(self):
        prompt_key, matched = classify_by_filename("CFDI_A123.xml.pdf")
        self.assertEqual(prompt_key, "compras.factura_proveedor")
        self.assertTrue(matched)

    def test_nombre_sin_palabra_clave_cae_a_generico(self):
        # Caso central de la Actividad 14: nunca se adivina en silencio.
        prompt_key, matched = classify_by_filename("documento_escaneado_20260730.pdf")
        self.assertEqual(prompt_key, "generic")
        self.assertFalse(matched)

    def test_nombre_vacio_cae_a_generico(self):
        prompt_key, matched = classify_by_filename("")
        self.assertEqual(prompt_key, "generic")
        self.assertFalse(matched)

    def test_nombre_none_cae_a_generico_sin_error(self):
        prompt_key, matched = classify_by_filename(None)
        self.assertEqual(prompt_key, "generic")
        self.assertFalse(matched)
