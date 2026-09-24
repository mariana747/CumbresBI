from django.db import migrations, models


# Indices de busqueda (23/Sep/2026, "a largo plazo no es rentable?" sobre el
# buscador en vivo de ContraparteSelector/CuentaBancariaSelector) - aceleran
# el order_by("razon_social")/order_by("-created_at") de esos querysets
# (evitan filesort) y cualquier busqueda exacta/por prefijo. El LIKE
# '%texto%' con wildcard al inicio (icontains) sigue sin poder usar un
# indice normal en MySQL/InnoDB - para eso haria falta FULLTEXT, no vale la
# pena todavia con el volumen actual (500-900 filas).
class Migration(migrations.Migration):
    dependencies = [
        ("tesoreria", "0054_backfill_cuenta_tipo_inversion"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tesoreriacontraparte",
            name="razon_social",
            field=models.CharField(db_index=True, max_length=100),
        ),
        migrations.AlterField(
            model_name="tesoreriacuenta",
            name="alias",
            field=models.CharField(blank=True, db_index=True, max_length=50, null=True),
        ),
    ]
