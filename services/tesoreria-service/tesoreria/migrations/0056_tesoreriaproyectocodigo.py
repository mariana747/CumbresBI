from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tesoreria', '0055_index_razon_social_alias'),
    ]

    operations = [
        migrations.CreateModel(
            name='TesoreriaProyectoCodigo',
            fields=[
                ('codigo', models.CharField(max_length=3, primary_key=True, serialize=False)),
                ('significado', models.CharField(blank=True, max_length=100, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('created_by', models.CharField(blank=True, max_length=100, null=True)),
            ],
            options={
                'db_table': 'tesoreria_proyecto_codigos',
                'ordering': ['codigo'],
            },
        ),
    ]
