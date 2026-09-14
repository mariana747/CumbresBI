from django.db import migrations, models

import docint.models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="AnalysisRequestLog",
            fields=[
                (
                    "request_id",
                    models.CharField(
                        default=docint.models._request_id,
                        editable=False,
                        max_length=32,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("servicio_solicitante", models.CharField(max_length=50)),
                ("tipo_documento_esperado", models.CharField(max_length=100)),
                ("tipo_documento_detectado", models.CharField(blank=True, max_length=100, null=True)),
                ("coincide_tipo_esperado", models.BooleanField(default=False)),
                ("confianza", models.FloatField(default=0.0)),
                ("proveedor_usado", models.CharField(default="ai-studio", max_length=20)),
                ("errores_validacion", models.JSONField(blank=True, default=list)),
                ("advertencias", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "docint_analysis_request_log",
                "ordering": ["-created_at"],
            },
        ),
    ]
