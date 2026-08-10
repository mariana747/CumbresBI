from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pld", "0001_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="pldticketcliente",
            old_name="token",
            new_name="token_hash",
        ),
        migrations.AlterField(
            model_name="pldticketcliente",
            name="token_hash",
            field=models.CharField(max_length=64, unique=True),
        ),
        migrations.AddField(
            model_name="pldticketcliente",
            name="email",
            field=models.EmailField(default="", max_length=254),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="pldticketcliente",
            name="issued_at",
            field=models.DateTimeField(auto_now_add=True),
        ),
    ]
