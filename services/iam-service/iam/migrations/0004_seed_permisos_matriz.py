from django.db import migrations

from iam.permission_matrix import ACCION_POR_LETRA, ROLE_ACCESS

# Matriz de permisos por servicio confirmada por el cliente
# (docs/architecture/roles-y-permisos.md sec. 3) - dict movido a
# iam/permission_matrix.py (11/Ago/2026) para que el frontend (fixture de
# pruebas) y dev_views.py (switch de rol sin Google) lo reutilicen sin
# copiarlo a mano; ver ese modulo para el detalle de cada rol.


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
