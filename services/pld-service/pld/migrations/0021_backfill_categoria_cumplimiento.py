# Reclasificacion retroactiva (04/Sep/2026, decision de Mariana: "automatica
# por tipo_persona, casos raros se revisan a mano") - los expedientes ya
# dados de alta antes de que existiera categoria_cumplimiento se clasifican
# aqui mismo, con la misma regla que PldContraparteKyc.categoria_por_tipo_persona:
# fisica -> KYC, moral -> KYB, cualquier otro caso (fideicomiso, tipo_persona
# vacio) -> PENDIENTE_REVISION para que un analista lo revise a mano, nunca
# se fuerza a KYC/KYB por default.
from django.db import migrations


def backfill_categoria(apps, schema_editor):
    PldContraparteKyc = apps.get_model("pld", "PldContraparteKyc")
    KYC, KYB, PENDIENTE = "KYC", "KYB", "PENDIENTE_REVISION"
    PldContraparteKyc.objects.filter(tipo_persona="fisica").update(categoria_cumplimiento=KYC)
    PldContraparteKyc.objects.filter(tipo_persona="moral").update(categoria_cumplimiento=KYB)
    PldContraparteKyc.objects.exclude(tipo_persona__in=["fisica", "moral"]).update(
        categoria_cumplimiento=PENDIENTE
    )


def revertir(apps, schema_editor):
    PldContraparteKyc = apps.get_model("pld", "PldContraparteKyc")
    PldContraparteKyc.objects.all().update(categoria_cumplimiento=None)


class Migration(migrations.Migration):

    dependencies = [
        ("pld", "0020_pldcontrapartedoc_obligatorio_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_categoria, revertir),
    ]
