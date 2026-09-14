from django.db import migrations

from iam.permission_matrix import ACCION_POR_LETRA, ROLE_ACCESS

# Bloquear edicion directa en Drive para PLD (25/Ago/2026, requerimiento
# real del cliente: "nadie modifica en Drive, todo desde CumbresBI").
# Agrega el servicio "pld-documentos" (ver permission_matrix.py) para
# separar "gestionar archivos" (subir/eliminar, solo SUPER_ADMIN) de
# "editar datos del expediente" (pld-compliance.editar, que PLD_ANALISTA
# ya tenia y conserva). Mismo seed() idempotente de
# 0004_seed_permisos_matriz.py/0012_seed_obra_permisos.py sobre el
# ROLE_ACCESS actual completo.


def seed(apps, schema_editor):
    IamUser = apps.get_model("iam", "IamUser")
    IamRole = apps.get_model("iam", "IamRole")
    IamPermission = apps.get_model("iam", "IamPermission")
    IamRolePermission = apps.get_model("iam", "IamRolePermission")

    system_user = IamUser.objects.get(user_id="system01")

    permisos_por_key = {}
    for accesos in ROLE_ACCESS.values():
        for servicio, letras in accesos.items():
            for letra in letras:
                perm_key = f"{servicio}.{ACCION_POR_LETRA[letra]}"
                permiso, _ = IamPermission.objects.get_or_create(
                    perm_key=perm_key,
                    defaults={
                        "description": f"Puede {ACCION_POR_LETRA[letra]} en {servicio}",
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

    perm_keys = [f"pld-documentos.{accion}" for accion in ACCION_POR_LETRA.values()]
    IamRolePermission.objects.filter(permission__perm_key__in=perm_keys).delete()
    IamPermission.objects.filter(perm_key__in=perm_keys).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0012_seed_obra_permisos"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
