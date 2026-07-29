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
    """

    def for_scope(self, scope):
        model = self.model
        if scope is None or not scope.is_global and not any(
            [scope.sociedad_rfcs, scope.proyecto_ids, scope.centro_ids, scope.contrato_ids, scope.identity_user_id]
        ):
            return self.none()

        if scope.is_global:
            return self

        filters = models.Q()
        matched_any = False

        field_sociedad = getattr(model, "SCOPE_FIELD_SOCIEDAD", None)
        if field_sociedad and scope.sociedad_rfcs:
            filters |= models.Q(**{f"{field_sociedad}__in": scope.sociedad_rfcs})
            matched_any = True

        field_proyecto = getattr(model, "SCOPE_FIELD_PROYECTO", None)
        if field_proyecto and scope.proyecto_ids:
            filters |= models.Q(**{f"{field_proyecto}__in": scope.proyecto_ids})
            matched_any = True

        field_centro = getattr(model, "SCOPE_FIELD_CENTRO", None)
        if field_centro and scope.centro_ids:
            filters |= models.Q(**{f"{field_centro}__in": scope.centro_ids})
            matched_any = True

        field_contrato = getattr(model, "SCOPE_FIELD_CONTRATO", None)
        if field_contrato and scope.contrato_ids:
            filters |= models.Q(**{f"{field_contrato}__in": scope.contrato_ids})
            matched_any = True

        field_identity = getattr(model, "SCOPE_FIELD_IDENTITY", None)
        if field_identity and scope.identity_user_id:
            filters |= models.Q(**{field_identity: scope.identity_user_id})
            matched_any = True

        if not matched_any:
            # El modelo no declaro ningun SCOPE_FIELD_* que aplique a este
            # scope - negar por defecto (fail-closed), no fail-open.
            return self.none()

        return self.filter(filters)


class ScopedManager(models.Manager.from_queryset(ScopedQuerySet)):
    pass


class ScopedModelMixin(models.Model):
    """Mixin de conveniencia - no obligatorio, ScopedManager funciona solo."""

    objects = ScopedManager()

    class Meta:
        abstract = True
