from cumbresbi_scope import EffectiveScope


def test_from_claims_full():
    scope = EffectiveScope.from_claims(
        {
            "is_global": False,
            "sociedad_rfcs": ["ABC123456XYZ"],
            "proyecto_ids": ["P1", "P2"],
            "centro_ids": ["C1"],
            "contrato_ids": ["K1"],
            "identity_user_id": "u1",
        }
    )
    assert scope.is_global is False
    assert scope.sociedad_rfcs == ("ABC123456XYZ",)
    assert scope.proyecto_ids == ("P1", "P2")
    assert scope.centro_ids == ("C1",)
    assert scope.contrato_ids == ("K1",)
    assert scope.identity_user_id == "u1"


def test_from_claims_missing_keys_default_to_empty():
    scope = EffectiveScope.from_claims({})
    assert scope.is_global is False
    assert scope.sociedad_rfcs == ()
    assert scope.proyecto_ids == ()
    assert scope.centro_ids == ()
    assert scope.contrato_ids == ()
    assert scope.identity_user_id is None


def test_from_claims_null_lists_become_empty_tuple():
    # Un claim JWT puede traer explicitamente null en vez de omitir la clave.
    scope = EffectiveScope.from_claims({"proyecto_ids": None, "sociedad_rfcs": None})
    assert scope.proyecto_ids == ()
    assert scope.sociedad_rfcs == ()


def test_from_claims_preserves_is_global_true():
    scope = EffectiveScope.from_claims({"is_global": True, "sociedad_rfcs": ["X"]})
    assert scope.is_global is True


def test_anonymous_has_no_access_on_any_dimension():
    scope = EffectiveScope.anonymous()
    assert scope.is_global is False
    assert not any(
        [
            scope.sociedad_rfcs,
            scope.proyecto_ids,
            scope.centro_ids,
            scope.contrato_ids,
            scope.identity_user_id,
        ]
    )
