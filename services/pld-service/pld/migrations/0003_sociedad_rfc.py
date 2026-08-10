from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pld", "0002_pldticketcliente_token_hash"),
    ]

    operations = [
        migrations.AddField(
            model_name="pldcontrapartekyc",
            name="sociedad_rfc",
            # Punto 2 del plan de Fase 1 (RLS real): columna real de alcance,
            # referencia laxa a general_sociedades.rfc (iam-service) - ver
            # nota de clase en models.py. blank/null porque los expedientes
            # existentes no tienen valor todavia (backfill pendiente, fuera
            # de esta migracion).
            field=models.CharField(blank=True, max_length=13, null=True),
        ),
    ]
