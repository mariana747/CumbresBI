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

from .models import IamUserCentroAccess, IamUserContratoAccess, IamUserRole


def compute_effective_scope_claims(user) -> dict:
    roles_activos = IamUserRole.objects.filter(user=user, revoked_at__isnull=True).select_related(
        "role"
    ).prefetch_related("role__role_permissions__permission")

    is_global = False
    sociedad_rfcs: set[str] = set()
    proyecto_ids: set[str] = set()
    role_keys: set[str] = set()
    # Union de perm_key ("iam.crear", "pld-compliance.aprobar", etc. - ver
    # 0004_seed_permisos_matriz.py) de TODOS los roles activos, igual
    # criterio que el resto de los claims (roles-y-permisos.md sec. 4: "los
    # permisos tambien se agregan por union"). Esto es lo que consume
    # cumbresbi_scope.permissions.require_permission() para bloquear
    # escritura - antes no existia, cualquiera con sesion podia escribir.
    perm_keys: set[str] = set()

    for user_role in roles_activos:
        role_keys.add(user_role.role.role_key)
        for role_permission in user_role.role.role_permissions.all():
            perm_keys.add(role_permission.permission.perm_key)
        if user_role.scope_type == IamUserRole.SCOPE_GLOBAL:
            is_global = True
        elif user_role.scope_type == IamUserRole.SCOPE_SOCIEDAD and user_role.scope_id != "*":
            sociedad_rfcs.add(user_role.scope_id)
        elif user_role.scope_type == IamUserRole.SCOPE_PROYECTO and user_role.scope_id != "*":
            proyecto_ids.add(user_role.scope_id)

    # CENTRO/CONTRATO son grants planos, no vienen de iam_user_roles (ver
    # roles-y-permisos.md sec. 1) - viven en su propia tabla,
    # usuario-por-usuario, ya conectados (antes quedaban vacios a fuerza).
    centro_ids = IamUserCentroAccess.objects.filter(
        user=user, revoked_at__isnull=True
    ).values_list("centro_id", flat=True)
    contrato_ids = IamUserContratoAccess.objects.filter(
        user=user, revoked_at__isnull=True
    ).values_list("id_contrato", flat=True)

    return {
        "is_global": is_global,
        "sociedad_rfcs": sorted(sociedad_rfcs),
        "proyecto_ids": sorted(proyecto_ids),
        "centro_ids": sorted(centro_ids),
        "contrato_ids": sorted(contrato_ids),
        # Alcance IDENTIDAD (self-service, ej. EMPLEADO_SELF/MiCumbres) - es
        # simplemente "quien esta autenticado", no depende de que tenga
        # ningun rol asignado (a diferencia de is_global/sociedad_rfcs/etc,
        # que si vienen de iam_user_roles). Antes quedaba en None a fuerza
        # (TODO sin resolver) - eso tumbaba cualquier gate de self-service
        # real para TODOS los usuarios, con o sin roles (hallazgo 27/Ago/2026
        # al construir TesoreriaTicketReembolsoViewSet._EsEmpleadoAutenticado,
        # el primer consumidor real de este campo).
        "identity_user_id": user.user_id,
        "role_keys": sorted(role_keys),
        "perm_keys": sorted(perm_keys),
    }
