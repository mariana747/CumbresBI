# Merge migration (26/Ago/2026) - dos ramas independientes (feature/tesoreria-
# facturacion-cfdi y la que agrego pld-documentos) crearon cada una su propia
# migracion "0013" y el merge del PR #28 las dejo como dos leaf nodes en el
# grafo, sin este merge "manage.py test" truena con CommandError
# ("Conflicting migrations detected") antes de poder correr nada - lo
# encontro CI (iam-service) el 26/Ago/2026, no toca ningun dato ni schema,
# solo une las dos ramas del grafo de migraciones.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('iam', '0013_seed_docint_tesoreria'),
        ('iam', '0013_seed_pld_documentos'),
    ]

    operations = [
    ]
