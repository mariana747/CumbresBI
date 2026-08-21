from django.db import migrations

from iam.permission_matrix import ACCION_POR_LETRA, ROLE_ACCESS

# Obra (obra-service, 21/Ago/2026) - agrega el servicio "obra" y el rol
# SUPERVISOR_OBRA al catalogo (ver permission_matrix.py, PENDIENTE
# confirmar nombres con el cliente igual que el resto de esa matriz).
# Reutiliza el mismo seed() de 0004_seed_permisos_matriz.py sobre el
# ROLE_ACCESS actual completo - idempotente via get_or_create, no duplica
# ni toca los permisos de los demas servicios/roles ya sembrados.

ROLES_NUEVOS = [
    ("SUPERVISOR_OBRA", "Supervisor de Obra", "Captura y valida/cierra el corte semanal de avance de obra."),
]


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

    for role_key, role_name, description in ROLES_NUEVOS:
        IamRole.objects.get_or_create(
            role_key=role_key,
            defaults={
                "role_name": role_name,
                "description": description,
                "created_by": system_user,
                "updated_by": system_user,
            },
        )

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
    IamRole = apps.get_model("iam", "IamRole")

    perm_keys = [f"obra.{accion}" for accion in ACCION_POR_LETRA.values()]
    IamRolePermission.objects.filter(permission__perm_key__in=perm_keys).delete()
    IamPermission.objects.filter(perm_key__in=perm_keys).delete()
    IamRole.objects.filter(role_key__in=[rk for rk, _, _ in ROLES_NUEVOS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0011_merge_iamexternalcollaborator_y_seed_docint"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
