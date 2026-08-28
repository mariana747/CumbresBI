from django.db import migrations, models

# Reversion (28/Ago/2026, pedido explicito de Mariana, vuelve al ERD
# original) de la relajacion del 19/Ago/2026 ("contraparte maestra unica")
# - email y tipo_persona vuelven a ser obligatorios. Antes de poder poner
# NOT NULL hay que rellenar los registros que ya existen sin esos datos
# (ver TesoreriaContraparte.email/tipo_persona en models.py) - hoy solo
# aplica a la contraparte generica de reembolsos (GENREEMB, ver migracion
# 0011_contrato_obligatorio_en_flujo), pero se recorre por si hay mas.
CONTRAPARTE_REEMBOLSOS_ID = "GENREEMB"


def backfill_email_y_tipo_persona(apps, schema_editor):
    TesoreriaContraparte = apps.get_model("tesoreria", "TesoreriaContraparte")
    TesoreriaContraparte.objects.filter(email__isnull=True).update(email="")
    TesoreriaContraparte.objects.filter(tipo_persona__isnull=True).update(tipo_persona="moral")
    # La generica de reembolsos no es una persona real - se le pone un
    # correo interno reconocible en vez de dejarla vacia.
    TesoreriaContraparte.objects.filter(id_contraparte=CONTRAPARTE_REEMBOLSOS_ID, email="").update(
        email="reembolsos@interno.cypcumbres.mx"
    )


def revertir(apps, schema_editor):
    # No hay nada que deshacer - volver a NULL los valores rellenados no
    # aporta nada (mismo criterio que la migracion 0011).
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0018_tesoreriadocumentoticket"),
    ]

    operations = [
        migrations.RunPython(backfill_email_y_tipo_persona, revertir),
        migrations.AlterField(
            model_name="tesoreriacontraparte",
            name="email",
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name="tesoreriacontraparte",
            name="tipo_persona",
            field=models.CharField(
                choices=[
                    ("fisica", "Fisica"),
                    ("moral", "Moral"),
                    ("fisica_act_emp", "Fisica con actividad empresarial"),
                    ("fideicomiso", "Fideicomiso"),
                ],
                max_length=20,
            ),
        ),
    ]
