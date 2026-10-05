from django.db import migrations


def aceptar_facturas_operadora_ml(apps, schema_editor):
    TesoreriaFactura = apps.get_model("tesoreria", "TesoreriaFactura")
    TesoreriaFactura.objects.filter(
        emisor_nombre__icontains="OPERADORA DE SERVICIOS MEDICOS ML"
    ).update(estado="ACEPTADA")


class Migration(migrations.Migration):
    dependencies = [
        ("tesoreria", "0062_remove_fecha_pago_original"),
    ]

    operations = [
        migrations.RunPython(aceptar_facturas_operadora_ml, migrations.RunPython.noop),
    ]
