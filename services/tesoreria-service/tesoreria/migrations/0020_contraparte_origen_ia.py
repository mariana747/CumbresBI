from django.db import migrations, models

# 28/Ago/2026 - soporte para la conciliacion bancaria por IA (ver memoria
# "tesoreria-flujos-registro-y-conciliacion-ia-plan"): agrega el campo
# `origen` a TesoreriaContraparte y relaja email/tipo_persona a nivel de
# columna (vuelven a permitir NULL). La obligatoriedad para el alta manual
# (origen="manual", default) la impone ahora el serializer
# (TesoreriaContraparteSerializer.validate), no la base de datos - la
# migracion 0019 lo habia puesto NOT NULL para TODAS las altas; esta es la
# excepcion, no una reversion completa de 0019.


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0019_contraparte_email_tipo_persona_obligatorios"),
    ]

    operations = [
        migrations.AddField(
            model_name="tesoreriacontraparte",
            name="origen",
            field=models.CharField(
                choices=[("manual", "Alta manual"), ("ia", "Alta automatica por IA")],
                default="manual",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="tesoreriacontraparte",
            name="email",
            field=models.CharField(max_length=100, blank=True, null=True),
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
                blank=True,
                null=True,
            ),
        ),
    ]
