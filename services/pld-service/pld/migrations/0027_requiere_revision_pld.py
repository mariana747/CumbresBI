from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pld', '0026_add_grado_riesgo_es_pep_notas'),
    ]

    operations = [
        migrations.AddField(
            model_name='pldcontrapartekyc',
            name='requiere_revision_pld',
            field=models.BooleanField(default=False),
        ),
    ]
