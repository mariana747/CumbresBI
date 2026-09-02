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

    # 5 opciones estandar de la industria para Mexico (25/Ago/2026 - antes
    # solo tenia Soltero/Casado, "se va a ampliar" segun Mariana).
    CIVIL_SOLTERO = "SOLTERO"
    CIVIL_CASADO = "CASADO"
    CIVIL_DIVORCIADO = "DIVORCIADO"
    CIVIL_VIUDO = "VIUDO"
    CIVIL_UNION_LIBRE = "UNION_LIBRE"
    ESTADO_CIVIL_CHOICES = [
        (CIVIL_SOLTERO, "Soltero(a)"),
        (CIVIL_CASADO, "Casado(a)"),
        (CIVIL_DIVORCIADO, "Divorciado(a)"),
        (CIVIL_VIUDO, "Viudo(a)"),
        (CIVIL_UNION_LIBRE, "Unión libre / Concubinato"),
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
    #
    # 25/Ago/2026 (requerimiento real del cliente: "hay que implementar
    # sociedad... se ponga en automatico el nombre de la sociedad") - se
    # vuelve obligatorio para expedientes NUEVOS (ver
    # PldContraparteKycViewSet.create), elegido de un dropdown real contra
    # el catalogo de iam-service, no texto libre. Los 3 expedientes viejos
    # con NULL se quedan asi (backfill aparte, fuera de este cambio).
    sociedad_rfc = models.CharField(max_length=13, blank=True, null=True)
    # Snapshot del nombre de la sociedad al momento de crear el expediente
    # (mismo criterio que PldSolicitudEliminacionDoc.denominacion_doc) - se
    # usa para mostrarselo al cliente en el formulario publico
    # (pld-ticket/[token]/page.tsx) sin que esa pagina publica, sin sesion,
    # tenga que llamar a iam-service (que si requiere permiso real).
    sociedad_nombre = models.CharField(max_length=250, blank=True, null=True)
    # 31/Ago/2026 (pedido de Mariana: "hay que hacer ese filtro por
    # sociedad y proyecto" - caso real de Dellanira, abogada externa que
    # solo debe ver el PLD de un proyecto) - cierra el pendiente
    # documentado en la memoria de sesion "pld-necesita-scope-por-
    # proyecto". Igual que TesoreriaContrato.proyecto: CharField libre,
    # sin catalogo real todavia (ver "centro-proyecto-no-son-catalogo-
    # generico"), opcional (a diferencia de sociedad_rfc, que ya es
    # obligatorio para expedientes nuevos) - no todo expediente pertenece
    # a un proyecto especifico.
    proyecto = models.CharField(max_length=3, blank=True, null=True)
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
    # nombre/apellido_paterno/apellido_materno (02/Sep/2026, pedido
    # explicito del checklist de cumplimiento: "Dividir el campo unico...
    # en tres campos de texto independientes... para Persona Fisica") -
    # SOLO aplican a fisica. nombre_completo arriba se queda intacto para
    # Moral/Fideicomiso (sigue siendo "Denominacion o Razon Social", un
    # campo unico real - una empresa no tiene "apellidos"). Todavia NO se
    # conecta con el Motor Documental (docint/prompts.py sigue mandando
    # nombre_completo unico para INE/CURP/acta de nacimiento) ni con el
    # frontend - ese es el siguiente paso, este es solo el campo nuevo en
    # el modelo.
    nombre = models.CharField(max_length=150, blank=True, null=True)
    apellido_paterno = models.CharField(max_length=100, blank=True, null=True)
    apellido_materno = models.CharField(max_length=100, blank=True, null=True)
    # tipo_persona (02/Sep/2026, pedido explicito: el catalogo UIF de
    # ocupacion/actividad economica es distinto para Fisica vs Moral, y el
    # expediente KYC no tenia forma propia de saber cual mostrar - antes
    # solo TesoreriaContraparte.tipo_persona existia, y el expediente no lo
    # consultaba). Mismas choices que TesoreriaContraparte.TIPO_PERSONA_CHOICES
    # (tesoreria-service/tesoreria/models.py) por consistencia, pero es su
    # propio campo aqui - en teoria deberia coincidir con el de la
    # contraparte vinculada, pero no se sincroniza automatico todavia (el
    # analista lo elige a mano al llenar el expediente).
    # "fisica_act_emp" quitado (02/Sep/2026, pedido explicito del checklist
    # de cumplimiento: "Eliminar la opcion 'Fisica con actividad
    # empresarial' de la lista de primer nivel. Dejar unicamente...
    # Fisica, Moral y Fideicomiso") - sin backfill que hacer, el campo se
    # agrego el mismo dia y no hay expedientes reales con ese valor
    # todavia. TesoreriaContraparte.tipo_persona (tesoreria-service) SI
    # sigue teniendo esa opcion - este pedido es especifico del expediente
    # KYC de PLD, no un cambio al catalogo maestro de Tesoreria.
    TIPO_FISICA = "fisica"
    TIPO_MORAL = "moral"
    TIPO_FIDEICOMISO = "fideicomiso"
    TIPO_PERSONA_CHOICES = [
        (TIPO_FISICA, "Física"),
        (TIPO_MORAL, "Moral"),
        (TIPO_FIDEICOMISO, "Fideicomiso"),
    ]
    tipo_persona = models.CharField(max_length=20, choices=TIPO_PERSONA_CHOICES, blank=True, null=True)
    fecha_nac_const = models.DateField(blank=True, null=True)
    pais_nac_const = models.CharField(max_length=100, blank=True, null=True)
    folio_mercantil = models.CharField(max_length=250, blank=True, null=True)
    objeto_social = models.CharField(max_length=250, blank=True, null=True)
    curp = models.CharField(max_length=18, blank=True, null=True)
    # rfc (02/Sep/2026, pedido explicito del checklist de cumplimiento:
    # "Requerir de forma obligatoria el RFC con homoclave" - fisica 13
    # caracteres, moral 12) - no existia como campo propio en este
    # expediente hasta ahora (a diferencia de TesoreriaContraparte.rfc, que
    # ya existe en tesoreria-service). Es su propia columna aqui, no una
    # FK - mismo criterio de "referencia laxa" que id_contraparte, para no
    # acoplar esquemas entre microservicios. blank/null=True a nivel de
    # modelo (igual que el resto de "datos del cliente", Opcion B de alta
    # autonoma) - "obligatorio" se aplica como campo requerido en el
    # formulario (analista/publico), no como NOT NULL en la base de datos;
    # el FORMATO si se valida siempre que llegue un valor (ver
    # PldContraparteKycSerializer.validate).
    rfc = models.CharField(max_length=13, blank=True, null=True)
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

    # Consentimiento del cliente externo (25/Ago/2026, requerimiento real
    # del cliente: el formulario publico de pld-ticket/[token]/page.tsx
    # exige aceptar el aviso de privacidad y declarar bajo protesta de
    # decir verdad antes de poder guardar sus datos). Se guardan aqui, no
    # solo se validan en el frontend, para que quede evidencia real de
    # cuando y desde donde se dio el consentimiento - ver
    # PldTicketClienteViewSet.actualizar_datos. Ambos se re-escriben cada
    # vez que el cliente vuelve a guardar datos con el mismo link (no solo
    # la primera vez), asi el timestamp siempre refleja la ultima vez que
    # confirmo que sus datos actuales son ciertos.
    politicas_aceptadas_en = models.DateTimeField(blank=True, null=True)
    veracidad_declarada_en = models.DateTimeField(blank=True, null=True)
    consentimiento_ip = models.CharField(max_length=45, blank=True, null=True)

    # SCOPE_FIELD_SOCIEDAD ya resuelto (punto 2 del plan de Fase 1, ver
    # sociedad_rfc arriba). Un usuario de alcance SOCIEDAD ya puede ver los
    # expedientes de su(s) sociedad(es) - ya no es solo GLOBAL/nada, salvo
    # para expedientes viejos con sociedad_rfc=NULL (backfill pendiente).
    SCOPE_FIELD_SOCIEDAD = "sociedad_rfc"
    SCOPE_FIELD_PROYECTO = "proyecto"
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
    SCOPE_FIELD_PROYECTO = "kyc__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "pld_contrapartes_docs"

    def __str__(self):
        return self.id_kyc_doc


class PldRepresentanteLegal(models.Model):
    """Representante legal / apoderado de una contraparte Moral (02/Sep/2026,
    pedido explicito del checklist de cumplimiento: "Incluir como requisito
    obligatorio los datos e identificacion oficial del Representante Legal /
    Apoderado"). Modelo separado (no campos sueltos en PldContraparteKyc) -
    una Moral puede tener mas de un representante/apoderado real (ej. dos
    apoderados con firma mancomunada), un solo set de campos no alcanzaba.

    No confundir con TesoreriaContraparteRelacion (tesoreria-service, tipo
    REP LEGAL/BENEF CONTROLADOR) - es el mismo concepto de negocio pero una
    base de datos distinta (microservicios separados); no hay FK real entre
    ambos, solo el mismo criterio conceptual replicado aqui para el
    expediente KYC de PLD.

    "Obligatorio para Moral" se aplica en el formulario (frontend: al menos
    1 representante antes de poder aprobar el expediente), no como
    constraint de base de datos - mismo criterio que el resto de "datos del
    cliente" en un expediente de alta autonoma (Opcion B)."""

    TIPO_REPRESENTANTE_LEGAL = "REPRESENTANTE_LEGAL"
    TIPO_APODERADO = "APODERADO"
    TIPO_CHOICES = [
        (TIPO_REPRESENTANTE_LEGAL, "Representante legal"),
        (TIPO_APODERADO, "Apoderado"),
    ]

    # Facultades del poder notarial (02/Sep/2026, pedido explicito: "debe
    # adjuntarse el instrumento notarial... donde se verifique que la
    # persona fisica que firma tiene facultades vigentes y suficientes -de
    # preferencia para Actos de Administracion o Pleitos y Cobranzas") -
    # catalogo real de facultades notariales mexicanas, no texto libre.
    FACULTAD_PLEITOS_COBRANZAS = "PLEITOS_COBRANZAS"
    FACULTAD_ACTOS_ADMINISTRACION = "ACTOS_ADMINISTRACION"
    FACULTAD_ACTOS_DOMINIO = "ACTOS_DOMINIO"
    FACULTAD_AMBAS = "PLEITOS_Y_ADMINISTRACION"
    FACULTAD_OTRAS = "OTRAS"
    FACULTAD_CHOICES = [
        (FACULTAD_PLEITOS_COBRANZAS, "Pleitos y cobranzas"),
        (FACULTAD_ACTOS_ADMINISTRACION, "Actos de administración"),
        (FACULTAD_ACTOS_DOMINIO, "Actos de dominio"),
        (FACULTAD_AMBAS, "Pleitos y cobranzas + Actos de administración"),
        (FACULTAD_OTRAS, "Otras"),
    ]

    id_representante = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    kyc = models.ForeignKey(
        PldContraparteKyc, on_delete=models.CASCADE, db_column="id_kyc", related_name="representantes_legales"
    )
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default=TIPO_REPRESENTANTE_LEGAL)
    # Representante principal del tramite en curso (02/Sep/2026, pedido
    # explicito: "el sistema debe permitir registrar los datos... del
    # Representante Legal que esta ejecutando el contrato o tramite en ese
    # momento" - una Moral puede tener varios representantes vigentes,
    # pero solo uno esta firmando ESTE tramite). Bandera simple, no exige
    # que sea unico a nivel de base de datos (se valida/asegura en el
    # formulario, mismo criterio que el resto de reglas "obligatorias" de
    # este modelo) - a lo sumo deberia haber un solo True por expediente.
    es_principal_del_tramite = models.BooleanField(default=False)
    # Beneficiario Controlador vs Representante (02/Sep/2026, pedido
    # explicito: "Es importante no confundirlos en la matriz PLD. Un
    # representante legal tiene poder de firma, pero el Beneficiario
    # Controlador es quien realmente posee el control o mas del 25% de las
    # acciones (aunque a veces una misma persona fisica cumple ambos
    # roles)") - bandera INDEPENDIENTE de "tipo" a proposito: tipo dice si
    # firma (representante/apoderado), este campo dice si ademas controla
    # la empresa - las dos cosas pueden ser ciertas a la vez para la misma
    # persona, o ninguna, sin que se pisen entre si.
    es_beneficiario_controlador = models.BooleanField(default=False)
    # porcentaje_participacion (02/Sep/2026) - solo tiene sentido cuando
    # es_beneficiario_controlador=True (el umbral legal de "control" es
    # justo el 25%, ver docstring de arriba) - opcional, no todo expediente
    # tiene este dato capturado todavia.
    porcentaje_participacion = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    nombre_completo = models.CharField(max_length=250)
    rfc = models.CharField(max_length=13, blank=True, null=True)
    curp = models.CharField(max_length=18, blank=True, null=True)
    tipo_identificacion = models.CharField(max_length=100, blank=True, null=True)
    numero_identificacion = models.CharField(max_length=100, blank=True, null=True)
    autoridad_identificacion = models.CharField(max_length=250, blank=True, null=True)
    # Poder notarial (02/Sep/2026, pedido explicito, ver docstring de
    # FACULTAD_CHOICES arriba) - el INSTRUMENTO en si (el PDF/escaneo de la
    # escritura) se sube como documento normal via PldContraparteDoc, mismo
    # patron Drive-first que el resto del expediente; estos campos son solo
    # los DATOS del poder (numero de escritura, notario, facultades,
    # vigencia), para poder validar "facultades vigentes y suficientes"
    # sin tener que abrir el PDF cada vez.
    poder_numero_escritura = models.CharField(max_length=100, blank=True, null=True)
    poder_notario_nombre = models.CharField(max_length=250, blank=True, null=True)
    poder_notario_numero = models.CharField(max_length=50, blank=True, null=True)
    poder_fecha_escritura = models.DateField(blank=True, null=True)
    poder_facultades = models.CharField(max_length=30, choices=FACULTAD_CHOICES, blank=True, null=True)
    poder_vigente = models.BooleanField(default=True)
    comentarios = models.CharField(max_length=500, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    # Alcance via el expediente padre - mismo criterio que PldContraparteDoc.
    SCOPE_FIELD_SOCIEDAD = "kyc__sociedad_rfc"
    SCOPE_FIELD_PROYECTO = "kyc__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "pld_representantes_legales"

    def __str__(self):
        return self.nombre_completo


class PldSolicitudEliminacionDoc(models.Model):
    """Solicitud de eliminacion de un documento (25/Ago/2026, requerimiento
    real del cliente): desde que se separo "gestionar archivos" de "editar
    datos" (ver PldContraparteDoc/permission_matrix.py, pld-documentos
    exclusivo Admin), el analista ya no puede borrar un archivo el mismo -
    si de verdad hace falta (ej. un duplicado viejo), manda esta solicitud
    con una razon breve; solo Admin la aprueba o la rechaza. Aprobar borra
    el documento de verdad (mismo criterio de auditoria que el destroy()
    directo); rechazar solo cierra la solicitud, el documento se queda.

    Quien puede CREAR una solicitud (pld-compliance.editar, mismo permiso
    que ya tiene el analista para editar el expediente - no es un permiso
    nuevo) es distinto de quien puede RESOLVERLA (pld-documentos.editar,
    Admin) - ver PldSolicitudEliminacionDocViewSet.get_permissions."""

    ESTADO_PENDIENTE = "PENDIENTE"
    ESTADO_APROBADA = "APROBADA"
    ESTADO_RECHAZADA = "RECHAZADA"
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, "Pendiente"),
        (ESTADO_APROBADA, "Aprobada"),
        (ESTADO_RECHAZADA, "Rechazada"),
    ]

    id_solicitud = models.CharField(max_length=8, primary_key=True, default=_short_id, editable=False)
    # on_delete=SET_NULL (no CASCADE) a proposito - hallazgo real: con
    # CASCADE, aprobar() borra el documento y esa misma cascada borraba de
    # paso el registro de la solicitud, perdiendo el historial de quien
    # aprobo que. La solicitud debe sobrevivir a la eliminacion del
    # documento que la origino.
    documento = models.ForeignKey(
        PldContraparteDoc,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="id_kyc_doc",
        related_name="solicitudes_eliminacion",
    )
    # Snapshot al momento de crear la solicitud (mismo motivo que
    # on_delete=SET_NULL arriba): denominacion/sociedad_rfc via
    # "documento__..." dejan de resolver en cuanto el documento se borra -
    # sin esto, una solicitud ya aprobada se volveria invisible para un
    # usuario de alcance SOCIEDAD (el join a traves de documento=NULL no
    # regresa nada) y perderia el nombre del archivo en pantalla.
    denominacion_doc = models.CharField(max_length=250, blank=True, null=True)
    sociedad_rfc = models.CharField(max_length=13, blank=True, null=True)
    # 31/Ago/2026, mismo snapshot que sociedad_rfc arriba - sobrevive a que
    # el documento (y con el, el join a kyc__proyecto) se borre.
    proyecto = models.CharField(max_length=3, blank=True, null=True)
    razon = models.CharField(max_length=500)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default=ESTADO_PENDIENTE)
    solicitado_por = models.CharField(max_length=8)
    solicitado_en = models.DateTimeField(auto_now_add=True)
    resuelto_por = models.CharField(max_length=8, blank=True, null=True)
    resuelto_en = models.DateTimeField(blank=True, null=True)
    comentario_resolucion = models.CharField(max_length=500, blank=True, null=True)

    # Via la columna propia sociedad_rfc (snapshot), no un join en vivo a
    # traves de documento - sobrevive a que el documento se borre.
    SCOPE_FIELD_SOCIEDAD = "sociedad_rfc"
    SCOPE_FIELD_PROYECTO = "proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "pld_solicitudes_eliminacion_doc"

    def __str__(self):
        return self.id_solicitud


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

    # 31/Ago/2026 (auditoria de scope, "hay que hacer ese filtro por
    # sociedad y proyecto"): antes sin columna propia de alcance, solo el
    # gate binario GLOBAL/no-GLOBAL. Ahora hereda sociedad/proyecto del
    # expediente via kyc (mismo criterio que PldContraparteDoc) - un
    # ticket sin kyc asignado (blank=True, null=True arriba) sigue sin
    # coincidir con ningun alcance no-GLOBAL (fail-closed, no un caso
    # especial). El endpoint publico "validar" usa
    # PldTicketCliente.objects.get(...) directo, sin for_scope, a
    # proposito - es la unica via de acceso sin sesion interna.
    SCOPE_FIELD_SOCIEDAD = "kyc__sociedad_rfc"
    SCOPE_FIELD_PROYECTO = "kyc__proyecto"
    objects = ScopedManager()

    class Meta:
        db_table = "pld_ticket_cliente"

    def __str__(self):
        return self.id_pld_ticket
