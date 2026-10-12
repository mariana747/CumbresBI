from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vivienda', '0002_viviendaventasexpediente_medio_pago_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='viviendaventasexpedienteitem',
            name='fecha_limite',
            field=models.DateField(blank=True, null=True),
        ),
    ]
