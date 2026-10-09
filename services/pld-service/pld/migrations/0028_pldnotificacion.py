from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pld", "0027_requiere_revision_pld"),
    ]

    operations = [
        migrations.CreateModel(
            name="PldNotificacion",
            fields=[
                ("id_notificacion", models.CharField(max_length=8, primary_key=True, serialize=False)),
                ("destinatario", models.CharField(max_length=8)),
                ("tipo", models.CharField(max_length=50)),
                ("mensaje", models.CharField(max_length=500)),
                ("link_url", models.CharField(blank=True, max_length=500, null=True)),
                ("leida", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "pld_notificacion",
                "ordering": ["-created_at"],
            },
        ),
    ]
