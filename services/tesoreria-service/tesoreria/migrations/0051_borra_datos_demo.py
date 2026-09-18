import importlib

from django.db import migrations

# Borra los datos DEMO sembrados por 0004-0007 (bancos/cuentas/saldos/
# flujos/nota de credito de ejemplo) - reusa el unseed() que cada una ya
# trae, en vez de duplicar los IDs demo aqui. Igual criterio que
# iam.0019_borra_sociedades_placeholder: nunca deben aparecer datos de
# ejemplo en un ambiente real sin que alguien tenga que acordarse de
# revertir a mano.
SEEDS = [
    "0004_seed_saldos_demo",
    "0005_seed_flujo_demo",
    "0006_seed_flujos_demo_variados",
    "0007_seed_nota_credito_demo",
]


def borrar(apps, schema_editor):
    for nombre in reversed(SEEDS):
        modulo = importlib.import_module(f"tesoreria.migrations.{nombre}")
        modulo.unseed(apps, schema_editor)


def revertir(apps, schema_editor):
    # No se re-siembran los datos DEMO al revertir - esta migracion existe
    # justamente para dejar de tenerlos en ambientes reales.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0050_alter_tesoreriafactura_comprobante_metodo_pago_and_more"),
    ]

    operations = [
        migrations.RunPython(borrar, revertir),
    ]
