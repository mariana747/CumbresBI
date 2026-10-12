from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0064_tesorerianotificacion"),
    ]

    operations = [
        migrations.DeleteModel(
            name="TesoreriaNotificacion",
        ),
    ]
