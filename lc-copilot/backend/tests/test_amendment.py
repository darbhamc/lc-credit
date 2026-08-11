from app.services.amendment import _diff, local_fallback
from app.services.coercion import coerce_value


def test_unknown_field_is_dropped(base_credit):
    assert _diff(base_credit, "notAField", "X", "", 1.0) is None


def test_select_field_rejects_value_outside_options(base_credit):
    assert _diff(base_credit, "partial", "MAYBE", "", 1.0) is None


def test_select_field_accepts_listed_option(base_credit):
    diff = _diff(base_credit, "partial", "allowed", "", 1.0)
    assert diff["new_value"] == "ALLOWED"


def test_no_op_change_produces_no_diff(base_credit):
    assert _diff(base_credit, "currency", base_credit["currency"], "", 1.0) is None


def test_numeric_coercion_strips_separators():
    assert coerce_value("amount", "2,400,000") == "2400000"


def test_fallback_reads_amount_and_currency(base_credit):
    changes = local_fallback(base_credit, "set the amount to EUR 2.4 million")
    keys = {c["key"]: c["new_value"] for c in changes}
    assert keys["currency"] == "EUR"
    assert keys["amount"] == "2400000"


def test_fallback_shifts_shipment_date(base_credit):
    changes = local_fallback(base_credit, "push the latest shipment date out by 30 days")
    shift = next(c for c in changes if c["key"] == "latestShip")
    assert shift["new_value"] == "2025-10-20"


def test_fallback_reads_partial_shipment_prohibition(base_credit):
    base_credit["partial"] = "ALLOWED"
    changes = local_fallback(base_credit, "make partial shipments not allowed")
    assert any(c["key"] == "partial" and c["new_value"] == "NOT ALLOWED" for c in changes)
