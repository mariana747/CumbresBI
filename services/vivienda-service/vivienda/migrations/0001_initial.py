import django.db.models.deletion
from django.db import migrations, models

import vivienda.models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ViviendaProyecto",
            fields=[
                (
                    "id_proyecto",
                    models.CharField(
                        default=vivienda.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("alias_proyecto", models.CharField(blank=True, max_length=5, null=True)),
                ("denominacion", models.CharField(blank=True, max_length=250, null=True)),
                ("propietario", models.CharField(blank=True, max_length=13, null=True)),
                ("dom_calle", models.CharField(max_length=150)),
                ("dom_numero_ext", models.CharField(max_length=50)),
                ("dom_numero_int", models.CharField(max_length=50)),
                ("dom_colonia", models.CharField(max_length=100)),
                ("dom_municipio_alcaldia", models.CharField(max_length=255)),
                ("dom_estado", models.CharField(max_length=255)),
                ("dom_cp", models.CharField(max_length=10)),
                ("dom_pais", models.CharField(max_length=100)),
                ("link_carpeta", models.CharField(blank=True, max_length=2083, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
            ],
            options={"db_table": "vivienda_proyectos"},
        ),
        migrations.CreateModel(
            name="ViviendaVentasAsesor",
            fields=[
                (
                    "id_asesor",
                    models.CharField(
                        default=vivienda.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("nombre", models.CharField(max_length=100)),
                ("telefono_sms", models.CharField(blank=True, max_length=10, null=True)),
                ("email", models.CharField(max_length=100)),
                ("contacto", models.CharField(blank=True, max_length=100, null=True)),
                ("persona_moral", models.BooleanField()),
                ("razon_social", models.CharField(blank=True, max_length=100, null=True)),
                ("porc_comision", models.DecimalField(decimal_places=2, max_digits=2)),
                ("rfc_afiliacion", models.CharField(blank=True, max_length=13, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
            ],
            options={"db_table": "vivienda_ventas_asesores"},
        ),
        migrations.CreateModel(
            name="ViviendaListado",
            fields=[
                (
                    "id_vivienda",
                    models.CharField(
                        default=vivienda.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("num_oficial", models.CharField(blank=True, max_length=25, null=True)),
                ("etapa", models.CharField(blank=True, max_length=25, null=True)),
                ("balcones_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("bodega_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("habitaciones", models.IntegerField(blank=True, null=True)),
                ("cajones_est", models.DecimalField(blank=True, decimal_places=0, max_digits=14, null=True)),
                ("calle", models.TextField(blank=True, null=True)),
                ("cuv", models.CharField(blank=True, max_length=255, null=True)),
                ("denominacion", models.CharField(blank=True, max_length=255, null=True)),
                ("disponible", models.BooleanField(blank=True, null=True)),
                ("fachada", models.CharField(blank=True, max_length=255, null=True)),
                ("fondo_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("frente_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("lote", models.CharField(blank=True, max_length=255, null=True)),
                ("modelo", models.CharField(blank=True, max_length=255, null=True)),
                ("muestra", models.BooleanField(blank=True, null=True)),
                ("mz", models.CharField(blank=True, max_length=255, null=True)),
                ("patio_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("piso", models.CharField(blank=True, max_length=255, null=True)),
                (
                    "precio_lista",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                (
                    "sup_const_m2",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                (
                    "sup_terreno_m2",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                ("terraza_m2", models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ("tipo", models.CharField(blank=True, max_length=255, null=True)),
                ("torre", models.CharField(blank=True, max_length=255, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
                (
                    "proyecto",
                    models.ForeignKey(
                        db_column="id_proyecto",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="viviendas",
                        to="vivienda.viviendaproyecto",
                    ),
                ),
            ],
            options={"db_table": "vivienda_listado"},
        ),
        migrations.CreateModel(
            name="ViviendaVentasExpediente",
            fields=[
                (
                    "id_expediente",
                    models.CharField(
                        default=vivienda.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("id_contrato", models.CharField(max_length=255)),
                (
                    "estado",
                    models.CharField(
                        choices=[
                            ("PENDIENTE", "Pendiente"),
                            ("EN PROCESO", "En proceso"),
                            ("CONCLUIDO", "Concluido"),
                            ("CANCELADO", "Cancelado"),
                        ],
                        default="PENDIENTE",
                        max_length=20,
                    ),
                ),
                ("fecha_cierre", models.DateField(blank=True, null=True)),
                ("link_expediente", models.CharField(blank=True, max_length=2083, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
                (
                    "vivienda",
                    models.ForeignKey(
                        db_column="id_vivienda",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="expedientes",
                        to="vivienda.viviendalistado",
                    ),
                ),
                (
                    "asesor",
                    models.ForeignKey(
                        db_column="id_asesor",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="expedientes",
                        to="vivienda.viviendaventasasesor",
                    ),
                ),
            ],
            options={"db_table": "vivienda_ventas_expedientes"},
        ),
        migrations.CreateModel(
            name="ViviendaRelExpedienteCliente",
            fields=[
                (
                    "id_rel_viv_exp_cliente",
                    models.CharField(
                        default=vivienda.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("id_contraparte", models.CharField(max_length=8)),
                (
                    "tipo",
                    models.CharField(
                        choices=[("ACREDITADO", "Acreditado"), ("COACREDITADO", "Coacreditado")],
                        default="ACREDITADO",
                        max_length=20,
                    ),
                ),
                ("emp_razon_social", models.CharField(blank=True, max_length=100, null=True)),
                ("emp_contacto_empleador", models.CharField(blank=True, max_length=100, null=True)),
                ("emp_telefono_empleador", models.CharField(blank=True, max_length=10, null=True)),
                ("emp_email_empleador", models.CharField(blank=True, max_length=100, null=True)),
                (
                    "emp_antiguedad_anos",
                    models.DecimalField(blank=True, decimal_places=0, max_digits=2, null=True),
                ),
                (
                    "emp_antiguedad_meses",
                    models.DecimalField(blank=True, decimal_places=0, max_digits=2, null=True),
                ),
                ("emp_dom_calle", models.CharField(blank=True, max_length=150, null=True)),
                ("emp_dom_colonia", models.CharField(blank=True, max_length=100, null=True)),
                ("emp_dom_cp", models.CharField(blank=True, max_length=10, null=True)),
                ("emp_dom_estado", models.CharField(blank=True, max_length=255, null=True)),
                ("emp_dom_municipio_alcaldia", models.CharField(blank=True, max_length=255, null=True)),
                ("emp_dom_numero_ext", models.CharField(blank=True, max_length=50, null=True)),
                ("emp_dom_numero_int", models.CharField(blank=True, max_length=50, null=True)),
                ("emp_puesto", models.CharField(blank=True, max_length=100, null=True)),
                ("nss", models.CharField(blank=True, max_length=11, null=True)),
                ("dependientes_econ", models.IntegerField(blank=True, null=True)),
                (
                    "ingreso_men_honorarios",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                (
                    "ingreso_men_nomina",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                (
                    "ingreso_men_otros",
                    models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
                ),
                ("nombre_referencia", models.CharField(blank=True, max_length=100, null=True)),
                ("email_referencia", models.CharField(blank=True, max_length=100, null=True)),
                ("telefono_referencia", models.CharField(blank=True, max_length=10, null=True)),
                ("tipo_credito_prin", models.CharField(blank=True, max_length=255, null=True)),
                ("tipo_credito_sec", models.CharField(blank=True, max_length=255, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
                (
                    "expediente",
                    models.ForeignKey(
                        db_column="id_expediente",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="clientes",
                        to="vivienda.viviendaventasexpediente",
                    ),
                ),
            ],
            options={"db_table": "vivienda_rel_expediente_clientes"},
        ),
        migrations.CreateModel(
            name="ViviendaVentasExpedienteItem",
            fields=[
                (
                    "id_item",
                    models.CharField(
                        default=vivienda.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("denominacion", models.CharField(blank=True, max_length=250, null=True)),
                ("detalles_adicionales", models.CharField(blank=True, max_length=500, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDIENTE", "Pendiente"),
                            ("INCOMPLETO", "Incompleto"),
                            ("ENTREGADO", "Entregado"),
                            ("APROBADO", "Aprobado"),
                        ],
                        default="PENDIENTE",
                        max_length=20,
                    ),
                ),
                ("link_documento", models.CharField(blank=True, max_length=2083, null=True)),
                ("fecha_solicitud", models.DateField(blank=True, null=True)),
                ("fecha_limite", models.DateField()),
                ("fecha_entrega", models.DateField(blank=True, null=True)),
                ("fecha_cierre", models.DateField(blank=True, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
                (
                    "expediente",
                    models.ForeignKey(
                        db_column="id_expediente",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="vivienda.viviendaventasexpediente",
                    ),
                ),
            ],
            options={"db_table": "vivienda_ventas_expedientes_items"},
        ),
    ]
