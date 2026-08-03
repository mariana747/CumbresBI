from django.db import migrations, models


# Fusion de duplicado (confirmado por el cliente): "CUMBRES" y "CONSULTORÍA Y
# PROYECTOS CUMBRES" son la misma empresa - la migracion 0002 los creo como
# dos IamGroup separados (alias corto vs. nombre largo del holding). Aqui se
# conserva el nombre largo (registro real de la empresa) y se reasignan las
# membresias de "CUMBRES" antes de borrar el duplicado, para no perder
# historial de iam_user_groups.
def fusionar_cumbres(apps, schema_editor):
    IamGroup = apps.get_model("iam", "IamGroup")
    IamUserGroup = apps.get_model("iam", "IamUserGroup")

    try:
        largo = IamGroup.objects.get(nombre="CONSULTORÍA Y PROYECTOS CUMBRES")
        corto = IamGroup.objects.get(nombre="CUMBRES")
    except IamGroup.DoesNotExist:
        return

    IamUserGroup.objects.filter(group=corto).update(group=largo)
    largo.alias = "CUMBRES"
    largo.save(update_fields=["alias"])
    corto.delete()


def revertir(apps, schema_editor):
    # No se recrea el duplicado al revertir - era un dato de seed, no una
    # migracion de esquema real.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0002_seed_roles_grupos"),
    ]

    operations = [
        migrations.AddField(
            model_name="iamgroup",
            name="alias",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.RunPython(fusionar_cumbres, revertir),
    ]
