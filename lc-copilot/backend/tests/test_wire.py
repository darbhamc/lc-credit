from app.services.wire import to_mt700


def test_amount_uses_swift_decimal_comma(base_credit):
    assert ":32B:USD3240000,00" in to_mt700(base_credit)


def test_zero_decimal_currency_keeps_trailing_comma(base_credit):
    base_credit["currency"] = "JPY"
    base_credit["amount"] = "184000000"
    assert ":32B:JPY184000000," in to_mt700(base_credit)


def test_dates_render_as_yymmdd(base_credit):
    assert ":31C:250422" in to_mt700(base_credit)


def test_tolerance_renders_as_padded_pair(base_credit):
    base_credit["tolPlus"] = "5"
    base_credit["tolMinus"] = "5"
    assert ":39A:05/05" in to_mt700(base_credit)


def test_charges_use_tag_71d(base_credit):
    assert ":71D:" in to_mt700(base_credit)


def test_empty_fields_are_omitted(base_credit):
    base_credit["senderInfo"] = ""
    assert ":72Z:" not in to_mt700(base_credit)
