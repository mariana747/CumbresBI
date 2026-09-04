from django.db import migrations

from iam.permission_matrix import ACCION_POR_LETRA, ROLE_ACCESS

# Solicitud de Pago (tesoreria-service, 04/Sep/2026) - pago de servicios/
# licencias/renovaciones, dividido por proyecto. Servicio nuevo separado de
# "tesoreria" (ver comentario en permission_matrix.py, SERVICIOS): a
# diferencia de Reembolso (abierto a cualquier empleado, sin perm_key), no
# todos los colaboradores pueden solicitar pago - solo SUPER_ADMIN,
# FINANZAS_MANAGER (LCEA) y TESORERIA_ANALISTA (LC, sin "A" - separacion de
# funciones, no se autoriza a si mismo) y CONTRALOR (L, solo lectura).
# Reutiliza el mismo seed() de 0004_seed_permisos_matriz.py (ver ese
# archivo) - idempotente via get_or_create, no toca los permisos de los
# demas servicios/roles ya sembrados.


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
        try:
            role = IamRole.objects.get(role_key=role_key)
        except IamRole.DoesNotExist:
            continue
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

    perm_keys = [f"solicitud-pago.{accion}" for accion in ACCION_POR_LETRA.values()]
    IamRolePermission.objects.filter(permission__perm_key__in=perm_keys).delete()
    IamPermission.objects.filter(perm_key__in=perm_keys).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0016_iamrole_tipo"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
