"""Modelo TesoreriaTablaISR + seed DOF 28/dic/2025 (quincenal y semanal)."""
import datetime

import django.db.models.deletion
from django.db import migrations, models


VIGENCIA = datetime.date(2026, 1, 1)

# (limite_inferior, limite_superior|None, cuota_fija, porcentaje)
TABLA_QUINCENAL = [
    ("0.01", "416.70", "0.00", "0.019200"),
    ("416.71", "3537.15", "7.95", "0.064000"),
    ("3537.16", "6216.15", "207.75", "0.108800"),
    ("6216.16", "7225.95", "499.20", "0.160000"),
    ("7225.96", "8651.40", "660.75", "0.179200"),
    ("8651.41", "17448.75", "916.20", "0.213600"),
    ("17448.76", "27501.60", "2795.25", "0.235200"),
    ("27501.61", "52505.25", "5159.70", "0.300000"),
    ("52505.26", "70006.95", "12660.75", "0.320000"),
    ("70006.96", "210020.70", "18261.30", "0.340000"),
    ("210020.71", None, "65866.05", "0.350000"),
]

TABLA_SEMANAL = [
    ("0.01", "194.46", "0.00", "0.019200"),
    ("194.47", "1650.67", "3.71", "0.064000"),
    ("1650.68", "2900.87", "96.95", "0.108800"),
    ("2900.88", "3372.11", "232.96", "0.160000"),
    ("3372.12", "4037.32", "308.35", "0.179200"),
    ("4037.33", "8142.75", "427.56", "0.213600"),
    ("8142.76", "12834.08", "1304.45", "0.235200"),
    ("12834.09", "24502.45", "2407.86", "0.300000"),
    ("24502.46", "32669.91", "5908.35", "0.320000"),
    ("32669.92", "98009.66", "8521.94", "0.340000"),
    ("98009.67", None, "30737.49", "0.350000"),
]


def seed_tablas(apps, schema_editor):
    TablaISR = apps.get_model("tesoreria", "TesoreriaTablaISR")
    for lim_inf, lim_sup, cuota, pct in TABLA_QUINCENAL:
        TablaISR.objects.create(
            periodicidad="QUINCENAL",
            dias=15,
            limite_inferior=lim_inf,
            limite_superior=lim_sup,
            cuota_fija=cuota,
            porcentaje=pct,
            vigencia_inicio=VIGENCIA,
        )
    for lim_inf, lim_sup, cuota, pct in TABLA_SEMANAL:
        TablaISR.objects.create(
            periodicidad="SEMANAL",
            dias=7,
            limite_inferior=lim_inf,
            limite_superior=lim_sup,
            cuota_fija=cuota,
            porcentaje=pct,
            vigencia_inicio=VIGENCIA,
        )


def delete_tablas(apps, schema_editor):
    apps.get_model("tesoreria", "TesoreriaTablaISR").objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0061_contrato_concepto"),
    ]

    operations = [
        migrations.CreateModel(
            name="TesoreriaTablaISR",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("periodicidad", models.CharField(
                    choices=[("QUINCENAL", "Quincenal (15 días)"), ("SEMANAL", "Semanal (7 días)")],
                    max_length=20,
                )),
                ("dias", models.PositiveSmallIntegerField()),
                ("limite_inferior", models.DecimalField(decimal_places=2, max_digits=14)),
                ("limite_superior", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("cuota_fija", models.DecimalField(decimal_places=2, max_digits=14)),
                ("porcentaje", models.DecimalField(decimal_places=6, max_digits=7)),
                ("vigencia_inicio", models.DateField()),
                ("vigencia_fin", models.DateField(blank=True, null=True)),
            ],
            options={"db_table": "tesoreria_tabla_isr", "ordering": ["periodicidad", "limite_inferior"]},
        ),
        migrations.RunPython(seed_tablas, delete_tablas),
    ]
