from django.db import migrations

from iam.permission_matrix import ACCION_POR_LETRA, ROLE_ACCESS

# Re-siembra el catalogo completo (mismo codigo que 0004_seed_permisos_matriz,
# ver ese archivo para el porque de este patron) - 0004 ya se aplico en
# cualquier entorno existente, asi que agregar "docint" a
# iam/permission_matrix.py no le llega solo; esta migracion vuelve a correr
# el seed con get_or_create, que no toca nada de lo que ya existia y solo
# agrega lo nuevo (perm_keys docint.leer/docint.crear + su asignacion a
# SUPER_ADMIN/AUDITOR/PLD_ANALISTA/PLD_APROBADOR). Fase 4 de la migracion a
# analisis asincrono con Cloud Tasks (13/Ago/2026, ver docint/views.py).


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
        # Mismo guard que 0004_seed_permisos_matriz.py (24/Ago/2026, ver ese
        # archivo para el porque) - ROLE_ACCESS es "vivo", en una base nueva
        # esta migracion corre antes que las que crean roles todavia mas
        # nuevos (ej. 0012_seed_obra_permisos.py, SUPERVISOR_OBRA).
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

    perm_keys = ["docint.leer", "docint.crear"]
    IamRolePermission.objects.filter(permission__perm_key__in=perm_keys).delete()
    IamPermission.objects.filter(perm_key__in=perm_keys).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("iam", "0009_agrega_iam_invitation"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
