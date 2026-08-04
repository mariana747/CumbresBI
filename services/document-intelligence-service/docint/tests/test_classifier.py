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

    def test_curp(self):
        for filename in ["CURP_juan_perez.pdf", "constancia_curp.jpg"]:
            prompt_key, matched = classify_by_filename(filename)
            self.assertEqual(prompt_key, "pld.curp")
            self.assertTrue(matched)

    def test_comprobantes_de_servicios(self):
        casos = {
            "recibo_luz_juan.jpg": "pld.comprobante_domicilio",
            "recibo_agua_marzo.pdf": "pld.comprobante_domicilio",
            "telmex_enero.pdf": "pld.comprobante_domicilio",
            "izzi_febrero.pdf": "pld.comprobante_domicilio",
            "totalplay_marzo.pdf": "pld.comprobante_domicilio",
        }
        for filename, expected_prompt_key in casos.items():
            prompt_key, matched = classify_by_filename(filename)
            self.assertEqual(prompt_key, expected_prompt_key)
            self.assertTrue(matched)

    def test_no_cruza_frontera_de_palabras_al_concatenar(self):
        # Regresion: "izzi_febrero" concatenado sin limites da "izzIFEbrero",
        # que por casualidad contiene "ife" (INE) sin que el archivo tenga
        # relacion alguna con una identificacion.
        prompt_key, matched = classify_by_filename("izzi_febrero.pdf")
        self.assertEqual(prompt_key, "pld.comprobante_domicilio")
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
