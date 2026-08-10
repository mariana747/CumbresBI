import uuid

from django.db import models

from cumbresbi_scope.managers import ScopedManager


def _short_id():
    return uuid.uuid4().hex[:8]


class PldContraparteKyc(models.Model):
    """KYC de una contraparte. id_contraparte referencia a
    tesoreria_contrapartes.id_contraparte, dueno real: contrapartes-service /
    tesoreria-service (fuera de este microservicio) - se guarda como
    referencia laxa, no ForeignKey real, para no acoplar esquemas
    (docs/architecture/README.md sec. 11.2 #1).
    """

    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_INCOMPLETO = "INCOMPLETO"
    ESTADO_ENTREGADO = "ENTREGADO"
    ESTADO_LLENADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_INCOMPLETO, "Incompleto"),
        (ESTADO_ENTREGADO, "Entregado"),
    ]

    CIVIL_SOLTERO = "SOLTERO"
    CIVIL_CASADO = "CASADO"
    ESTADO_CIVIL_CHOICES = [
        (CIVIL_SOLTERO, "Soltero"),
        (CIVIL_CASADO, "Casado"),
    ]

    id_kyc = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    id_contraparte = models.CharField(max_length=8)
    # FK real a general_sociedades.rfc (iam-service) - referencia laxa, ver
    # nota de clase arriba. Columna real de alcance (punto 2 del plan de
    # Fase 1, RLS real) - que sociedad de Cumbres es la duena de este
    # expediente KYC, para filtrar por SCOPE_FIELD_SOCIEDAD. blank/null
    # porque los expedientes creados antes de esta columna no tienen valor
    # todavia (backfill pendiente).
    sociedad_rfc = models.CharField(max_length=13, blank=True, null=True)
    fecha_nac_const = models.DateField()
    pais_nac_const = models.CharField(max_length=100)
    folio_mercantil = models.CharField(max_length=250, blank=True, null=True)
    objeto_social = models.CharField(max_length=250, blank=True, null=True)
    curp = models.CharField(max_length=18, blank=True, null=True)
    nacionalidad = models.CharField(max_length=100)
    ocupacion_act_economica = models.CharField(max_length=100)
    dom_calle = models.CharField(max_length=150)
    dom_numero_ext = models.CharField(max_length=50)
    dom_numero_int = models.CharField(max_length=50)
    dom_colonia = models.CharField(max_length=100)
    dom_municipio_alcaldia = models.CharField(max_length=255)
    dom_estado = models.CharField(max_length=255)
    dom_cp = models.CharField(max_length=10)
    dom_pais = models.CharField(max_length=100)
    tipo_identificacion = models.CharField(max_length=100, blank=True, null=True)
    autoridad_identificacion = models.CharField(max_length=250, blank=True, null=True)
    numero_identificacion = models.CharField(max_length=250, blank=True, null=True)
    dom_corresp_dom_calle = models.CharField(max_length=150, blank=True, null=True)
    dom_corresp_dom_numero_ext = models.CharField(max_length=50, blank=True, null=True)
    dom_corresp_dom_numero_int = models.CharField(max_length=50, blank=True, null=True)
    dom_corresp_dom_colonia = models.CharField(max_length=100, blank=True, null=True)
    dom_corresp_dom_municipio_alcaldia = models.CharField(max_length=255, blank=True, null=True)
    dom_corresp_dom_estado = models.CharField(max_length=255, blank=True, null=True)
    dom_corresp_dom_cp = models.CharField(max_length=10, blank=True, null=True)
    dom_corresp_dom_pais = models.CharField(max_length=100, blank=True, null=True)
    telefono_fijo = models.CharField(max_length=10)
    telefono_sms = models.CharField(max_length=10)
    estado_civil = models.CharField(max_length=20, choices=ESTADO_CIVIL_CHOICES)
    ident_fideicomiso = models.CharField(max_length=100)
    link_carpeta = models.CharField(max_length=2083, blank=True, null=True)
    link_plantillas = models.CharField(max_length=2083, blank=True, null=True)
    link_documento_pld = models.CharField(max_length=2083, blank=True, null=True)
    estado_llenado = models.CharField(
        max_length=20, choices=ESTADO_LLENADO_CHOICES, default=ESTADO_PENDIENTE
    )
    # FK real a iam_users.user_id (iam-service) - referencia laxa, ver nota arriba.
    aprobado_por = models.CharField(max_length=8)
    aprobado_en = models.DateTimeField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)
    fecha_vencimiento = models.DateField()

    # SCOPE_FIELD_SOCIEDAD ya resuelto (punto 2 del plan de Fase 1, ver
    # sociedad_rfc arriba). Un usuario de alcance SOCIEDAD ya puede ver los
    # expedientes de su(s) sociedad(es) - ya no es solo GLOBAL/nada, salvo
    # para expedientes viejos con sociedad_rfc=NULL (backfill pendiente).
    SCOPE_FIELD_SOCIEDAD = "sociedad_rfc"
    objects = ScopedManager()

    class Meta:
        db_table = "pld_contrapartes_kyc"

    def __str__(self):
        return self.id_kyc


class PldContraparteDoc(models.Model):
    STATUS_PENDIENTE = "PENDIENTE"
    STATUS_INCOMPLETO = "INCOMPLETO"
    STATUS_ENTREGADO = "ENTREGADO"
    STATUS_APROBADO = "APROBADO"
    STATUS_CHOICES = [
        (STATUS_PENDIENTE, "Pendiente"),
        (STATUS_INCOMPLETO, "Incompleto"),
        (STATUS_ENTREGADO, "Entregado"),
        (STATUS_APROBADO, "Aprobado"),
    ]

    id_kyc_doc = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    kyc = models.ForeignKey(
        PldContraparteKyc, on_delete=models.CASCADE, db_column="id_kyc", related_name="documentos"
    )
    denominacion = models.CharField(max_length=250, blank=True, null=True)
    detalles_adicionales = models.CharField(max_length=500, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, blank=True, null=True)
    link_documento = models.CharField(max_length=2083, blank=True, null=True)
    fecha_solicitud = models.DateField(blank=True, null=True)
    fecha_limite = models.DateField(blank=True, null=True)
    fecha_entrega = models.DateField(blank=True, null=True)
    fecha_cierre = models.DateField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)

    # Alcance via el expediente padre (Django soporta lookup a traves de FK
    # con "__" en el nombre del campo) - un documento hereda la sociedad de
    # su PldContraparteKyc, no tiene sociedad propia.
    SCOPE_FIELD_SOCIEDAD = "kyc__sociedad_rfc"
    objects = ScopedManager()

    class Meta:
        db_table = "pld_contrapartes_docs"

    def __str__(self):
        return self.id_kyc_doc


class PldTicketCliente(models.Model):
    """Magic link de un solo uso para KYC externo (sec. 6.2 del doc de
    arquitectura). Mismo patron que IamMagicLink (iam-service): token_hash
    (nunca el token en claro), uses_count/revoked_at para el ciclo de vida.
    pld-service no tiene llave privada para emitir JWT propio (solo verifica
    el de cumbresbi_scope, ver config/settings.py), asi que a diferencia de
    iam-service este ticket no emite sesion externa - "validar" regresa el
    ticket/expediente directamente (ver views.py).
    """

    id_pld_ticket = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    kyc = models.ForeignKey(
        PldContraparteKyc,
        on_delete=models.CASCADE,
        db_column="id_kyc",
        related_name="tickets",
        blank=True,
        null=True,
    )
    email = models.EmailField(max_length=254)
    token_hash = models.CharField(max_length=64, unique=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    # FK real a iam_users.user_id (iam-service) - referencia laxa.
    issued_by = models.CharField(max_length=8)
    expires_at = models.DateTimeField()
    max_uses = models.IntegerField()
    uses_count = models.IntegerField(default=0)
    first_used_at = models.DateTimeField(blank=True, null=True)
    last_used_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)

    # Igual que PldContraparteDoc: sin columna propia de alcance, pero
    # ScopedManager sigue siendo el gate GLOBAL/no-GLOBAL para el listado
    # interno (ver PldTicketClienteViewSet.get_queryset). El endpoint
    # publico "validar" usa PldTicketCliente.objects.get(...) directo, sin
    # for_scope, a proposito - es la unica via de acceso sin sesion interna.
    objects = ScopedManager()

    class Meta:
        db_table = "pld_ticket_cliente"

    def __str__(self):
        return self.id_pld_ticket
