from django.apps import AppConfig


class PldConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "pld"

    def ready(self):
        from . import signals  # noqa: F401 - registra los receivers post_save/post_delete
