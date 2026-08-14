import uuid

from django.db import models

from cumbresbi_scope.managers import ScopedManager


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

    # Sin SCOPE_FIELD_* declarado todavia (gap documentado en
    # roles-y-permisos.md, pendiente del punto 2 del plan de Fase 1: agregar
    # columna real de sociedad/proyecto). Mientras tanto, ScopedManager
    # actua como gate GLOBAL/no-GLOBAL: solo GLOBAL ve el directorio.
    objects = ScopedManager()

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

    # scope_type/scope_id ya existen pero son genericos (un solo campo que
    # cambia de significado segun scope_type) - no calzan directo con la
    # convencion SCOPE_FIELD_* de ScopedManager (que espera un campo fijo
    # por dimension, ej. sociedad_rfc). Mismo gate GLOBAL/no-GLOBAL que
    # IamUser mientras tanto; mapear scope_type/scope_id a columnas reales
    # queda para el punto 2 del plan de Fase 1.
    objects = ScopedManager()

    class Meta:
        db_table = "iam_user_roles"


class IamGroup(ScopedAuditMixin):
    """Equipos internos / "empresa" del usuario en el directorio.

    No confundir con el nivel de alcance GRUPO (descartado, ver
    docs/architecture/roles-y-permisos.md) - esto es solo un catalogo de
    equipos/empresa para filtrar el directorio de usuarios, sin relacion
    con RLS. Tabla nueva pedida explicitamente para este arranque; no
    aparece en el ERD ni en la arquitectura v2.0 aprobada.
    """

    group_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
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


class IamMagicLink(models.Model):
    """Magic Link de un solo uso para usuarios externos (Fase 1, Semana 4;
    docs/architecture/README.md sec. 6.2). Mismo patron que
    pld_ticket_cliente (pld-service), pero generico a nivel iam-service para
    cualquier modulo que necesite dar acceso externo sin contrasena.

    token_hash: SHA-256 del token - el token en claro nunca se guarda, solo
    viaja una vez en el link enviado (o, en modo dev sin envio de correo
    real, en la respuesta del endpoint de generacion - ver views.py).

    recurso_tipo/recurso_id: referencia laxa y generica a que da acceso este
    link (ej. recurso_tipo="pld_kyc", recurso_id=<id_kyc>) - el modulo
    consumidor interpreta estos campos, iam-service no los valida.
    """

    magic_link_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    email = models.EmailField(max_length=254)
    recurso_tipo = models.CharField(max_length=50, blank=True, null=True)
    recurso_id = models.CharField(max_length=255, blank=True, null=True)
    token_hash = models.CharField(max_length=64, unique=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.ForeignKey(
        IamUser, null=True, blank=True, on_delete=models.SET_NULL, related_name="magic_links_issued"
    )
    expires_at = models.DateTimeField()
    max_uses = models.IntegerField(default=1)
    uses_count = models.IntegerField(default=0)
    first_used_at = models.DateTimeField(blank=True, null=True)
    last_used_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "iam_magic_links"

    def __str__(self):
        return f"{self.magic_link_id} ({self.email})"


class IamInvitation(models.Model):
    """Invitación formal para dar de alta a un empleado nuevo (decisión
    híbrida 10/Ago/2026, ver memoria de sesión
    "iam-invitacion-alcance-incierto"): un usuario ya registrado (ya tiene
    `IamUser`) entra con login libre de siempre; uno nuevo de la
    organización necesita que un IAM Admin lo invite primero -
    `_upsert_identity` (`auth_views.py`) rechaza el login OIDC si el
    correo no tiene ya un `IamUser` NI una invitación pendiente.

    Sin token propio a propósito: a diferencia de `IamMagicLink` (acceso
    puntual sin cuenta de Workspace), aquí el usuario sí tiene/tendrá
    cuenta real de Workspace - el "canje" es simplemente iniciar sesión
    con Google; el dominio aprobado + esta fila pendiente son la
    validación completa, no hace falta un link con token."""

    invitation_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    email = models.EmailField(max_length=254)
    invited_by = models.ForeignKey(
        IamUser, null=True, blank=True, on_delete=models.SET_NULL, related_name="invitations_sent"
    )
    invited_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "iam_invitations"

    def __str__(self):
        return self.email


class IamExternalCollaborator(models.Model):
    """3er tipo de acceso externo (14/Ago/2026, ver memoria de sesion
    "tercer-tipo-invitacion-externo-sin-workspace"): colaborador que NO
    tiene correo de Workspace pero necesita entrar a secciones reales de
    la app como un colaborador normal - a diferencia de:
    - `IamMagicLink`: un solo uso/accion puntual, vence en minutos.
    - `IamInvitation`: para gente que SI tiene/tendra correo de Workspace,
      se canjea iniciando sesion con Google (sin token propio).

    Aqui el link NO vence por tiempo - solo se revoca a mano
    (`revoked_at`) cuando el colaborador ya no debe tener acceso. Por eso
    si tiene `user` (a diferencia de IamMagicLink): se crea un `IamUser`
    real desde el momento de la invitacion, para que un IAM Admin le
    asigne roles/permisos de una vez via `iam_user_roles` (mismo sistema
    de siempre, sin permisos paralelos) - el token solo reemplaza el paso
    de "iniciar sesion con Google" (ver auth_views.canjear_acceso_externo,
    que emite la MISMA cookie de sesion que /auth/google/callback via
    issue_session_jwt, no el JWT de alcance limitado de los magic links).
    """

    external_access_id = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    user = models.OneToOneField(IamUser, on_delete=models.CASCADE, related_name="external_access")
    email = models.EmailField(max_length=254)
    token_hash = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(
        IamUser, null=True, blank=True, on_delete=models.SET_NULL, related_name="external_access_issued"
    )
    invited_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "iam_external_collaborators"

    def __str__(self):
        return f"{self.external_access_id} ({self.email})"


class IamUserCentroAccess(models.Model):
    """Grant plano de alcance CENTRO (columna real del ERD, schema.csv) -
    a diferencia de SOCIEDAD/PROYECTO, CENTRO no vive en
    iam_user_roles.scope_type (ese enum solo tiene GLOBAL/SOCIEDAD/
    PROYECTO en la BD real) sino en esta tabla aparte, usuario por
    usuario, centro por centro. Ver roles-y-permisos.md sec. 1 ("CENTRO/
    CONTRATO como grants planos") y scope_utils.compute_effective_scope_claims.
    """

    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(IamUser, on_delete=models.CASCADE, related_name="centro_access", db_column="user_id")
    centro_id = models.CharField(max_length=255)
    granted_by = models.ForeignKey(
        IamUser, null=True, blank=True, on_delete=models.SET_NULL, related_name="centro_access_granted"
    )
    granted_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "iam_user_centro_access"


class IamUserContratoAccess(models.Model):
    """Grant plano de alcance CONTRATO - mismo criterio que
    IamUserCentroAccess arriba, pero sobre un contrato individual
    (id_contrato, columna real del ERD) en vez de un centro."""

    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(IamUser, on_delete=models.CASCADE, related_name="contrato_access", db_column="user_id")
    id_contrato = models.CharField(max_length=255)
    granted_by = models.ForeignKey(
        IamUser, null=True, blank=True, on_delete=models.SET_NULL, related_name="contrato_access_granted"
    )
    granted_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "iam_user_contrato_access"
