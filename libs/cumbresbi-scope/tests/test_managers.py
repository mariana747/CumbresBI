import pytest

from cumbresbi_scope import EffectiveScope

from .testapp.models import DummyIdentityScoped, DummyScoped, DummyUnscoped

pytestmark = pytest.mark.django_db


def test_global_scope_returns_everything_unfiltered():
    DummyScoped.objects.create(sociedad_rfc="A")
    DummyScoped.objects.create(sociedad_rfc="B")
    scope = EffectiveScope(is_global=True)
    assert DummyScoped.objects.for_scope(scope).count() == 2


def test_anonymous_scope_returns_nothing():
    DummyScoped.objects.create(sociedad_rfc="A")
    scope = EffectiveScope.anonymous()
    assert DummyScoped.objects.for_scope(scope).count() == 0


def test_sociedad_filters_to_matching_rows_only():
    a = DummyScoped.objects.create(sociedad_rfc="A")
    DummyScoped.objects.create(sociedad_rfc="B")
    scope = EffectiveScope(sociedad_rfcs=("A",))
    assert list(DummyScoped.objects.for_scope(scope)) == [a]


def test_dimensions_combine_as_union_not_intersection():
    # roles-y-permisos.md sec. 4: los claims de distintos roles se agregan por
    # UNION - un registro que matchea por PROYECTO debe aparecer aunque no
    # matchee por SOCIEDAD, y viceversa.
    by_sociedad = DummyScoped.objects.create(sociedad_rfc="A", proyecto_id="P9")
    by_proyecto = DummyScoped.objects.create(sociedad_rfc="Z", proyecto_id="P1")
    DummyScoped.objects.create(sociedad_rfc="Z", proyecto_id="P9")  # no matchea ninguno

    scope = EffectiveScope(sociedad_rfcs=("A",), proyecto_ids=("P1",))
    result = set(DummyScoped.objects.for_scope(scope))
    assert result == {by_sociedad, by_proyecto}


def test_identity_scope_matches_only_the_owner():
    mine = DummyIdentityScoped.objects.create(owner_user_id="u1")
    DummyIdentityScoped.objects.create(owner_user_id="u2")
    scope = EffectiveScope(identity_user_id="u1")
    assert list(DummyIdentityScoped.objects.for_scope(scope)) == [mine]


def test_model_without_any_matching_scope_field_fails_closed():
    # DummyUnscoped no declara ningun SCOPE_FIELD_* - un scope no vacio no
    # debe filtrar "sin restriccion" por accidente, debe negar todo.
    DummyUnscoped.objects.create(nombre="x")
    scope = EffectiveScope(sociedad_rfcs=("A",))
    assert DummyUnscoped.objects.for_scope(scope).count() == 0


def test_scope_dimension_not_declared_on_model_is_ignored_not_matched():
    # Regresion clave: si el scope trae identity_user_id pero el modelo solo
    # declara SCOPE_FIELD_SOCIEDAD, no debe devolver todas las filas por
    # "matchear accidentalmente" - debe fail-closed (none()), no fail-open.
    DummyScoped.objects.create(sociedad_rfc="A")
    scope = EffectiveScope(identity_user_id="u1")
    assert DummyScoped.objects.for_scope(scope).count() == 0
