"""Campos de desglose fiscal de nómina en TesoreriaFlujo."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0062_tesoreria_tabla_isr"),
    ]

    operations = [
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="nom_salario_diario",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="nom_dias",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="nom_ingreso_bruto",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="nom_isr",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="nom_sbc_diario",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="nom_imss_obrero",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="nom_total_deducciones",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
    ]
