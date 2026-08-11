"""Render an application as an MT700 message."""
from ..catalogue import FIELD_MAP

ZERO_DECIMAL = {"JPY", "KRW", "VND", "CLP", "ISK"}


def _amount(currency: str, amount) -> str:
    raw = str(amount or "").replace(",", "")
    if not raw:
        return ""
    try:
        value = float(raw)
    except ValueError:
        return ""
    text = f"{value:.0f}," if currency in ZERO_DECIMAL else f"{value:.2f}".replace(".", ",")
    return f"{currency}{text}"


def _swift_date(value) -> str:
    return str(value or "")[2:].replace("-", "")


def to_mt700(f: dict) -> str:
    lines: list[str] = []

    def put(tag: str, value) -> None:
        text = str(value or "").strip()
        if text:
            lines.append(f":{tag}:{text.upper()}")

    put("27", f.get("seq"))
    put("40A", f.get("form"))
    put("20", f.get("dcNumber") or "PENDING ISSUE")
    put("31C", _swift_date(f.get("issueDate")))
    put("40E", f.get("rules"))
    expiry = f"{_swift_date(f.get('expiryDate'))}\n{f.get('expiryPlace') or ''}".strip()
    put("31D", expiry)
    put("50", f.get("applicant"))
    put("59", f.get("beneficiary"))
    put("32B", _amount(str(f.get("currency") or ""), f.get("amount")))
    if f.get("tolPlus") or f.get("tolMinus"):
        plus = str(f.get("tolPlus") or 0).zfill(2)
        minus = str(f.get("tolMinus") or 0).zfill(2)
        put("39A", f"{plus}/{minus}")
    put("39B", f.get("maxAmount"))
    put("39C", f.get("addlAmounts"))
    available = f"{f.get('availableWith') or ''}\n{f.get('availableBy') or ''}".strip()
    put("41A", available)
    put("42C", f.get("draftsAt"))
    put("42A", f.get("drawee"))
    put("42P", f.get("deferredDetails"))
    put("43P", f.get("partial"))
    put("43T", f.get("transhipment"))
    put("44A", f.get("takingCharge"))
    put("44E", f.get("portLoading"))
    put("44F", f.get("portDischarge"))
    put("44B", f.get("finalDest"))
    put("44C", _swift_date(f.get("latestShip")))
    put("44D", f.get("shipPeriod"))
    put("45A", f.get("goodsDesc"))
    put("46A", f.get("docsRequired"))
    put("47A", f.get("addlConditions"))
    put("71D", f.get("charges"))
    if str(f.get("presentation") or "").strip():
        put(
            "48",
            f"{f['presentation']} DAYS AFTER THE DATE OF SHIPMENT "
            "BUT WITHIN THE VALIDITY OF THE CREDIT",
        )
    put("49", f.get("confirmation"))
    put("53A", f.get("reimbursing"))
    put("78", f.get("instructions"))
    put("57A", f.get("adviseThrough"))
    put("72Z", f.get("senderInfo"))
    return "\n".join(lines)


def describe(key: str) -> tuple[str, str]:
    field = FIELD_MAP.get(key, {})
    return field.get("tag", ""), field.get("label", key)
