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

    # Estado de cuenta (17/Ago/2026, vista de detalle del expediente) -
    # independiente de estado_llenado (que es sobre que tan lleno esta el
    # expediente) y de aprobado_en/aprobado_por (aprobacion formal). Este es
    # el semaforo operativo del dossier: activa por default, un analista
    # puede marcarla sospechosa o congelarla - ver acciones
    # marcar_sospechoso/congelar/reactivar_cuenta en views.py, mismo nivel
    # de permiso que aprobar (pld-compliance.aprobar), son decisiones de
    # cumplimiento del mismo peso.
    CUENTA_ACTIVA = "ACTIVA"
    CUENTA_SOSPECHOSA = "SOSPECHOSA"
    CUENTA_CONGELADA = "CONGELADA"
    ESTADO_CUENTA_CHOICES = [
        (CUENTA_ACTIVA, "Activa"),
        (CUENTA_SOSPECHOSA, "Marcada como sospechosa"),
        (CUENTA_CONGELADA, "Congelada"),
    ]

    id_kyc = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    # Contraparte propia y autonoma de PLD para esta fase (docs/
    # CumbresBI_V2_Plan_de_Trabajo_y_Cronograma.md, Semana 7): PLD no
    # depende de que otro modulo (Ventas/Tesoreria) exista todavia para dar
    # de alta un cliente - este campo es la referencia externa reservada
    # que se reconciliara con la contraparte maestra compartida hasta la
    # Fase 4. default=_short_id (17/Ago/2026) para que el analista no tenga
    # que inventar un identificador a mano al crear un expediente nuevo.
    # Sin unique=True (24/Ago/2026, decision explicita de Mariana: seguir
    # el ERD real - 20260727_Cumbres_ERD.sql linea 195 solo declara
    # `id_contraparte varchar(8) NOT NULL`, sin restriccion de unicidad -
    # una misma contraparte puede tener mas de un expediente KYC (ej.
    # historico/renovacion), no es un duplicado invalido por definicion.
    # La existencia real contra tesoreria-service SI se valida en
    # PldContraparteKycViewSet.create (ver views.py).
    id_contraparte = models.CharField(max_length=8, default=_short_id)
    # FK real a general_sociedades.rfc (iam-service) - referencia laxa, ver
    # nota de clase arriba. Columna real de alcance (punto 2 del plan de
    # Fase 1, RLS real) - que sociedad de Cumbres es la duena de este
    # expediente KYC, para filtrar por SCOPE_FIELD_SOCIEDAD. blank/null
    # porque los expedientes creados antes de esta columna no tienen valor
    # todavia (backfill pendiente).
    sociedad_rfc = models.CharField(max_length=13, blank=True, null=True)
    # A partir de aqui, los campos de "datos del cliente" son opcionales al
    # crear (decision 17/Ago/2026, Opcion B: expediente minimo autonomo -
    # ver memoria de sesion "pld-crear-expediente-opcion-b"): el analista
    # da de alta un expediente vacio y el propio cliente los llena despues
    # via el link publico (pld-ticket/[token]/page.tsx, actualizar_datos).
    # Antes eran obligatorios porque no existia ese formulario publico.
    #
    # nombre_completo (18/Ago/2026, hallazgo real): el expediente no tenia
    # NINGUN campo para el nombre de la persona/razon social de la empresa -
    # el Motor Documental ya lo extrae del INE/CURP/acta ("nombre_completo",
    # "razon_social", "razon_social_o_nombre" segun el documento, ver
    # docint/prompts.py) pero se descartaba en silencio en confirmar_extraccion
    # por no tener columna propia (ver ALIAS_CAMPOS en views.py para como se
    # unifican esas 3 llaves en este solo campo). Mismo criterio de
    # unificacion fisica/moral que fecha_nac_const/pais_nac_const arriba.
    nombre_completo = models.CharField(max_length=250, blank=True, null=True)
    fecha_nac_const = models.DateField(blank=True, null=True)
    pais_nac_const = models.CharField(max_length=100, blank=True, null=True)
    folio_mercantil = models.CharField(max_length=250, blank=True, null=True)
    objeto_social = models.CharField(max_length=250, blank=True, null=True)
    curp = models.CharField(max_length=18, blank=True, null=True)
    nacionalidad = models.CharField(max_length=100, blank=True, null=True)
    ocupacion_act_economica = models.CharField(max_length=100, blank=True, null=True)
    dom_calle = models.CharField(max_length=150, blank=True, null=True)
    dom_numero_ext = models.CharField(max_length=50, blank=True, null=True)
    dom_numero_int = models.CharField(max_length=50, blank=True, null=True)
    dom_colonia = models.CharField(max_length=100, blank=True, null=True)
    dom_municipio_alcaldia = models.CharField(max_length=255, blank=True, null=True)
    dom_estado = models.CharField(max_length=255, blank=True, null=True)
    dom_cp = models.CharField(max_length=10, blank=True, null=True)
    dom_pais = models.CharField(max_length=100, blank=True, null=True)
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
    telefono_fijo = models.CharField(max_length=10, blank=True, null=True)
    telefono_sms = models.CharField(max_length=10, blank=True, null=True)
    estado_civil = models.CharField(max_length=20, choices=ESTADO_CIVIL_CHOICES, blank=True, null=True)
    ident_fideicomiso = models.CharField(max_length=100, blank=True, null=True)
    link_carpeta = models.CharField(max_length=2083, blank=True, null=True)
    link_plantillas = models.CharField(max_length=2083, blank=True, null=True)
    link_documento_pld = models.CharField(max_length=2083, blank=True, null=True)
    estado_cuenta = models.CharField(max_length=20, choices=ESTADO_CUENTA_CHOICES, default=CUENTA_ACTIVA)
    estado_llenado = models.CharField(
        max_length=20, choices=ESTADO_LLENADO_CHOICES, default=ESTADO_PENDIENTE
    )
    # Workflow hibrido (decision de Mariana, 12/Ago/2026, ver
    # docs/architecture/pld-fase2-alcance.md sec. 3): estado_llenado se
    # recalcula solo cada vez que cambia el status de un documento del
    # expediente (ver pld/signals.py) - PERO si el analista lo edita a mano
    # via PATCH, se marca este flag en True y deja de recalcularse encima
    # de esa decision manual (hasta que alguien lo apague, ver
    # PldContraparteKycViewSet.reactivar_auto_estado).
    estado_llenado_manual = models.BooleanField(default=False)
    # FK real a iam_users.user_id (iam-service) - referencia laxa, ver nota arriba.
    aprobado_por = models.CharField(max_length=8)
    aprobado_en = models.DateTimeField(blank=True, null=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=8)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=8)
    # Opcional al crear (mismo criterio de la Opcion B, ver arriba) - se
    # define cuando el analista aprueba el expediente, no antes.
    fecha_vencimiento = models.DateField(blank=True, null=True)

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
    # link_documento se queda como el web_view_link legible (para abrir el
    # documento con un clic, ya lo consumia el frontend) - los campos de
    # abajo son la referencia real a Drive (docs/architecture/
    # pld-fase2-alcance.md sec. 1.4). blank/null porque los documentos
    # creados antes de esta migracion no tienen valor todavia (no hay
    # backfill pendiente: 0 documentos reales en la base al 11/Ago/2026,
    # ver CumbresBI_estado.md).
    link_documento = models.CharField(max_length=2083, blank=True, null=True)
    drive_file_id = models.CharField(max_length=128, blank=True, null=True)
    mime_type = models.CharField(max_length=100, blank=True, null=True)
    tamano_bytes = models.PositiveIntegerField(blank=True, null=True)
    subido_en = models.DateTimeField(blank=True, null=True)
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
