from django.db import models

from cumbresbi_scope import ScopedManager


class DummyScoped(models.Model):
    """Modelo con las cuatro dimensiones jerarquicas declaradas."""

    SCOPE_FIELD_SOCIEDAD = "sociedad_rfc"
    SCOPE_FIELD_PROYECTO = "proyecto_id"
    SCOPE_FIELD_CENTRO = "centro_id"
    SCOPE_FIELD_CONTRATO = "contrato_id"

    sociedad_rfc = models.CharField(max_length=20, null=True, blank=True)
    proyecto_id = models.CharField(max_length=20, null=True, blank=True)
    centro_id = models.CharField(max_length=20, null=True, blank=True)
    contrato_id = models.CharField(max_length=20, null=True, blank=True)

    objects = ScopedManager()

    class Meta:
        app_label = "testapp"


class DummyIdentityScoped(models.Model):
    """Modelo con alcance por IDENTIDAD (self-service), ej. EMPLEADO_SELF."""

    SCOPE_FIELD_IDENTITY = "owner_user_id"

    owner_user_id = models.CharField(max_length=50, null=True, blank=True)

    objects = ScopedManager()

    class Meta:
        app_label = "testapp"


class DummyUnscoped(models.Model):
    """Modelo que no declara ningun SCOPE_FIELD_* - debe fail-closed siempre."""

    nombre = models.CharField(max_length=20)

    objects = ScopedManager()

    class Meta:
        app_label = "testapp"
