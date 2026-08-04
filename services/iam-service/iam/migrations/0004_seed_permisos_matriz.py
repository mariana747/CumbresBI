from django.db import migrations

# Matriz de permisos por servicio confirmada por el cliente
# (docs/architecture/roles-y-permisos.md sec. 3). L=leer, C=crear, E=editar,
# A=aprobar/autorizar. Simplificaciones documentadas caso por caso:
# - TICKETS_PARTICIPANTE: el doc distingue "L solo lo asignado a mi" de
#   "C solo comentarios" - aqui se modela como LC llano sobre "tickets", sin
#   ese matiz de alcance por registro (lo resuelve RLS, no el catalogo de
#   permisos).
SERVICIOS = [
    "iam",
    "contrapartes",
    "pld-compliance",
    "ventas-vivienda",
    "materiales",
    "rentas",
    "tesoreria",
    "facturacion-cfdi",
    "compras",
    "rrhh",
    "tickets",
    "audit",
]

ACCION_POR_LETRA = {"L": "leer", "C": "crear", "E": "editar", "A": "aprobar"}

ROLE_ACCESS = {
    "SUPER_ADMIN": {
        "iam": "LCEA", "contrapartes": "LCEA", "pld-compliance": "LCEA",
        "ventas-vivienda": "LCEA", "materiales": "LCEA", "rentas": "LCEA",
        "tesoreria": "LCEA", "facturacion-cfdi": "LCEA", "compras": "LCEA",
        "rrhh": "LCEA", "tickets": "LCEA", "audit": "L",
    },
    "IAM_ADMIN": {"iam": "LCEA", "audit": "L"},
    "AUDITOR": {s: "L" for s in SERVICIOS},
    "PLD_ANALISTA": {"iam": "L", "contrapartes": "L", "pld-compliance": "LCE"},
    "PLD_APROBADOR": {"iam": "L", "contrapartes": "L", "pld-compliance": "LEA"},
    "VENTAS_ASESOR": {
        "iam": "L", "contrapartes": "L", "ventas-vivienda": "LCE", "materiales": "L",
    },
    "VENTAS_GERENTE": {
        "iam": "L", "contrapartes": "L", "ventas-vivienda": "LCEA",
        "materiales": "LE", "tesoreria": "L",
    },
    "OBRA_COORDINADOR": {"iam": "L", "ventas-vivienda": "LE", "materiales": "LCE"},
    "FINANZAS_MANAGER": {
        "iam": "L", "contrapartes": "LCE", "ventas-vivienda": "L", "materiales": "L",
        "rentas": "LCE", "tesoreria": "LCEA", "facturacion-cfdi": "LCE", "compras": "LCEA",
    },
    "TESORERIA_ANALISTA": {
        "iam": "L", "contrapartes": "L", "tesoreria": "LCE", "facturacion-cfdi": "LC",
    },
    "COMPRAS_ANALISTA": {
        "iam": "L", "contrapartes": "L", "materiales": "LCE", "tesoreria": "L", "compras": "LCEA",
    },
    "CONTRALOR": {
        "iam": "L", "contrapartes": "L", "ventas-vivienda": "L", "materiales": "L",
        "rentas": "L", "tesoreria": "L", "facturacion-cfdi": "L", "compras": "L", "audit": "L",
    },
    "RRHH_SUPERVISOR_CENTRO": {"iam": "L", "rrhh": "LE"},
    "RRHH_ADMIN": {"iam": "L", "rrhh": "LCEA"},
    "EMPLEADO_SELF": {"rrhh": "L", "tickets": "L"},
    "TICKETS_RESPONSABLE": {"iam": "L", "tickets": "LCEA"},
    "TICKETS_PARTICIPANTE": {"tickets": "LC"},
}


def _perm_keys():
    keys = set()
    for accesos in ROLE_ACCESS.values():
        for servicio, letras in accesos.items():
            for letra in letras:
                keys.add((servicio, ACCION_POR_LETRA[letra]))
    return sorted(keys)


def seed(apps, schema_editor):
    IamUser = apps.get_model("iam", "IamUser")
    IamRole = apps.get_model("iam", "IamRole")
    IamPermission = apps.get_model("iam", "IamPermission")
    IamRolePermission = apps.get_model("iam", "IamRolePermission")

    system_user = IamUser.objects.get(user_id="system01")

    permisos_por_key = {}
    for servicio, accion in _perm_keys():
        perm_key = f"{servicio}.{accion}"
        permiso, _ = IamPermission.objects.get_or_create(
            perm_key=perm_key,
            defaults={
                "description": f"Puede {accion} en {servicio}",
                "created_by": system_user,
                "updated_by": system_user,
            },
        )
        permisos_por_key[perm_key] = permiso

    for role_key, accesos in ROLE_ACCESS.items():
        role = IamRole.objects.get(role_key=role_key)
        for servicio, letras in accesos.items():
            for letra in letras:
                perm_key = f"{servicio}.{ACCION_POR_LETRA[letra]}"
                IamRolePermission.objects.get_or_create(
                    role=role,
                    permission=permisos_por_key[perm_key],
                    defaults={"created_by": system_user, "updated_by": system_user},
                )


def unseed(apps, schema_editor):
    IamRolePermission = apps.get_model("iam", "IamRolePermission")
    IamPermission = apps.get_model("iam", "IamPermission")

    perm_keys = [f"{servicio}.{accion}" for servicio, accion in _perm_keys()]
    IamRolePermission.objects.filter(permission__perm_key__in=perm_keys).delete()
    IamPermission.objects.filter(perm_key__in=perm_keys).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0003_alias_y_fusion_cumbres"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
