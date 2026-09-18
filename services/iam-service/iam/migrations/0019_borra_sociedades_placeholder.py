from django.db import migrations

# Borra las 3 sociedades placeholder sembradas por 0006_seed_sociedades.py
# (RFC "#####1/2/3"). No se hardcodea ningun dato real aqui - el RFC/razon
# social reales de estas sociedades se cargan por fuera de git, como parte
# de la migracion de datos legacy pendiente (ver memoria del proyecto), no
# en una migracion versionada. La tabla debe quedar vacia hasta entonces.
PLACEHOLDERS = ["#####1", "#####2", "#####3"]


def borrar(apps, schema_editor):
    GeneralSociedad = apps.get_model("iam", "GeneralSociedad")
    GeneralSociedad.objects.filter(rfc__in=PLACEHOLDERS).delete()


def revertir(apps, schema_editor):
    # No se recrean los placeholders al revertir - 0006_seed_sociedades.py
    # ya no es el criterio vigente (esta migracion existe justamente para
    # dejar de tenerlos).
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0018_iamgooglepersonaltoken"),
    ]

    operations = [
        migrations.RunPython(borrar, revertir),
    ]
