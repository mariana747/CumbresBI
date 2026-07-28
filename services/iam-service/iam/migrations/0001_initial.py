import django.db.models.deletion
from django.db import migrations, models

import iam.models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="IamUser",
            fields=[
                (
                    "user_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("primary_email", models.EmailField(max_length=254)),
                ("display_name", models.CharField(blank=True, max_length=150, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("ACTIVE", "Active"), ("SUSPENDED", "Suspended"), ("DELETED", "Deleted")],
                        default="ACTIVE",
                        max_length=20,
                    ),
                ),
                (
                    "access_mode",
                    models.CharField(
                        choices=[("STANDARD", "Standard"), ("RESTRICTED", "Restricted")],
                        default="STANDARD",
                        max_length=20,
                    ),
                ),
                ("employee_id", models.CharField(blank=True, max_length=255, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "iam_users"},
        ),
        migrations.CreateModel(
            name="GeneralSociedad",
            fields=[
                ("rfc", models.CharField(max_length=13, primary_key=True, serialize=False)),
                ("razon_social", models.CharField(blank=True, max_length=100, null=True)),
                ("regimen_mercantil", models.CharField(blank=True, max_length=100, null=True)),
                ("alias_sociedad", models.CharField(blank=True, max_length=3, null=True)),
                ("grupo", models.CharField(blank=True, max_length=50, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.CharField(blank=True, max_length=100, null=True)),
                ("updated_by", models.CharField(blank=True, max_length=100, null=True)),
            ],
            options={"db_table": "general_sociedades"},
        ),
        migrations.CreateModel(
            name="GeneralGrupo",
            fields=[
                (
                    "alcance_tipo",
                    models.CharField(
                        choices=[("GLOBAL", "Global"), ("SOCIEDAD", "Sociedad"), ("PROYECTO", "Proyecto")],
                        default="GLOBAL",
                        max_length=20,
                    ),
                ),
                ("alcance_id", models.CharField(default="*", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "grupo_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("nombre", models.CharField(max_length=150)),
                ("descripcion", models.CharField(blank=True, max_length=255, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="generalgrupo_created",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "general_grupos"},
        ),
        migrations.CreateModel(
            name="IamIdentity",
            fields=[
                (
                    "identity_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("provider", models.CharField(choices=[("google", "Google")], default="google", max_length=20)),
                ("provider_subject", models.CharField(max_length=255)),
                ("email", models.EmailField(max_length=254)),
                ("email_verified", models.BooleanField(default=False)),
                ("hosted_domain", models.CharField(blank=True, max_length=255, null=True)),
                ("picture_url", models.CharField(blank=True, max_length=2083, null=True)),
                ("last_login_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="identities",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "iam_identities"},
        ),
        migrations.CreateModel(
            name="IamRole",
            fields=[
                (
                    "role_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("role_key", models.CharField(max_length=50, unique=True)),
                ("role_name", models.CharField(max_length=100)),
                ("description", models.CharField(blank=True, max_length=255, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="roles_created",
                        to="iam.iamuser",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="roles_updated",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "iam_roles"},
        ),
        migrations.CreateModel(
            name="IamPermission",
            fields=[
                (
                    "permission_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("perm_key", models.CharField(max_length=120, unique=True)),
                ("description", models.CharField(blank=True, max_length=255, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="permissions_created",
                        to="iam.iamuser",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="permissions_updated",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "iam_permissions"},
        ),
        migrations.CreateModel(
            name="IamRolePermission",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "permission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="role_permissions",
                        to="iam.iampermission",
                    ),
                ),
                (
                    "role",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="role_permissions",
                        to="iam.iamrole",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="role_permissions_created",
                        to="iam.iamuser",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="role_permissions_updated",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "iam_role_permissions", "unique_together": {("role", "permission")}},
        ),
        migrations.CreateModel(
            name="IamUserRole",
            fields=[
                (
                    "assignment_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "scope_type",
                    models.CharField(
                        choices=[("GLOBAL", "Global"), ("SOCIEDAD", "Sociedad"), ("PROYECTO", "Proyecto")],
                        default="GLOBAL",
                        max_length=20,
                    ),
                ),
                ("scope_id", models.CharField(default="*", max_length=255)),
                ("granted_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "granted_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="roles_granted",
                        to="iam.iamuser",
                    ),
                ),
                (
                    "role",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_roles",
                        to="iam.iamrole",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_roles",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "iam_user_roles"},
        ),
        migrations.CreateModel(
            name="IamGroup",
            fields=[
                (
                    "alcance_tipo",
                    models.CharField(
                        choices=[("GLOBAL", "Global"), ("SOCIEDAD", "Sociedad"), ("PROYECTO", "Proyecto")],
                        default="GLOBAL",
                        max_length=20,
                    ),
                ),
                ("alcance_id", models.CharField(default="*", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "group_id",
                    models.CharField(
                        default=iam.models._short_id,
                        editable=False,
                        max_length=8,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("nombre", models.CharField(max_length=150)),
                ("descripcion", models.CharField(blank=True, max_length=255, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="iamgroup_created",
                        to="iam.iamuser",
                    ),
                ),
                (
                    "grupo",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="equipos",
                        to="iam.generalgrupo",
                    ),
                ),
            ],
            options={"db_table": "iam_groups"},
        ),
        migrations.CreateModel(
            name="IamUserGroup",
            fields=[
                (
                    "alcance_tipo",
                    models.CharField(
                        choices=[("GLOBAL", "Global"), ("SOCIEDAD", "Sociedad"), ("PROYECTO", "Proyecto")],
                        default="GLOBAL",
                        max_length=20,
                    ),
                ),
                ("alcance_id", models.CharField(default="*", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("removed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="iamusergroup_created",
                        to="iam.iamuser",
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_groups",
                        to="iam.iamgroup",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_groups",
                        to="iam.iamuser",
                    ),
                ),
            ],
            options={"db_table": "iam_user_groups", "unique_together": {("user", "group")}},
        ),
    ]
