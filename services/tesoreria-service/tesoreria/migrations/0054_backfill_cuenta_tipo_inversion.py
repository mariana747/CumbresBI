from django.db import migrations


# Backfill de TesoreriaCuenta.tipo (23/Sep/2026, encontrado en vivo: "porque
# todas aparecen como cheque") - el campo se agrego con default=CHEQUES y
# nunca se le hizo backfill a las cuentas migradas del legado (que no
# distinguian tipo de cuenta). Las 39 cuentas reales quedaron todas en
# CHEQUES, incluyendo las que por su alias son claramente de Inversion (9)
# o Pagare (1) - esto no es solo cosmetico, tipo=INVERSION es lo que
# habilita la accion RENDIMIENTOS en el reporte diario de saldos. Pagare es
# su propia categoria (TIPO_PAGARE, no Inversion - confirmado 23/Sep/2026).
#
# Por alias (no por id_cuenta_bancaria fijo) para que corra igual contra
# cualquier ambiente sin hardcodear ids de cuentas reales - mismo criterio
# que otros backfills de este servicio (ver feedback-no-hardcodear-datos-
# reales-de-empresa).
def backfill_tipo_inversion(apps, schema_editor):
    TesoreriaCuenta = apps.get_model("tesoreria", "TesoreriaCuenta")

    TesoreriaCuenta.objects.filter(alias__icontains="inversion").update(tipo="INVERSION")
    TesoreriaCuenta.objects.filter(alias__icontains="pagar").update(tipo="PAGARE")


class Migration(migrations.Migration):
    dependencies = [
        ("tesoreria", "0053_contrato_sociedad_nullable"),
    ]

    operations = [
        migrations.RunPython(backfill_tipo_inversion, migrations.RunPython.noop),
    ]
