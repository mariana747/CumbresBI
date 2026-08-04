import django.db.models.deletion
from django.db import migrations, models

import iam.models


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0004_seed_permisos_matriz"),
    ]

    operations = [
        migrations.CreateModel(
            name="IamMagicLink",
            fields=[
                (
                    "magic_link_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("email", models.EmailField(max_length=254)),
                ("recurso_tipo", models.CharField(blank=True, max_length=50, null=True)),
                ("recurso_id", models.CharField(blank=True, max_length=255, null=True)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("issued_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("max_uses", models.IntegerField(default=1)),
                ("uses_count", models.IntegerField(default=0)),
                ("first_used_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "issued_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="magic_links_issued",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "iam_magic_links"},
        ),
    ]
