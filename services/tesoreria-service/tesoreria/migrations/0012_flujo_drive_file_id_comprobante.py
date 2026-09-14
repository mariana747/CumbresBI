from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0011_contrato_obligatorio_en_flujo"),
    ]

    operations = [
        migrations.AddField(
            model_name="tesoreriaflujo",
            name="drive_file_id_comprobante",
            field=models.TextField(blank=True, null=True),
        ),
    ]
