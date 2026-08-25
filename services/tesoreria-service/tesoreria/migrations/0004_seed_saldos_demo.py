from decimal import Decimal

from django.db import migrations

# Datos de ejemplo (25/Ago/2026, para poder ver algo en /tesoreria/saldos
# sin datos reales todavia) - todo prefijado "DEMO" a proposito, es un
# sistema financiero real y no se quiere confundir esto con saldos de
# verdad de ninguna sociedad. Banco/Cuentas/Saldos de juguete, reversibles
# con el unseed (se borran por id_banxico, no deja nada huerfano).
BANCO_DEMO = ("DEMO1", "Banco Demo", "DEMO")

CUENTAS_DEMO = [
    # (id_cuenta_bancaria [max 8], alias, clabe [max 18])
    ("DEMOCT01", "DEMO/BBVA/0001 CHEQUES", "000000000000000001"[:18]),
    ("DEMOCT02", "DEMO/BBVA/0002 INVERSION", "000000000000000002"[:18]),
    ("DEMOCT03", "DEMO/SANTANDER/0003 NOMINA", "000000000000000003"[:18]),
]

# (id_saldo, id_cuenta_bancaria, fecha, saldo)
SALDOS_DEMO = [
    ("demo0001", "DEMOCT01", "2026-08-24", Decimal("125430.50")),
    ("demo0002", "DEMOCT02", "2026-08-24", Decimal("2540000.00")),
    ("demo0003", "DEMOCT03", "2026-08-24", Decimal("87650.75")),
    ("demo0004", "DEMOCT01", "2026-08-25", Decimal("118920.10")),
    ("demo0005", "DEMOCT02", "2026-08-25", Decimal("2555000.00")),
    ("demo0006", "DEMOCT03", "2026-08-25", Decimal("91200.00")),
]


def seed(apps, schema_editor):
    TesoreriaBanco = apps.get_model("tesoreria", "TesoreriaBanco")
    TesoreriaCuenta = apps.get_model("tesoreria", "TesoreriaCuenta")
    TesoreriaSaldo = apps.get_model("tesoreria", "TesoreriaSaldo")

    id_banxico, banco, alias_banco = BANCO_DEMO
    TesoreriaBanco.objects.get_or_create(
        id_banxico=id_banxico, defaults={"banco": banco, "alias": alias_banco}
    )

    for id_cuenta, alias, clabe in CUENTAS_DEMO:
        TesoreriaCuenta.objects.get_or_create(
            id_cuenta_bancaria=id_cuenta,
            defaults={
                "banco_id": id_banxico,
                "alias": alias,
                "clabe": clabe,
                "activa": True,
                "apertura": "2026-01-01",
            },
        )

    for id_saldo, id_cuenta, fecha, saldo in SALDOS_DEMO:
        TesoreriaSaldo.objects.get_or_create(
            id=id_saldo, defaults={"cuenta": id_cuenta, "fecha": fecha, "saldo": saldo}
        )


def unseed(apps, schema_editor):
    TesoreriaBanco = apps.get_model("tesoreria", "TesoreriaBanco")
    TesoreriaCuenta = apps.get_model("tesoreria", "TesoreriaCuenta")
    TesoreriaSaldo = apps.get_model("tesoreria", "TesoreriaSaldo")

    TesoreriaSaldo.objects.filter(id__in=[s[0] for s in SALDOS_DEMO]).delete()
    TesoreriaCuenta.objects.filter(id_cuenta_bancaria__in=[c[0] for c in CUENTAS_DEMO]).delete()
    TesoreriaBanco.objects.filter(id_banxico=BANCO_DEMO[0]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0003_factura_estados_y_link_xml"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
