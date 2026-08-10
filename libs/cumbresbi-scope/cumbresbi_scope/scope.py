from dataclasses import dataclass, field


@dataclass(frozen=True)
class EffectiveScope:
    """Alcance efectivo de un usuario autenticado, agregado por iam-service.

    Ver docs/architecture/README.md sec. 8 y roles-y-permisos.md sec. 4: si el
    usuario tiene varios roles activos, cada claim es la UNION de lo que aporta
    cada rol (no la interseccion), y is_global=True de cualquier rol domina
    sobre el resto. CENTRO/CONTRATO son grants planos, no jerarquicos (gap
    documentado en roles-y-permisos.md sec. 5 punto 5).
    identity_user_id: alcance por IDENTIDAD (self-service, ej. EMPLEADO_SELF) -
    no es jerarquico, es "este registro me pertenece a mi" (roles-y-permisos.md
    sec. 1).
    """

    is_global: bool = False
    sociedad_rfcs: tuple = field(default_factory=tuple)
    proyecto_ids: tuple = field(default_factory=tuple)
    centro_ids: tuple = field(default_factory=tuple)
    contrato_ids: tuple = field(default_factory=tuple)
    identity_user_id: str | None = None
    # role_keys: claves de los roles activos del usuario (union, igual que el
    # resto de los claims). No se usa para el filtrado por ScopedManager
    # (eso es solo sociedad/proyecto/centro/contrato/identidad) - sirve para
    # el puñado de vistas que necesitan gate por rol en vez de por fila, ej.
    # BitacoraAuditoriaViewSet (solo GLOBAL o rol AUDITOR).
    role_keys: tuple = field(default_factory=tuple)
    # perm_keys: union de los perm_key (ej. "iam.crear", "pld-compliance.aprobar"
    # - formato "{servicio}.{accion}", ver iam-service/iam/migrations/
    # 0004_seed_permisos_matriz.py) de todos los roles activos del usuario.
    # Es la pieza que faltaba para "cumplimiento real de permisos en
    # escritura" (roles-y-permisos.md sec. 3, la matriz de permisos): antes
    # solo se controlaba QUE VE cada quien (ScopedManager); esto controla
    # QUE PUEDE HACER, via has_permission() + cumbresbi_scope.permissions.
    perm_keys: tuple = field(default_factory=tuple)

    @classmethod
    def from_claims(cls, claims: dict) -> "EffectiveScope":
        return cls(
            is_global=bool(claims.get("is_global", False)),
            sociedad_rfcs=tuple(claims.get("sociedad_rfcs", []) or []),
            proyecto_ids=tuple(claims.get("proyecto_ids", []) or []),
            centro_ids=tuple(claims.get("centro_ids", []) or []),
            contrato_ids=tuple(claims.get("contrato_ids", []) or []),
            identity_user_id=claims.get("identity_user_id"),
            role_keys=tuple(claims.get("role_keys", []) or []),
            perm_keys=tuple(claims.get("perm_keys", []) or []),
        )

    def has_role(self, role_key: str) -> bool:
        return role_key in self.role_keys

    def has_permission(self, perm_key: str) -> bool:
        return perm_key in self.perm_keys

    @classmethod
    def anonymous(cls) -> "EffectiveScope":
        """Alcance vacio: sin JWT valido, no ve nada (ScopedQuerySet.none())."""
        return cls()
