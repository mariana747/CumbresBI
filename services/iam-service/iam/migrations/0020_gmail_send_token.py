from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("iam", "0019_borra_sociedades_placeholder")]

    operations = [
        migrations.CreateModel(
            name="IamGmailSendToken",
            fields=[
                ("user", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    primary_key=True,
                    related_name="gmail_send_token",
                    serialize=False,
                    to=settings.AUTH_USER_MODEL,
                )),
                ("gmail_email", models.EmailField(blank=True, max_length=254, null=True)),
                ("refresh_token", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "iam_gmail_send_tokens"},
        ),
    ]
