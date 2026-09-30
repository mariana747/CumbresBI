from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0060_remove_tesoreriacuenta_disponible_ministrar_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tesoreriacontrato",
            name="concepto",
            field=models.TextField(blank=True, null=True),
        ),
    ]
