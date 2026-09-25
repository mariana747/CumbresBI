from django.db import migrations

# Siembra los codigos de 3 letras que ya existen como texto libre en
# TesoreriaContrato.proyecto (25/Sep/2026, arranque del catalogo real - ver
# memoria "TesoreriaContrato.proyecto no es ViviendaProyecto"). Solo ZVP
# tiene significado confirmado (cruza con vivienda_proyectos); los otros 8
# son codigos legacy sin significado conocido todavia ("son para el
# futuro"), se siembran sin significado para que ya aparezcan en el
# Autocomplete y no se vuelvan a crear duplicados por error. FID
# (Fideicomiso) se agrega de una vez porque es el primero nuevo que se usa
# desde este catalogo.
CODIGOS = [
    ("TCC", None),
    ("ZVP", "Zoe Vida Puebla"),
    ("HOT", None),
    ("Z21", None),
    ("ZVT", None),
    ("EDH", None),
    ("BIP", None),
    ("HGQ", None),
    ("LMR", None),
    ("FID", "Fideicomiso"),
]


def sembrar(apps, schema_editor):
    TesoreriaProyectoCodigo = apps.get_model("tesoreria", "TesoreriaProyectoCodigo")
    for codigo, significado in CODIGOS:
        TesoreriaProyectoCodigo.objects.get_or_create(codigo=codigo, defaults={"significado": significado})


def revertir(apps, schema_editor):
    TesoreriaProyectoCodigo = apps.get_model("tesoreria", "TesoreriaProyectoCodigo")
    TesoreriaProyectoCodigo.objects.filter(codigo__in=[c for c, _ in CODIGOS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('tesoreria', '0056_tesoreriaproyectocodigo'),
    ]

    operations = [
        migrations.RunPython(sembrar, revertir),
    ]
