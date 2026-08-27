import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0012_flujo_drive_file_id_comprobante"),
    ]

    operations = [
        migrations.CreateModel(
            name="TesoreriaTicketReembolso",
            fields=[
                ("id_ticket", models.CharField(max_length=255, primary_key=True, serialize=False)),
                ("id_empleado", models.CharField(max_length=255)),
                ("descripcion", models.TextField()),
                ("monto", models.DecimalField(decimal_places=2, max_digits=14)),
                ("fecha_gasto", models.DateField()),
                (
                    "estado",
                    models.CharField(
                        choices=[
                            ("PENDIENTE", "Pendiente"),
                            ("EN_REVISION", "En revisión"),
                            ("VINCULADO", "Vinculado a factura/pago"),
                            ("RECHAZADO", "Rechazado"),
                        ],
                        default="PENDIENTE",
                        max_length=20,
                    ),
                ),
                ("link_ticket", models.TextField(blank=True, null=True)),
                ("drive_file_id_ticket", models.TextField(blank=True, null=True)),
                ("link_factura_pdf", models.TextField(blank=True, null=True)),
                ("drive_file_id_factura", models.TextField(blank=True, null=True)),
                ("comentarios", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("created_by", models.CharField(blank=True, max_length=255, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("updated_by", models.CharField(blank=True, max_length=255, null=True)),
                (
                    "flujo",
                    models.ForeignKey(
                        blank=True,
                        db_column="id_flujo",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="tickets_reembolso",
                        to="tesoreria.tesoreriaflujo",
                    ),
                ),
            ],
            options={
                "db_table": "tesoreria_tickets_reembolso",
                "ordering": ["-created_at"],
            },
        ),
    ]
