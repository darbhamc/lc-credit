"""Single source of truth for the MT700 field catalogue.

The same JSON drives the React form, so a field can never exist on one
side of the wire and not the other.
"""
import json

from .config import SHARED

_data = json.loads((SHARED / "field-catalogue.json").read_text())

SECTIONS = _data["sections"]
FIELDS = _data["fields"]
FIELD_MAP = {f["key"]: f for f in FIELDS}
FIELD_KEYS = set(FIELD_MAP)
REQUIRED_KEYS = [f["key"] for f in FIELDS if f.get("required")]


def prompt_catalogue() -> str:
    """Compact catalogue string handed to the model."""
    parts = []
    for f in FIELDS:
        line = f"{f['key']} (:{f['tag']}: {f['label']}) type={f['type']}"
        if f.get("options"):
            line += " one of " + "|".join(f["options"])
        parts.append(line)
    return "; ".join(parts)
