import django.db.models.deletion
from django.db import migrations, models

import pld.models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="PldContraparteKyc",
            fields=[
                (
                    "id_kyc",
                    models.CharField(
                        default=pld.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("id_contraparte", models.CharField(max_length=8)),
                ("fecha_nac_const", models.DateField()),
                ("pais_nac_const", models.CharField(max_length=100)),
                ("folio_mercantil", models.CharField(blank=True, max_length=250, null=True)),
                ("objeto_social", models.CharField(blank=True, max_length=250, null=True)),
                ("curp", models.CharField(blank=True, max_length=18, null=True)),
                ("nacionalidad", models.CharField(max_length=100)),
                ("ocupacion_act_economica", models.CharField(max_length=100)),
                ("dom_calle", models.CharField(max_length=150)),
                ("dom_numero_ext", models.CharField(max_length=50)),
                ("dom_numero_int", models.CharField(max_length=50)),
                ("dom_colonia", models.CharField(max_length=100)),
                ("dom_municipio_alcaldia", models.CharField(max_length=255)),
                ("dom_estado", models.CharField(max_length=255)),
                ("dom_cp", models.CharField(max_length=10)),
                ("dom_pais", models.CharField(max_length=100)),
                ("tipo_identificacion", models.CharField(blank=True, max_length=100, null=True)),
                ("autoridad_identificacion", models.CharField(blank=True, max_length=250, null=True)),
                ("numero_identificacion", models.CharField(blank=True, max_length=250, null=True)),
                ("dom_corresp_dom_calle", models.CharField(blank=True, max_length=150, null=True)),
                ("dom_corresp_dom_numero_ext", models.CharField(blank=True, max_length=50, null=True)),
                ("dom_corresp_dom_numero_int", models.CharField(blank=True, max_length=50, null=True)),
                ("dom_corresp_dom_colonia", models.CharField(blank=True, max_length=100, null=True)),
                (
                    "dom_corresp_dom_municipio_alcaldia",
                    models.CharField(blank=True, max_length=255, null=True),
                ),
                ("dom_corresp_dom_estado", models.CharField(blank=True, max_length=255, null=True)),
                ("dom_corresp_dom_cp", models.CharField(blank=True, max_length=10, null=True)),
                ("dom_corresp_dom_pais", models.CharField(blank=True, max_length=100, null=True)),
                ("telefono_fijo", models.CharField(max_length=10)),
                ("telefono_sms", models.CharField(max_length=10)),
                (
                    "estado_civil",
                    models.CharField(
                        choices=[("SOLTERO", "Soltero"), ("CASADO", "Casado")], max_length=20
                    ),
                ),
                ("ident_fideicomiso", models.CharField(max_length=100)),
                ("link_carpeta", models.CharField(blank=True, max_length=2083, null=True)),
                ("link_plantillas", models.CharField(blank=True, max_length=2083, null=True)),
                ("link_documento_pld", models.CharField(blank=True, max_length=2083, null=True)),
                (
                    "estado_llenado",
                    models.CharField(
                        choices=[
                            ("PENDIENTE", "Pendiente"),
                            ("INCOMPLETO", "Incompleto"),
                            ("ENTREGADO", "Entregado"),
                        ],
                        default="PENDIENTE",
                        max_length=20,
                    ),
                ),
                ("aprobado_por", models.CharField(max_length=8)),
                ("aprobado_en", models.DateTimeField(blank=True, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
                ("fecha_vencimiento", models.DateField()),
            ],
            options={"db_table": "pld_contrapartes_kyc"},
        ),
        migrations.CreateModel(
            name="PldContraparteDoc",
            fields=[
                (
                    "id_kyc_doc",
                    models.CharField(
                        default=pld.models._short_id,
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
                        blank=True,
                        choices=[
                            ("PENDIENTE", "Pendiente"),
                            ("INCOMPLETO", "Incompleto"),
                            ("ENTREGADO", "Entregado"),
                            ("APROBADO", "Aprobado"),
                        ],
                        max_length=20,
                        null=True,
                    ),
                ),
                ("link_documento", models.CharField(blank=True, max_length=2083, null=True)),
                ("fecha_solicitud", models.DateField(blank=True, null=True)),
                ("fecha_limite", models.DateField(blank=True, null=True)),
                ("fecha_entrega", models.DateField(blank=True, null=True)),
                ("fecha_cierre", models.DateField(blank=True, null=True)),
                ("comentarios", models.CharField(blank=True, max_length=500, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(max_length=8)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(max_length=8)),
                (
                    "kyc",
                    models.ForeignKey(
                        db_column="id_kyc",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="documentos",
                        to="pld.pldcontrapartekyc",
                    ),
                ),
            ],
            options={"db_table": "pld_contrapartes_docs"},
        ),
        migrations.CreateModel(
            name="PldTicketCliente",
            fields=[
                (
                    "id_pld_ticket",
                    models.CharField(
                        default=pld.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("token", models.CharField(max_length=64)),
                ("issued_at", models.DateTimeField()),
                ("issued_by", models.CharField(max_length=8)),
                ("expires_at", models.DateTimeField()),
                ("max_uses", models.IntegerField()),
                ("uses_count", models.IntegerField(default=0)),
                ("first_used_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "kyc",
                    models.ForeignKey(
                        blank=True,
                        db_column="id_kyc",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tickets",
                        to="pld.pldcontrapartekyc",
                    ),
                ),
            ],
            options={"db_table": "pld_ticket_cliente"},
        ),
    ]
