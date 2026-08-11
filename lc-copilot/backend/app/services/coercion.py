"""Pure coercion of model output into catalogue-legal field values.

Kept dependency-free and separate from extraction so it can be reasoned
about and tested on its own. Anything this module returns None for never
reaches the form.
"""
from ..catalogue import FIELD_MAP


def coerce_value(key: str, value) -> str | None:
    spec = FIELD_MAP.get(key)
    if spec is None or value in (None, ""):
        return None
    text = str(value).strip()
    if not text:
        return None
    if spec["type"] == "select" and spec.get("options"):
        return next((o for o in spec["options"] if o.upper() == text.upper()), None)
    if spec["type"] == "num":
        cleaned = text.replace(",", "")
        try:
            float(cleaned)
        except ValueError:
            return None
        return cleaned
    return text
