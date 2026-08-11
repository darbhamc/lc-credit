from app.services.validation import validate


def test_seeded_credit_validates(base_credit):
    errors, _ = validate(base_credit)
    assert errors == {}, errors


def test_expiry_must_follow_issue(base_credit):
    base_credit["expiryDate"] = base_credit["issueDate"]
    errors, _ = validate(base_credit)
    assert "expiryDate" in errors


def test_shipment_cannot_follow_expiry(base_credit):
    base_credit["latestShip"] = "2099-01-01"
    errors, _ = validate(base_credit)
    assert "latestShip" in errors


def test_44c_and_44d_are_mutually_exclusive(base_credit):
    base_credit["shipPeriod"] = "SHIPMENT DURING SEPTEMBER 2025"
    errors, _ = validate(base_credit)
    assert "latestShip" in errors and "shipPeriod" in errors


def test_39b_excludes_39a_tolerance(base_credit):
    base_credit["maxAmount"] = "NOT EXCEEDING"
    errors, _ = validate(base_credit)
    assert "maxAmount" in errors


def test_deferred_payment_requires_details(base_credit):
    base_credit["availableBy"] = "BY DEF PAYMENT"
    base_credit["deferredDetails"] = ""
    errors, _ = validate(base_credit)
    assert "deferredDetails" in errors


def test_negotiation_requires_drafts_and_drawee(base_credit):
    base_credit["availableBy"] = "BY NEGOTIATION"
    base_credit["draftsAt"] = ""
    base_credit["drawee"] = ""
    errors, _ = validate(base_credit)
    assert "draftsAt" in errors and "drawee" in errors


def test_presentation_window_cannot_exceed_shipment_to_expiry(base_credit):
    base_credit["presentation"] = "365"
    errors, _ = validate(base_credit)
    assert "presentation" in errors


def test_zero_decimal_currency_rejects_minor_units(base_credit):
    base_credit["currency"] = "JPY"
    base_credit["amount"] = "1000.50"
    errors, _ = validate(base_credit)
    assert "amount" in errors


def test_non_swift_characters_warn_but_do_not_block(base_credit):
    base_credit["goodsDesc"] = "VALVES @ 20 PCT DISCOUNT"
    errors, warnings = validate(base_credit)
    assert "goodsDesc" in warnings
    assert "goodsDesc" not in errors
