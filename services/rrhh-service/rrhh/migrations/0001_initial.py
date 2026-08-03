import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="RrhhEmpleado",
            fields=[
                ("id_empleado", models.CharField(max_length=255, primary_key=True, serialize=False)),
                ("apellido_paterno", models.CharField(blank=True, max_length=100, null=True)),
                ("apellido_materno", models.CharField(blank=True, max_length=100, null=True)),
                ("nombres", models.CharField(blank=True, max_length=100, null=True)),
                ("curp", models.CharField(blank=True, max_length=18, null=True)),
                ("rfc", models.CharField(blank=True, max_length=13, null=True)),
                ("nss", models.CharField(blank=True, max_length=11, null=True)),
                ("cta_afore", models.CharField(blank=True, max_length=50, null=True)),
                ("dom_calle", models.CharField(blank=True, max_length=150, null=True)),
                ("dom_numero_ext", models.CharField(blank=True, max_length=50, null=True)),
                ("dom_numero_int", models.CharField(blank=True, max_length=50, null=True)),
                ("dom_colonia", models.CharField(blank=True, max_length=100, null=True)),
                ("dom_cp", models.CharField(blank=True, max_length=10, null=True)),
                ("dom_municipio_alcaldia", models.CharField(blank=True, max_length=255, null=True)),
                ("dom_estado", models.CharField(blank=True, max_length=255, null=True)),
                (
                    "estado_civil",
                    models.CharField(
                        blank=True,
                        choices=[("SOLTERO", "Soltero"), ("CASADO", "Casado")],
                        max_length=20,
                        null=True,
                    ),
                ),
                ("fecha_nacimiento", models.DateField(blank=True, null=True)),
                ("nacimiento_mexico", models.BooleanField(blank=True, null=True)),
                ("municipio_nacimiento", models.CharField(blank=True, max_length=255, null=True)),
                ("estado_nacimiento", models.CharField(blank=True, max_length=255, null=True)),
                ("lugar_nacimiento_extran", models.TextField(blank=True, null=True)),
                ("nacionalidad", models.CharField(blank=True, max_length=255, null=True)),
                ("nombre_padre", models.CharField(blank=True, max_length=100, null=True)),
                ("nombre_madre", models.CharField(blank=True, max_length=100, null=True)),
                (
                    "genero",
                    models.CharField(
                        blank=True,
                        choices=[("MUJER", "Mujer"), ("HOMBRE", "Hombre")],
                        max_length=20,
                        null=True,
                    ),
                ),
                ("telefono", models.CharField(blank=True, max_length=10, null=True)),
                ("email", models.CharField(blank=True, max_length=100, null=True)),
                ("banco", models.CharField(blank=True, max_length=255, null=True)),
                ("cuenta_banco", models.CharField(blank=True, max_length=18, null=True)),
                ("tipo_cuenta", models.CharField(blank=True, max_length=255, null=True)),
                ("link_expediente", models.TextField(blank=True, null=True)),
                ("estado", models.CharField(blank=True, max_length=10, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.CharField(blank=True, max_length=100, null=True)),
                ("updated_by", models.CharField(blank=True, max_length=100, null=True)),
            ],
            options={"db_table": "rrhh_empleados"},
        ),
        migrations.CreateModel(
            name="RrhhPuesto",
            fields=[
                ("id_puesto", models.CharField(max_length=255, primary_key=True, serialize=False)),
                ("sociedad", models.CharField(blank=True, max_length=13, null=True)),
                ("proyecto", models.CharField(blank=True, max_length=3, null=True)),
                ("departamento", models.CharField(blank=True, max_length=255, null=True)),
                ("puesto", models.CharField(blank=True, max_length=100, null=True)),
                (
                    "factor_integracion",
                    models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
                ),
                (
                    "salario_diario",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                (
                    "descuentos_isr",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                (
                    "descuentos_imss",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                ("tipo_salario", models.CharField(blank=True, max_length=255, null=True)),
                ("turno", models.CharField(blank=True, max_length=255, null=True)),
                ("umf", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("fecha_alta", models.DateField(blank=True, null=True)),
                ("fecha_baja", models.DateField(blank=True, null=True)),
                ("motivo_fin", models.CharField(blank=True, max_length=255, null=True)),
                ("tipo_pago", models.CharField(blank=True, max_length=255, null=True)),
                ("link_alta_imss", models.CharField(blank=True, max_length=2083, null=True)),
                ("link_baja_imss", models.CharField(blank=True, max_length=2083, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.CharField(blank=True, max_length=100, null=True)),
                ("updated_by", models.CharField(blank=True, max_length=100, null=True)),
                (
                    "empleado",
                    models.ForeignKey(
                        blank=True,
                        db_column="id_empleado",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="puestos",
                        to="rrhh.rrhhempleado",
                    ),
                ),
                (
                    "supervisor",
                    models.ForeignKey(
                        blank=True,
                        db_column="id_supervisor",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="supervisados",
                        to="rrhh.rrhhempleado",
                    ),
                ),
            ],
            options={"db_table": "rrhh_puestos"},
        ),
    ]
