from django.db import models


class ScopedQuerySet(models.QuerySet):
    """Aplica el filtro de alcance segun los SCOPE_FIELD_* del modelo.

    Un modelo que quiera RLS declara en su Meta (o directo en la clase) los
    nombres de campo que corresponden a cada dimension, ej.:

        class TesoreriaContrato(ScopedModelMixin, models.Model):
            SCOPE_FIELD_SOCIEDAD = "sociedad_rfc"
            SCOPE_FIELD_PROYECTO = "proyecto_id"
            objects = ScopedManager()

    Dimensiones no declaradas (None) se ignoran. GLOBAL nunca filtra.
    IDENTIDAD (SCOPE_FIELD_IDENTITY) es una igualdad directa contra
    identity_user_id, no jerarquica - ver roles-y-permisos.md sec. 1.

    31/Ago/2026 (pedido de Mariana: caso real de un colaborador externo
    con Sociedad Y Proyecto asignados a la vez, ej. una abogada externa
    acotada a un proyecto especifico dentro de una sociedad) - cuando el
    scope trae DOS O MAS dimensiones con valor a la vez (ej. sociedad_rfcs
    y proyecto_ids ambos no vacios) Y el modelo declara mas de una de esas
    dimensiones, se combinan por INTERSECCION (AND): una fila debe
    matchear TODAS las dimensiones presentes, no solo alguna. Cuando el
    scope solo trae UNA dimension con valor (el caso normal - la enorme
    mayoria de roles hoy, ej. FINANZAS_MANAGER solo con sociedad_rfcs),
    el comportamiento sigue siendo el de siempre: esa unica dimension
    filtra sola, sin AND con nada (no hay nada mas con que intersectar).
    Esto ademas alinea el codigo con roles-y-permisos.md sec. 4, que ya
    documentaba el ejemplo "Participante de Ticket" (identity_user_id +
    proyecto_ids) como AND ("asignado_a = 'u123' AND id_subproyecto IN
    (...)") - antes el codigo lo hacia OR, en contra de su propia
    documentacion.
    """

    def for_scope(self, scope):
        model = self.model
        if scope is None or not scope.is_global and not any(
            [scope.sociedad_rfcs, scope.proyecto_ids, scope.centro_ids, scope.contrato_ids, scope.identity_user_id]
        ):
            return self.none()

        if scope.is_global:
            return self

        # Cada tupla es (nombre_de_campo_declarado_por_el_modelo, lookup).
        # Solo se agregan las dimensiones que el modelo SI declara Y que el
        # scope SI trae con valor - las demas se ignoran, igual que antes.
        dimensiones = []

        field_sociedad = getattr(model, "SCOPE_FIELD_SOCIEDAD", None)
        if field_sociedad and scope.sociedad_rfcs:
            dimensiones.append(models.Q(**{f"{field_sociedad}__in": scope.sociedad_rfcs}))

        field_proyecto = getattr(model, "SCOPE_FIELD_PROYECTO", None)
        if field_proyecto and scope.proyecto_ids:
            dimensiones.append(models.Q(**{f"{field_proyecto}__in": scope.proyecto_ids}))

        field_centro = getattr(model, "SCOPE_FIELD_CENTRO", None)
        if field_centro and scope.centro_ids:
            dimensiones.append(models.Q(**{f"{field_centro}__in": scope.centro_ids}))

        field_contrato = getattr(model, "SCOPE_FIELD_CONTRATO", None)
        if field_contrato and scope.contrato_ids:
            dimensiones.append(models.Q(**{f"{field_contrato}__in": scope.contrato_ids}))

        field_identity = getattr(model, "SCOPE_FIELD_IDENTITY", None)
        if field_identity and scope.identity_user_id:
            dimensiones.append(models.Q(**{field_identity: scope.identity_user_id}))

        if not dimensiones:
            # El modelo no declaro ningun SCOPE_FIELD_* que aplique a este
            # scope - negar por defecto (fail-closed), no fail-open.
            return self.none()

        if len(dimensiones) == 1:
            return self.filter(dimensiones[0])

        # 2+ dimensiones presentes a la vez: AND, no OR (ver docstring).
        filters = dimensiones[0]
        for dimension in dimensiones[1:]:
            filters &= dimension
        return self.filter(filters)


class ScopedManager(models.Manager.from_queryset(ScopedQuerySet)):
    pass


class ScopedModelMixin(models.Model):
    """Mixin de conveniencia - no obligatorio, ScopedManager funciona solo."""

    objects = ScopedManager()

    class Meta:
        abstract = True
