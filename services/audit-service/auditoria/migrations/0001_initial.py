from django.db import migrations, models

import auditoria.models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="BitacoraAuditoria",
            fields=[
                (
                    "event_id",
                    models.CharField(
                        default=auditoria.models._event_id,
                        editable=False,
                        max_length=32,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("servicio_origen", models.CharField(max_length=50)),
                ("actor_user_id", models.CharField(max_length=8)),
                ("accion", models.CharField(max_length=100)),
                ("entidad", models.CharField(max_length=100)),
                ("entidad_id", models.CharField(max_length=255)),
                ("valores_previos", models.JSONField(blank=True, null=True)),
                ("valores_nuevos", models.JSONField(blank=True, null=True)),
                ("ocurrido_en", models.DateTimeField()),
                ("recibido_en", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "bitacora_auditoria",
                "ordering": ["-ocurrido_en"],
            },
        ),
    ]
