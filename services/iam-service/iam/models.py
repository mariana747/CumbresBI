import uuid

from django.db import models


def _short_id():
    return uuid.uuid4().hex[:8]


class ScopedAuditMixin(models.Model):
    """Campos transversales de RLS y auditoria de negocio.

    alcance_tipo/alcance_id: mismo mecanismo documentado en
    docs/architecture/README.md sec. 8 (ScopedManager / EffectiveScope).
    scope_type hoy solo cubre GLOBAL/SOCIEDAD/PROYECTO (gap de CENTRO/CONTRATO
    documentado en roles-y-permisos.md sec. 5 punto 5 - se maneja aparte via
    iam_user_centro_access / iam_user_contrato_access, no aqui).
    """

    ALCANCE_GLOBAL = "GLOBAL"
    ALCANCE_SOCIEDAD = "SOCIEDAD"
    ALCANCE_PROYECTO = "PROYECTO"
    ALCANCE_CHOICES = [
        (ALCANCE_GLOBAL, "Global"),
        (ALCANCE_SOCIEDAD, "Sociedad"),
        (ALCANCE_PROYECTO, "Proyecto"),
    ]

    alcance_tipo = models.CharField(
        max_length=20, choices=ALCANCE_CHOICES, default=ALCANCE_GLOBAL
    )
    alcance_id = models.CharField(max_length=255, default="*")
    created_by = models.ForeignKey(
        "IamUser",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="%(class)s_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class GeneralSociedad(models.Model):
    """Tabla de referencia real del ERD (20260727_Cumbres_ERD.sql)."""

    rfc = models.CharField(max_length=13, primary_key=True)
    razon_social = models.CharField(max_length=100, blank=True, null=True)
    regimen_mercantil = models.CharField(max_length=100, blank=True, null=True)
    alias_sociedad = models.CharField(max_length=3, blank=True, null=True)
    grupo = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text=(
            "Columna real del ERD. Nivel GRUPO como scope_type formal sigue "
            "sin decidir por el cliente (roles-y-permisos.md sec. 5, punto 1); "
            "general_grupos/iam_groups de abajo son la via explicita pedida "
            "para este arranque, no reemplazan esa decision pendiente."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "general_sociedades"

    def __str__(self):
        return f"{self.rfc} - {self.razon_social}"


class GeneralGrupo(ScopedAuditMixin):
    """Holding / agrupación empresarial por encima de SOCIEDAD.

    No existe en el ERD de origen ni en la arquitectura v2.0 aprobada
    (marcado explicitamente "sin decidir" en roles-y-permisos.md sec. 5).
    Se crea aqui a peticion explicita para este arranque de proyecto;
    reconciliar con el cliente antes de depender de ella en produccion.
    """

    grupo_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    nombre = models.CharField(max_length=150)
    descripcion = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = "general_grupos"

    def __str__(self):
        return self.nombre


class IamUser(models.Model):
    STATUS_ACTIVE = "ACTIVE"
    STATUS_SUSPENDED = "SUSPENDED"
    STATUS_DELETED = "DELETED"
    STATUS_CHOICES = [
        (STATUS_ACTIVE, "Active"),
        (STATUS_SUSPENDED, "Suspended"),
        (STATUS_DELETED, "Deleted"),
    ]

    ACCESS_STANDARD = "STANDARD"
    ACCESS_RESTRICTED = "RESTRICTED"
    ACCESS_MODE_CHOICES = [
        (ACCESS_STANDARD, "Standard"),
        (ACCESS_RESTRICTED, "Restricted"),
    ]

    user_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    primary_email = models.EmailField(max_length=254)
    display_name = models.CharField(max_length=150, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    access_mode = models.CharField(
        max_length=20, choices=ACCESS_MODE_CHOICES, default=ACCESS_STANDARD
    )
    # FK real es a rrhh_empleados.id_empleado (servicio rrhh-service, fuera de
    # este microservicio) - se guarda como referencia laxa, no ForeignKey real,
    # para no acoplar iam-service a la BD de otro servicio (regla de aislamiento
    # de esquema, sec. 11.2 #1 de docs/architecture/README.md).
    employee_id = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "iam_users"

    def __str__(self):
        return self.primary_email


class IamIdentity(models.Model):
    PROVIDER_GOOGLE = "google"
    PROVIDER_CHOICES = [(PROVIDER_GOOGLE, "Google")]

    identity_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    user = models.ForeignKey(IamUser, on_delete=models.CASCADE, related_name="identities")
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default=PROVIDER_GOOGLE)
    provider_subject = models.CharField(max_length=255)
    email = models.EmailField(max_length=254)
    email_verified = models.BooleanField(default=False)
    hosted_domain = models.CharField(max_length=255, blank=True, null=True)
    picture_url = models.CharField(max_length=2083, blank=True, null=True)
    last_login_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "iam_identities"


class IamRole(models.Model):
    role_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    role_key = models.CharField(max_length=50, unique=True)
    role_name = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        IamUser, on_delete=models.PROTECT, related_name="roles_created"
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        IamUser, on_delete=models.PROTECT, related_name="roles_updated"
    )

    class Meta:
        db_table = "iam_roles"

    def __str__(self):
        return self.role_key


class IamPermission(models.Model):
    permission_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    perm_key = models.CharField(max_length=120, unique=True)
    description = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        IamUser, on_delete=models.PROTECT, related_name="permissions_created"
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        IamUser, on_delete=models.PROTECT, related_name="permissions_updated"
    )

    class Meta:
        db_table = "iam_permissions"

    def __str__(self):
        return self.perm_key


class IamRolePermission(models.Model):
    role = models.ForeignKey(IamRole, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        IamPermission, on_delete=models.CASCADE, related_name="role_permissions"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        IamUser, on_delete=models.PROTECT, related_name="role_permissions_created"
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        IamUser, on_delete=models.PROTECT, related_name="role_permissions_updated"
    )

    class Meta:
        db_table = "iam_role_permissions"
        unique_together = ("role", "permission")


class IamUserRole(models.Model):
    """Vigencia via granted_at/revoked_at, tal como en el ERD real."""

    SCOPE_GLOBAL = "GLOBAL"
    SCOPE_SOCIEDAD = "SOCIEDAD"
    SCOPE_PROYECTO = "PROYECTO"
    SCOPE_TYPE_CHOICES = [
        (SCOPE_GLOBAL, "Global"),
        (SCOPE_SOCIEDAD, "Sociedad"),
        (SCOPE_PROYECTO, "Proyecto"),
    ]

    assignment_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    user = models.ForeignKey(IamUser, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(IamRole, on_delete=models.CASCADE, related_name="user_roles")
    scope_type = models.CharField(max_length=20, choices=SCOPE_TYPE_CHOICES, default=SCOPE_GLOBAL)
    scope_id = models.CharField(max_length=255, default="*")
    granted_by = models.ForeignKey(
        IamUser, null=True, blank=True, on_delete=models.SET_NULL, related_name="roles_granted"
    )
    granted_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "iam_user_roles"


class IamGroup(ScopedAuditMixin):
    """Equipos internos (no confundir con GeneralGrupo/holding).

    Igual que GeneralGrupo, tabla nueva pedida explicitamente para este
    arranque; no aparece en el ERD ni en la arquitectura v2.0 aprobada.
    """

    group_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    grupo = models.ForeignKey(
        GeneralGrupo,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="equipos",
        help_text="Holding empresarial al que pertenece este equipo, si aplica.",
    )
    nombre = models.CharField(max_length=150)
    alias = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Nombre corto para mostrar en pantalla (ej. 'CUMBRES' para 'CONSULTORÍA Y PROYECTOS CUMBRES').",
    )
    descripcion = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = "iam_groups"

    def __str__(self):
        return self.nombre


class IamUserGroup(ScopedAuditMixin):
    user = models.ForeignKey(IamUser, on_delete=models.CASCADE, related_name="user_groups")
    group = models.ForeignKey(IamGroup, on_delete=models.CASCADE, related_name="user_groups")
    removed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "iam_user_groups"
        unique_together = ("user", "group")
