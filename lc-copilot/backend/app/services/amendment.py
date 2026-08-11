"""Turn a natural-language instruction into field-level diffs.

The model decides WHAT changes. This module decides whether the change is
legal, coerces it to the declared type, and computes the diff. One batch
means an in-place amendment; several batches mean the user asked for
variants.

A deterministic fallback parser covers the common instructions so the form
keeps working when the model is unreachable.
"""
import re
from datetime import datetime, timedelta

from ..catalogue import FIELD_MAP, prompt_catalogue
from .coercion import coerce_value
from .llm import LLMUnavailable, complete, parse_json

AMEND_PROMPT = """You amend documentary credit applications (SWIFT MT700, UCP 600).
You never write prose into fields.

FIELD CATALOGUE: {catalogue}

CURRENT CREDIT (JSON): {current}

USER INSTRUCTION: "{instruction}"

If the user asks for several credits or variants, return one batch per
credit. Otherwise return exactly one batch.

Rules: include only fields that actually change; dates YYYY-MM-DD; amounts
digits only; select fields must use a listed option; free text uppercase;
compute relative dates from the current values above.

Return ONLY JSON, no prose and no code fences:
{{"reply":"one short sentence","batches":[{{"name":"short name",
"summary":"what differs from the base","changes":[{{"key":"fieldKey",
"to":"value","why":"short reason","confidence":0.0-1.0}}]}}]}}"""

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def _diff(current: dict, key: str, new_value, why: str, confidence: float) -> dict | None:
    coerced = coerce_value(key, new_value)
    if coerced is None:
        return None
    old = str(current.get(key) or "")
    if coerced == old:
        return None
    spec = FIELD_MAP[key]
    return {
        "key": key,
        "tag": spec["tag"],
        "label": spec["label"],
        "old_value": old,
        "new_value": coerced,
        "rationale": why,
        "confidence": confidence,
    }


def local_fallback(current: dict, instruction: str) -> list[dict]:
    """Rule-based cover for the most common amendments."""
    text = instruction.lower()
    changes: list[dict] = []

    def add(key, value, why):
        d = _diff(current, key, value, why, 0.6)
        if d:
            changes.append(d)

    currency = re.search(r"\b(usd|eur|gbp|jpy|sgd|aed|inr|chf|aud|cny)\b", text)
    if currency:
        add("currency", currency.group(1).upper(), "Currency named in the instruction")

    amount = re.search(
        r"(?:amount|value)[^0-9]{0,20}([0-9][0-9,.]*)\s*(k|m|million|thousand)?", text
    )
    if amount:
        value = float(amount.group(1).replace(",", ""))
        unit = amount.group(2) or ""
        if unit in ("m", "million"):
            value *= 1_000_000
        elif unit in ("k", "thousand"):
            value *= 1_000
        add("amount", f"{value:.0f}", "Amount named in the instruction")

    if "partial" in text:
        allowed = not re.search(r"not allow|disallow|no partial", text)
        add("partial", "ALLOWED" if allowed else "NOT ALLOWED", "Partial shipment terms named")

    if "transhipment" in text or "transshipment" in text:
        allowed = not re.search(r"not allow|disallow", text)
        add("transhipment", "ALLOWED" if allowed else "NOT ALLOWED", "Transhipment terms named")

    if "confirm" in text:
        if "may add" in text:
            value = "MAY ADD"
        elif re.search(r"without|unconfirm", text):
            value = "WITHOUT"
        else:
            value = "CONFIRM"
        add("confirmation", value, "Confirmation instruction named")

    shift = re.search(r"(?:push|extend|move|bring)[^0-9]{0,60}?(\d{1,3})\s*days?", text)
    if shift and current.get("latestShip"):
        try:
            base = datetime.strptime(str(current["latestShip"])[:10], "%Y-%m-%d")
            moved = base + timedelta(days=int(shift.group(1)))
            add("latestShip", moved.strftime("%Y-%m-%d"), f"Shifted by {shift.group(1)} days")
        except ValueError:
            pass

    named = re.search(
        r"(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?", text
    )
    if named and "expir" in text:
        year = named.group(3) or str(datetime.utcnow().year)
        month = MONTHS.index(named.group(2).upper()) + 1
        add("expiryDate", f"{year}-{month:02d}-{int(named.group(1)):02d}", "Expiry date named")

    return changes


def amend(current: dict, instruction: str) -> tuple[str, list[dict], bool]:
    """Returns (reply, batches, degraded)."""
    compact = {k: v for k, v in current.items() if str(v or "").strip()}
    try:
        raw = complete(
            AMEND_PROMPT.format(
                catalogue=prompt_catalogue(), current=compact, instruction=instruction
            )
        )
        parsed = parse_json(raw)
    except LLMUnavailable as exc:
        changes = local_fallback(current, instruction)
        if not changes:
            raise
        return (
            f"Copilot unreachable ({exc}). Worked out {len(changes)} change(s) locally.",
            [{"name": "Local amendment", "summary": instruction, "changes": changes}],
            True,
        )

    batches = []
    for index, batch in enumerate(parsed.get("batches") or []):
        changes = []
        for change in batch.get("changes") or []:
            try:
                confidence = float(change.get("confidence", 0.9))
            except (TypeError, ValueError):
                confidence = 0.9
            d = _diff(current, change.get("key"), change.get("to"), change.get("why", ""), confidence)
            if d:
                changes.append(d)
        if changes:
            batches.append(
                {
                    "name": batch.get("name") or f"Variant {index + 1}",
                    "summary": batch.get("summary") or "",
                    "changes": changes,
                }
            )
    return str(parsed.get("reply") or "Proposed changes below."), batches, False
