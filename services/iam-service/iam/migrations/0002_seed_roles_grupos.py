from django.db import migrations

# Catalogo confirmado por el cliente en docs/architecture/roles-y-permisos.md
# sec. 2. GRUPO como scope_type formal sigue sin decidir (sec. 5 punto 1) -
# estos roles usan GLOBAL/SOCIEDAD/PROYECTO segun esa tabla; el nivel GRUPO se
# resuelve aparte via general_grupos/iam_groups (via peticion explicita del
# cliente para este arranque, no via iam_user_roles.scope_type).
ROLES = [
    ("SUPER_ADMIN", "Super Admin", "Rol de plataforma, GLOBAL. No exento de la regla de auditoria inmutable."),
    ("IAM_ADMIN", "Administrador IAM", "Gestiona usuarios, roles, permisos e invitaciones en iam-service."),
    ("AUDITOR", "Auditor / Compliance Officer", "Visor de bitacora, filtrable y exportable."),
    ("PLD_ANALISTA", "Analista PLD/KYC", "Gestiona pld_contrapartes_kyc/docs, estados PENDIENTE/EN REVISION."),
    ("PLD_APROBADOR", "Aprobador PLD (Compliance Manager)", "Aprueba KYC - segregado del analista."),
    ("VENTAS_ASESOR", "Asesor de Ventas", "No ve expedientes de otro proyecto salvo asignacion explicita."),
    ("VENTAS_GERENTE", "Gerente de Ventas/Proyecto", "Supervisa asesores; aprueba presupuesto/firmas."),
    ("OBRA_COORDINADOR", "Coordinador de Obra", "Reporta avance de obra, gestiona consumo de materiales."),
    ("FINANZAS_MANAGER", "Finance Manager", "No ve datos de otra sociedad (alcance SOCIEDAD)."),
    ("TESORERIA_ANALISTA", "Analista de Tesoreria", "Opera flujos/conciliacion bajo supervision del Finance Manager."),
    ("COMPRAS_ANALISTA", "Comprador / Analista de Compras", "Gestiona proveedores y ordenes de compra."),
    ("CONTRALOR", "Contralor / CFO", "Consolidado multi-sociedad de un mismo grupo (via lista SOCIEDAD interina)."),
    ("RRHH_SUPERVISOR_CENTRO", "Supervisor de Centro", "No ve empleados de otro centro."),
    ("RRHH_ADMIN", "Administrador RRHH", "Onboarding, nomina, integracion Firmenti/DocuSeal."),
    ("EMPLEADO_SELF", "Empleado (portal MiCumbres)", "Ve unicamente su propio expediente/nomina (alcance IDENTIDAD)."),
    ("TICKETS_RESPONSABLE", "Responsable de Proyecto (Tickets)", "tickets_proyectos.responsable / tickets_subproyectos.responsable."),
    ("TICKETS_PARTICIPANTE", "Participante de Ticket", "Ve tickets asignados a si mismo (IDENTIDAD + PROYECTO)."),
]

# Grupos (holding empresarial) pedidos explicitamente para este arranque -
# ver nota en iam/models.py sobre GeneralGrupo/IamGroup (no vienen del ERD
# ni de la arquitectura v2.0, GRUPO sigue "sin decidir" formalmente).
GRUPOS = [
    "CIF TI ZARA",
    "TIZARA CAPITAL",
    "CONSULTORÍA Y PROYECTOS CUMBRES",
]


def seed(apps, schema_editor):
    IamUser = apps.get_model("iam", "IamUser")
    IamRole = apps.get_model("iam", "IamRole")
    GeneralGrupo = apps.get_model("iam", "GeneralGrupo")
    IamGroup = apps.get_model("iam", "IamGroup")

    system_user, _ = IamUser.objects.get_or_create(
        user_id="system01",
        defaults={
            "primary_email": "system@cumbresbi.local",
            "display_name": "Sistema (seed)",
            "status": "ACTIVE",
            "access_mode": "RESTRICTED",
        },
    )

    for role_key, role_name, description in ROLES:
        IamRole.objects.get_or_create(
            role_key=role_key,
            defaults={
                "role_name": role_name,
                "description": description,
                "created_by": system_user,
                "updated_by": system_user,
            },
        )

    for nombre in GRUPOS:
        grupo, _ = GeneralGrupo.objects.get_or_create(
            nombre=nombre,
            defaults={"created_by": system_user},
        )
        # Un equipo (iam_groups) homonimo por holding, para que quede algo a
        # lo que asignar usuarios via iam_user_groups desde el arranque.
        IamGroup.objects.get_or_create(
            nombre=nombre,
            defaults={"grupo": grupo, "created_by": system_user},
        )

    # Alias corto "CUMBRES" para el equipo de Consultoria y Proyectos Cumbres,
    # que es el que se usa para asignar usuarios internos por defecto.
    cumbres_grupo = GeneralGrupo.objects.get(nombre="CONSULTORÍA Y PROYECTOS CUMBRES")
    IamGroup.objects.get_or_create(
        nombre="CUMBRES",
        defaults={"grupo": cumbres_grupo, "created_by": system_user},
    )


def unseed(apps, schema_editor):
    IamUser = apps.get_model("iam", "IamUser")
    IamRole = apps.get_model("iam", "IamRole")
    GeneralGrupo = apps.get_model("iam", "GeneralGrupo")
    IamGroup = apps.get_model("iam", "IamGroup")

    IamGroup.objects.filter(nombre__in=[*GRUPOS, "CUMBRES"]).delete()
    GeneralGrupo.objects.filter(nombre__in=GRUPOS).delete()
    IamRole.objects.filter(role_key__in=[r[0] for r in ROLES]).delete()
    IamUser.objects.filter(user_id="system01").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
