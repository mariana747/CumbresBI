"""Calculo del EffectiveScope agregado de un IamUser (docs/architecture/
README.md sec. 8 + roles-y-permisos.md sec. 4): cada claim es la UNION de
lo que aporta cada rol activo (revoked_at IS NULL), no la interseccion ni
un solo rol seleccionado; is_global=True de cualquier rol domina sobre el
resto.

CENTRO/CONTRATO (grants planos via iam_user_centro_access/
iam_user_contrato_access) e IDENTIDAD (self-service, ej. EMPLEADO_SELF) no
estan modelados todavia en este servicio - quedan en listas vacias /
None hasta que existan esos modelos (gap ya documentado en
roles-y-permisos.md sec. 1 y sec. 5 punto 5). No se improvisa una tabla
nueva aqui para no adelantarse a esa decision de producto.
"""

from .models import IamUserRole


def compute_effective_scope_claims(user) -> dict:
    roles_activos = IamUserRole.objects.filter(user=user, revoked_at__isnull=True).select_related("role")

    is_global = False
    sociedad_rfcs: set[str] = set()
    proyecto_ids: set[str] = set()

    for user_role in roles_activos:
        if user_role.scope_type == IamUserRole.SCOPE_GLOBAL:
            is_global = True
        elif user_role.scope_type == IamUserRole.SCOPE_SOCIEDAD and user_role.scope_id != "*":
            sociedad_rfcs.add(user_role.scope_id)
        elif user_role.scope_type == IamUserRole.SCOPE_PROYECTO and user_role.scope_id != "*":
            proyecto_ids.add(user_role.scope_id)

    return {
        "is_global": is_global,
        "sociedad_rfcs": sorted(sociedad_rfcs),
        "proyecto_ids": sorted(proyecto_ids),
        "centro_ids": [],  # TODO: iam_user_centro_access, sin modelo todavia
        "contrato_ids": [],  # TODO: iam_user_contrato_access, sin modelo todavia
        "identity_user_id": None,  # TODO: alcance IDENTIDAD (ej. EMPLEADO_SELF)
    }
