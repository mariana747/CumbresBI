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

    @classmethod
    def from_claims(cls, claims: dict) -> "EffectiveScope":
        return cls(
            is_global=bool(claims.get("is_global", False)),
            sociedad_rfcs=tuple(claims.get("sociedad_rfcs", []) or []),
            proyecto_ids=tuple(claims.get("proyecto_ids", []) or []),
            centro_ids=tuple(claims.get("centro_ids", []) or []),
            contrato_ids=tuple(claims.get("contrato_ids", []) or []),
            identity_user_id=claims.get("identity_user_id"),
        )

    @classmethod
    def anonymous(cls) -> "EffectiveScope":
        """Alcance vacio: sin JWT valido, no ve nada (ScopedQuerySet.none())."""
        return cls()
