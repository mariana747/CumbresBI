from django.db import migrations

# Enforcement append-only a nivel de motor (docs/architecture/README.md sec. 9):
# GRANT sin UPDATE/DELETE/DROP para el usuario runtime (se aplica fuera de
# Django, al aprovisionar el usuario de BD del servicio) + estos triggers,
# que son la ultima linea de defensa incluso si alguien conecta con un usuario
# con privilegios de mas.

CREATE_TRIGGERS_SQL = """
CREATE TRIGGER bitacora_auditoria_no_update
BEFORE UPDATE ON bitacora_auditoria
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'bitacora_auditoria es append-only: UPDATE no permitido';
END;
"""

DROP_UPDATE_TRIGGER_SQL = "DROP TRIGGER IF EXISTS bitacora_auditoria_no_update;"

CREATE_DELETE_TRIGGER_SQL = """
CREATE TRIGGER bitacora_auditoria_no_delete
BEFORE DELETE ON bitacora_auditoria
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'bitacora_auditoria es append-only: DELETE no permitido';
END;
"""

DROP_DELETE_TRIGGER_SQL = "DROP TRIGGER IF EXISTS bitacora_auditoria_no_delete;"


class Migration(migrations.Migration):

    dependencies = [
        ("auditoria", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=CREATE_TRIGGERS_SQL,
            reverse_sql=DROP_UPDATE_TRIGGER_SQL,
        ),
        migrations.RunSQL(
            sql=CREATE_DELETE_TRIGGER_SQL,
            reverse_sql=DROP_DELETE_TRIGGER_SQL,
        ),
    ]
