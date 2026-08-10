from django.db import migrations

# Punto 2 del plan de Fase 1 (RLS real): las 3 sociedades confirmadas por el
# cliente (Mariana, 2026-08-10, ver memoria de sesion
# "empresas-alcance-fase1") - se agregaran mas a futuro, sin migracion
# pesada (basta un nuevo GeneralSociedad).
#
# RFC PLACEHOLDER: el cliente todavia no dio el RFC real de cada sociedad
# (pidio dejarlo como "#####" por ahora, 2026-08-10) - estos valores deben
# reemplazarse por el RFC fiscal real antes de produccion. Se usa un sufijo
# numerico para que sean unicos (rfc es primary key de GeneralSociedad).
SOCIEDADES = [
    ("#####1", "CIF TIZARA"),
    ("#####2", "TIZARA CAPITAL"),
    ("#####3", "CONSULTORÍA Y PROYECTOS CUMBRES"),
]


def seed(apps, schema_editor):
    GeneralSociedad = apps.get_model("iam", "GeneralSociedad")
    for rfc, razon_social in SOCIEDADES:
        GeneralSociedad.objects.get_or_create(
            rfc=rfc,
            defaults={"razon_social": razon_social},
        )


def unseed(apps, schema_editor):
    GeneralSociedad = apps.get_model("iam", "GeneralSociedad")
    GeneralSociedad.objects.filter(rfc__in=[rfc for rfc, _ in SOCIEDADES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0005_iammagiclink"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
