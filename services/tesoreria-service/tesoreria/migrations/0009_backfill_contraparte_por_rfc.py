from django.db import migrations


# Backfill del vinculo contraparte (agregado en 0008) para registros que ya
# existian antes de la FK - busca por emisor_rfc == TesoreriaContraparte.rfc
# (el emisor del CFDI es siempre el proveedor, Cumbres es el receptor).
# Best-effort: si el RFC no tiene match (o esta vacio/repetido), el
# registro se queda sin vincular, no truena la migracion.
def vincular_por_rfc(apps, schema_editor):
    TesoreriaContraparte = apps.get_model("tesoreria", "TesoreriaContraparte")
    TesoreriaFactura = apps.get_model("tesoreria", "TesoreriaFactura")
    TesoreriaComplementoPago = apps.get_model("tesoreria", "TesoreriaComplementoPago")
    TesoreriaNotaCredito = apps.get_model("tesoreria", "TesoreriaNotaCredito")

    contrapartes_por_rfc = {
        c.rfc: c for c in TesoreriaContraparte.objects.exclude(rfc__isnull=True).exclude(rfc="")
    }

    for modelo in (TesoreriaFactura, TesoreriaComplementoPago, TesoreriaNotaCredito):
        for registro in modelo.objects.filter(contraparte__isnull=True).exclude(
            emisor_rfc__isnull=True
        ).exclude(emisor_rfc=""):
            contraparte = contrapartes_por_rfc.get(registro.emisor_rfc)
            if contraparte:
                registro.contraparte = contraparte
                registro.save(update_fields=["contraparte"])


def revertir(apps, schema_editor):
    # No hay nada que deshacer - revertir esta migracion de datos significa
    # dejar el campo tal como AddField lo dejo (null), que es lo que ya
    # pasa al hacer migrate hacia atras sin tocar los datos.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0008_factura_complemento_nota_contraparte_fk"),
    ]

    operations = [
        migrations.RunPython(vincular_por_rfc, revertir),
    ]
