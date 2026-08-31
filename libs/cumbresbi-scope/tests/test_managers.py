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


def test_una_sola_dimension_presente_filtra_sola_sin_and():
    # Caso normal, la enorme mayoria de roles hoy (ej. FINANZAS_MANAGER
    # solo con sociedad_rfcs) - una sola dimension presente no tiene nada
    # con que hacer AND, filtra igual que siempre.
    a = DummyScoped.objects.create(sociedad_rfc="A", proyecto_id="P9")
    DummyScoped.objects.create(sociedad_rfc="B", proyecto_id="P9")
    scope = EffectiveScope(sociedad_rfcs=("A",))
    assert list(DummyScoped.objects.for_scope(scope)) == [a]


def test_dos_dimensiones_presentes_combinan_por_interseccion():
    # 31/Ago/2026 (pedido de Mariana, caso real de colaborador externo con
    # Sociedad Y Proyecto asignados a la vez): cuando el scope trae DOS
    # dimensiones con valor simultaneamente, deben combinarse por AND, no
    # por OR - un registro debe matchear las dos, no solo una. Antes de
    # este cambio, este mismo escenario regresaba las 2 filas "sueltas"
    # (union); ahora solo regresa la que matchea ambas a la vez.
    matchea_ambas = DummyScoped.objects.create(sociedad_rfc="A", proyecto_id="P1")
    solo_sociedad = DummyScoped.objects.create(sociedad_rfc="A", proyecto_id="P9")
    solo_proyecto = DummyScoped.objects.create(sociedad_rfc="Z", proyecto_id="P1")
    DummyScoped.objects.create(sociedad_rfc="Z", proyecto_id="P9")  # no matchea ninguna

    scope = EffectiveScope(sociedad_rfcs=("A",), proyecto_ids=("P1",))
    result = list(DummyScoped.objects.for_scope(scope))
    assert result == [matchea_ambas]
    assert solo_sociedad not in result
    assert solo_proyecto not in result


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
