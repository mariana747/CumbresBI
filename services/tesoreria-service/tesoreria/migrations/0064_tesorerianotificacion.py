import tesoreria.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0063_aceptar_facturas_operadora_ml"),
    ]

    operations = [
        migrations.CreateModel(
            name="TesoreriaNotificacion",
            fields=[
                ("id_notificacion", models.CharField(default=tesoreria.models._short_id, editable=False, max_length=8, primary_key=True, serialize=False)),
                ("destinatario", models.CharField(max_length=8)),
                ("tipo", models.CharField(max_length=50)),
                ("mensaje", models.CharField(max_length=500)),
                ("link_url", models.CharField(blank=True, max_length=500, null=True)),
                ("leida", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "tesoreria_notificaciones", "ordering": ["-created_at"]},
        ),
    ]
