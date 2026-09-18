from django.db import migrations

# Corrige los datos de las 3 sociedades de Fase 1 con los RFC fiscales
# reales (confirmados por Mariana, 18/Sep/2026, consultados directo de la
# base legacy "administracion.general_sociedades" via Cloud SQL Studio).
#
# No se confia en lo que ya haya en la tabla (en local se encontro una
# mezcla: placeholders "#####N" de 0006_seed_sociedades.py y al menos una
# fila creada a mano con RFC real pero razon_social equivocada) - por eso
# se borra por razon_social (cualquier variante conocida, con/sin acento)
# ademas de por los placeholders, y se vuelve a crear limpio. Idempotente:
# en un despliegue nuevo (solo placeholders) o en local (datos mezclados)
# el resultado final es el mismo.
RFC_REAL = [
    # (rfc real, razon_social)
    ("CTI171208R90", "CIF TIZARA"),
    ("TCA171016F45", "TIZARA CAPITAL"),
    ("WBR120307IL7", "CONSULTORÍA Y PROYECTOS CUMBRES"),
]

RAZONES_SOCIALES_CONOCIDAS = [
    "CIF TIZARA",
    "TIZARA CAPITAL",
    "CONSULTORÍA Y PROYECTOS CUMBRES",
    "CONSULTORIA Y PROYECTOS CUMBRES",
]

PLACEHOLDERS = ["#####1", "#####2", "#####3"]


def actualizar(apps, schema_editor):
    GeneralSociedad = apps.get_model("iam", "GeneralSociedad")
    GeneralSociedad.objects.filter(rfc__in=PLACEHOLDERS).delete()
    GeneralSociedad.objects.filter(razon_social__in=RAZONES_SOCIALES_CONOCIDAS).delete()
    for rfc, razon_social in RFC_REAL:
        GeneralSociedad.objects.get_or_create(rfc=rfc, defaults={"razon_social": razon_social})


def revertir(apps, schema_editor):
    GeneralSociedad = apps.get_model("iam", "GeneralSociedad")
    GeneralSociedad.objects.filter(rfc__in=[rfc for rfc, _ in RFC_REAL]).delete()
    for placeholder, (_, razon_social) in zip(PLACEHOLDERS, RFC_REAL):
        GeneralSociedad.objects.get_or_create(rfc=placeholder, defaults={"razon_social": razon_social})


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0018_iamgooglepersonaltoken"),
    ]

    operations = [
        migrations.RunPython(actualizar, revertir),
    ]
