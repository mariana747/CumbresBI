from django.db import migrations

from iam.permission_matrix import ACCION_POR_LETRA, ROLE_ACCESS

# Motor Documental para Facturacion CFDI (24/Ago/2026) - docint ya era un
# servicio transversal en permission_matrix.py (PLD_ANALISTA/PLD_APROBADOR
# lo tenian desde 0010_seed_docint_analizar.py), pero ningun rol de
# Tesoreria lo tenia todavia. Agrega "docint": "LC" a TESORERIA_ANALISTA y
# FINANZAS_MANAGER (ver permission_matrix.py) - sin roles nuevos, solo el
# enlace rol<->permiso que faltaba. Reusa el mismo seed() idempotente de
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
    IamRole = apps.get_model("iam", "IamRole")

    for role_key in ("TESORERIA_ANALISTA", "FINANZAS_MANAGER"):
        try:
            role = IamRole.objects.get(role_key=role_key)
        except IamRole.DoesNotExist:
            continue
        permiso_docint_leer = IamPermission.objects.filter(perm_key="docint.leer").first()
        permiso_docint_crear = IamPermission.objects.filter(perm_key="docint.crear").first()
        IamRolePermission.objects.filter(
            role=role, permission__in=[p for p in (permiso_docint_leer, permiso_docint_crear) if p]
        ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("iam", "0012_seed_obra_permisos"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
