from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0065_delete_tesorerianotificacion"),
    ]

    operations = [
        migrations.AddField(
            model_name="tesoreriacontraparte",
            name="referencia_pago",
            field=models.CharField(blank=True, null=True, max_length=20, unique=True),
        ),
        migrations.AddField(
            model_name="tesoreriacontraparte",
            name="local",
            field=models.CharField(blank=True, null=True, max_length=100),
        ),
        migrations.AddField(
            model_name="tesoreriacontraparte",
            name="nombre_comercial",
            field=models.CharField(blank=True, null=True, max_length=100),
        ),
    ]
