"""UCP 600 / MT700 consistency rules.

This is the authority. The frontend mirrors these rules for instant
feedback, but nothing is submitted without passing through here.
"""
import re
from datetime import date, datetime

from ..catalogue import FIELDS

SWIFT_X = re.compile(r"[^A-Za-z0-9/\-?:().,'+ \n]")
FREE_TEXT = [
    "goodsDesc", "docsRequired", "addlConditions",
    "instructions", "charges", "senderInfo",
]
ZERO_DECIMAL_CURRENCIES = {"JPY", "KRW", "VND", "CLP", "ISK"}


def _d(value) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _s(fields: dict, key: str) -> str:
    return str(fields.get(key) or "").strip()


def validate(fields: dict) -> tuple[dict, dict]:
    errors: dict[str, str] = {}
    warnings: dict[str, str] = {}

    for f in FIELDS:
        if f.get("required") and not _s(fields, f["key"]):
            errors[f["key"]] = "Required to submit"

    issue = _d(fields.get("issueDate"))
    expiry = _d(fields.get("expiryDate"))
    ship = _d(fields.get("latestShip"))

    if issue and expiry and expiry <= issue:
        errors["expiryDate"] = "Expiry must fall after the issue date"
    if ship and expiry and ship > expiry:
        errors["latestShip"] = "Latest shipment cannot fall after expiry"

    # 44C and 44D are mutually exclusive
    if _s(fields, "latestShip") and _s(fields, "shipPeriod"):
        errors["latestShip"] = "44C and 44D are mutually exclusive - keep one"
        errors["shipPeriod"] = "44C and 44D are mutually exclusive - keep one"
    if not _s(fields, "latestShip") and not _s(fields, "shipPeriod"):
        warnings["latestShip"] = "Set either a latest shipment date or a shipment period"

    # 39B cannot coexist with a 39A tolerance
    if _s(fields, "maxAmount") and (_s(fields, "tolPlus") or _s(fields, "tolMinus")):
        errors["maxAmount"] = "39B cannot coexist with a 39A tolerance"

    availability = _s(fields, "availableBy")
    if availability == "BY DEF PAYMENT" and not _s(fields, "deferredDetails"):
        errors["deferredDetails"] = "Required when the credit is available by deferred payment"
    if availability in {"BY ACCEPTANCE", "BY NEGOTIATION"}:
        if not _s(fields, "draftsAt"):
            errors["draftsAt"] = "Required for acceptance or negotiation credits"
        if not _s(fields, "drawee"):
            errors["drawee"] = "Required for acceptance or negotiation credits"

    presentation = _s(fields, "presentation")
    if ship and expiry and presentation.isdigit():
        window = (expiry - ship).days
        if int(presentation) > window:
            errors["presentation"] = f"Only {window} days between shipment and expiry"

    amount = _s(fields, "amount").replace(",", "")
    currency = _s(fields, "currency")
    if amount:
        try:
            if float(amount) <= 0:
                errors["amount"] = "Enter a positive amount"
        except ValueError:
            errors["amount"] = "Enter a positive amount"
        if currency in ZERO_DECIMAL_CURRENCIES and "." in amount:
            errors["amount"] = f"{currency} has no minor units"

    for key in ("tolPlus", "tolMinus"):
        raw = _s(fields, key)
        if raw:
            try:
                if not 0 <= float(raw) <= 100:
                    errors[key] = "0-100"
            except ValueError:
                errors[key] = "0-100"

    for key in FREE_TEXT:
        value = _s(fields, key)
        if value and SWIFT_X.search(value):
            warnings[key] = "Contains characters outside the SWIFT X character set"

    return errors, warnings
