from decimal import Decimal

from django.db import migrations

# Nota de credito de ejemplo (25/Ago/2026, dato real de CFDI que compartio
# el cliente para probar la pantalla) - RFC/razon social son datos de la
# empresa en el comprobante, no de una persona fisica, se dejan igual al
# original. `uuid_relacionado` (FK a TesoreriaFactura.timbre_uuid) se deja
# en null a proposito: la factura que referencia
# (9B9458B3-46E9-11F0-824D-7782FE0F5203) no existe en este dataset demo,
# y no se fabrica una factura falsa solo para poder ligarla.
NOTA_CREDITO_DEMO = {
    "comprobante_version": "4.0",
    "comprobante_serie": "BL",
    "comprobante_folio": "5265",
    "comprobante_fecha": "2025-06-11 16:06:35",
    "comprobante_forma_pago": "30",
    "comprobante_no_certificado": "00001000000711873643",
    "comprobante_sub_total": Decimal("375.00"),
    "comprobante_moneda": "MXN",
    "comprobante_exportacion": "01",
    "comprobante_tipo_cambio": "1.0000",
    "comprobante_total": Decimal("435.00"),
    "comprobante_tipo_de_comprobante": "E",
    "comprobante_metodo_pago": "PUE",
    "comprobante_lugar_expedicion": "75110",
    "tipo_relacion": "07",
    "emisor_rfc": "BCA001206674",
    "emisor_nombre": "BODEGA CRUZ AZUL DEL CENTRO",
    "emisor_regimen_fiscal": "601",
    "receptor_rfc": "WBR120307IL7",
    "receptor_nombre": "CONSULTORIA Y PROYECTOS CUMBRES",
    "receptor_domicilio_fiscal_receptor": "03810",
    "receptor_regimen_fiscal_receptor": "601",
    "receptor_uso_cfdi": "G02",
    "timbre_version": "1.1",
    "timbre_uuid": "56CFE811-4710-11F0-90C4-91366C118D81",
    "timbre_fecha_timbrado": "2025-06-11 16:05:28",
    "timbre_rfc_prov_certif": "EME000602QR9",
    "timbre_no_certificado_sat": "00001000000700047508",
    "tipo_factura": "Recibida",
    "link_pdf": "https://drive.google.com/file/d/1JvrbCGUCH_AiBDSn7sKEXGiiGHnR4VB3/view",
}


def seed(apps, schema_editor):
    TesoreriaNotaCredito = apps.get_model("tesoreria", "TesoreriaNotaCredito")
    TesoreriaNotaCredito.objects.get_or_create(
        timbre_uuid=NOTA_CREDITO_DEMO["timbre_uuid"], defaults=NOTA_CREDITO_DEMO
    )


def unseed(apps, schema_editor):
    TesoreriaNotaCredito = apps.get_model("tesoreria", "TesoreriaNotaCredito")
    TesoreriaNotaCredito.objects.filter(timbre_uuid=NOTA_CREDITO_DEMO["timbre_uuid"]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0006_seed_flujos_demo_variados"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
