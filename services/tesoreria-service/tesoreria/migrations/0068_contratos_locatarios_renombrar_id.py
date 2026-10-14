"""Renames existing contracts whose contraparte has referencia_pago,
prepending that value to id_contrato:
  {sociedad}-{id_contraparte}-{consecutivo}
→ {referencia_pago}-{sociedad}-{id_contraparte}-{consecutivo}

Uses raw SQL to update the PK and its FK references atomically.
"""
from django.db import migrations


def _renombrar_contratos(cur, filas):
    """Renombra PKs y sus referencias en hijos con FK checks desactivados."""
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    try:
        for id_viejo, id_nuevo in filas:
            cur.execute(
                "UPDATE tesoreria_contratos SET id_contrato = %s WHERE id_contrato = %s",
                [id_nuevo, id_viejo],
            )
            cur.execute(
                "UPDATE tesoreria_flujos SET id_contrato = %s WHERE id_contrato = %s",
                [id_nuevo, id_viejo],
            )
            cur.execute(
                "UPDATE tesoreria_contrato_documentos SET id_contrato = %s WHERE id_contrato = %s",
                [id_nuevo, id_viejo],
            )
    finally:
        cur.execute("SET FOREIGN_KEY_CHECKS = 1")


def renombrar(apps, schema_editor):
    with schema_editor.connection.cursor() as cur:
        cur.execute(
            """
            SELECT c.id_contrato, CONCAT(cp.referencia_pago, '-', c.id_contrato)
            FROM tesoreria_contratos c
            JOIN tesoreria_contrapartes cp ON cp.id_contraparte = c.id_contraparte
            WHERE cp.referencia_pago IS NOT NULL
              AND cp.referencia_pago != ''
              AND c.id_contrato NOT LIKE CONCAT(cp.referencia_pago, '-%')
            """
        )
        _renombrar_contratos(cur, cur.fetchall())


def revertir(apps, schema_editor):
    with schema_editor.connection.cursor() as cur:
        cur.execute(
            """
            SELECT c.id_contrato,
                   SUBSTRING(c.id_contrato, LENGTH(cp.referencia_pago) + 2)
            FROM tesoreria_contratos c
            JOIN tesoreria_contrapartes cp ON cp.id_contraparte = c.id_contraparte
            WHERE cp.referencia_pago IS NOT NULL
              AND cp.referencia_pago != ''
              AND c.id_contrato LIKE CONCAT(cp.referencia_pago, '-%')
            """
        )
        _renombrar_contratos(cur, cur.fetchall())


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0067_seed_referencias_pago"),
    ]

    operations = [
        migrations.RunPython(renombrar, revertir),
    ]
