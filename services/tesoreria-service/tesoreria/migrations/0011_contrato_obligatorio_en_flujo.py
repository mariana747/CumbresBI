import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

# finanzas.md sec. "General Notes": "No transaction can be registered
# without a linked contract" - decision 26/Ago/2026: sin excepcion, ni
# para reembolsos a empleados (antes el caso valido documentado en
# TesoreriaFlujo.contrato, ver 0006_seed_flujos_demo_variados). Un
# reembolso ahora usa un contrato generico de la misma plantilla de
# Contrato (misma tabla, sin modelo especial) en vez de quedar sin
# contrato.
CONTRAPARTE_REEMBOLSOS_ID = "GENREEMB"  # max_length=8 en id_contraparte
CONTRATO_REEMBOLSOS_ID = "GEN-REEMBOLSOS-001"


def backfill_y_migrar(apps, schema_editor):
    TesoreriaContraparte = apps.get_model("tesoreria", "TesoreriaContraparte")
    TesoreriaContrato = apps.get_model("tesoreria", "TesoreriaContrato")
    TesoreriaFlujo = apps.get_model("tesoreria", "TesoreriaFlujo")

    huerfanos = TesoreriaFlujo.objects.filter(contrato__isnull=True)
    if not huerfanos.exists():
        return

    # Alcance minimo: solo se crea el contrato generico si de verdad hace
    # falta (hay flujos sin contrato que migrar), no en cada entorno nuevo.
    TesoreriaContraparte.objects.get_or_create(
        id_contraparte=CONTRAPARTE_REEMBOLSOS_ID,
        defaults={"razon_social": "Reembolsos a empleados (generico)"},
    )
    # sociedad="GENERICO" porque un reembolso no pertenece a una sola
    # sociedad real; ScopedManager expone este contrato a todas via el
    # mismo criterio que cualquier registro fuera del catalogo de
    # sociedades reales (revisar si el cliente prefiere uno por sociedad
    # cuando el volumen de reembolsos lo justifique).
    TesoreriaContrato.objects.get_or_create(
        id_contrato=CONTRATO_REEMBOLSOS_ID,
        defaults={
            "sociedad": "GENERICO",
            "tipo": "INTERNO",
            "contraparte_id": CONTRAPARTE_REEMBOLSOS_ID,
            "concepto_factura": "Reembolsos a empleados",
            "status": "ACTIVO",
            "requiere_factura": False,
        },
    )
    huerfanos.update(contrato_id=CONTRATO_REEMBOLSOS_ID)


def revertir(apps, schema_editor):
    # No se puede saber cuales flujos eran huerfanos originalmente sin
    # guardar ese estado; se deja el contrato generico y su contraparte
    # (no hacen daño) en vez de re-nullificar a ciegas.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0010_cuenta_sociedad_tipo"),
    ]

    operations = [
        migrations.RunPython(backfill_y_migrar, revertir),
        migrations.AlterField(
            model_name="tesoreriaflujo",
            name="contrato",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="flujos",
                to="tesoreria.tesoreriacontrato",
                db_column="id_contrato",
            ),
        ),
    ]
