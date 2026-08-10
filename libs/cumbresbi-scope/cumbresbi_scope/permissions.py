from rest_framework.permissions import BasePermission


def require_permission(perm_key: str):
    """Factory de permiso de DRF: bloquea una accion de escritura si el
    usuario no tiene ese perm_key exacto en su EffectiveScope (union de
    permisos de sus roles activos - ver scope.py, EffectiveScope.perm_keys/
    has_permission y roles-y-permisos.md sec. 3, la matriz de permisos).

    Es una fabrica (no una clase directa) porque DRF instancia cada
    permission_class sin argumentos (`Klass()`); parametrizar el perm_key
    requiere generar una subclase nueva por cada llamada.

    Uso tipico (una sola linea por accion de escritura):

        def get_permissions(self):
            if self.action == "create":
                return [require_permission("iam.crear")()]
            if self.action == "aprobar":
                return [require_permission("pld-compliance.aprobar")()]
            return super().get_permissions()

    Fail-closed: sin effective_scope (anonimo/token invalido) o sin el
    permiso exacto, deniega (403) - no existe bypass automatico por
    is_global, un rol GLOBAL igual necesita tener el perm_key asignado en
    iam_role_permissions (asi ya viene SUPER_ADMIN sembrado, ver
    0004_seed_permisos_matriz.py). Esto es "puede hacer esta ACCION", una
    pregunta distinta de "puede ver este DATO" (eso es ScopedManager).
    """

    class _RequirePermission(BasePermission):
        message = f"No tienes el permiso '{perm_key}' para hacer esto."

        def has_permission(self, request, view):
            scope = getattr(request, "effective_scope", None)
            return scope is not None and scope.has_permission(perm_key)

    _RequirePermission.__name__ = f"RequirePermission_{perm_key.replace('.', '_').replace('-', '_')}"
    return _RequirePermission
