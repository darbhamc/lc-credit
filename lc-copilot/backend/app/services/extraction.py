"""Pull structured MT700 fields out of a source.

Two implementations behind one call signature:
  DatabaseSource  - a reference to a credit already on file
  DocumentSource  - an uploaded PDF, image, or raw MT700 text

Anything the model returns is filtered against the field catalogue and
coerced to the declared type before it can reach the form.
"""
import base64
from dataclasses import dataclass, field as dc_field

from sqlalchemy.orm import Session

from ..catalogue import prompt_catalogue
from ..models import LCApplication
from .coercion import coerce_value
from .llm import complete, parse_json

CONFIDENCE_FLOOR = 0.75

EXTRACT_PROMPT = """Extract this documentary credit into structured fields.

FIELDS: {catalogue}

Rules: dates as YYYY-MM-DD; amounts digits only with no separators; select
fields must use one of the listed options exactly; multi-line fields keep
their newlines; omit any field the source does not evidence. Never guess.

Return ONLY JSON, no prose and no code fences:
{{"fields":{{key:value}},"confidence":{{key:0.0-1.0}},"note":"one sentence"}}"""


@dataclass
class Extraction:
    fields: dict[str, str] = dc_field(default_factory=dict)
    confidences: dict[str, float] = dc_field(default_factory=dict)
    note: str = ""

    @property
    def low_confidence(self) -> list[str]:
        return [k for k, v in self.confidences.items() if v < CONFIDENCE_FLOOR]


def _clean(raw_fields: dict, raw_conf: dict) -> Extraction:
    out = Extraction()
    for key, value in (raw_fields or {}).items():
        coerced = coerce_value(key, value)
        if coerced is None:
            continue
        out.fields[key] = coerced
        try:
            out.confidences[key] = max(0.0, min(1.0, float((raw_conf or {}).get(key, 0.7))))
        except (TypeError, ValueError):
            out.confidences[key] = 0.7
    out.fields.pop("dcNumber", None)  # a new issue never inherits a credit number
    out.confidences.pop("dcNumber", None)
    return out


class DatabaseSource:
    """Reference an existing credit. Deterministic - no model involved."""

    def __init__(self, reference: str, db: Session):
        self.reference = reference.strip().upper()
        self.db = db

    def extract(self) -> Extraction:
        record = (
            self.db.query(LCApplication)
            .filter(LCApplication.reference == self.reference)
            .one_or_none()
        )
        if record is None:
            raise LookupError(f"No credit on file under {self.reference}")
        out = _clean(record.fields, {k: 1.0 for k in record.fields})
        out.note = f"Loaded {record.reference} - {record.corridor or 'archived credit'}."
        return out


class DocumentSource:
    """Extract from an uploaded file."""

    def __init__(self, filename: str, media_type: str, payload: bytes):
        self.filename = filename
        self.media_type = media_type or "application/octet-stream"
        self.payload = payload

    def _content_block(self):
        if self.media_type.startswith("text/") or self.filename.lower().endswith(
            (".txt", ".mt700", ".swift")
        ):
            text = self.payload.decode("utf-8", errors="replace")[:60000]
            return {"type": "text", "text": "MT700 / credit text:\n\n" + text}
        data = base64.b64encode(self.payload).decode()
        if self.media_type == "application/pdf" or self.filename.lower().endswith(".pdf"):
            return {
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": data},
            }
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": self.media_type, "data": data},
        }

    def extract(self) -> Extraction:
        content = [
            self._content_block(),
            {"type": "text", "text": EXTRACT_PROMPT.format(catalogue=prompt_catalogue())},
        ]
        parsed = parse_json(complete(content))
        out = _clean(parsed.get("fields"), parsed.get("confidence"))
        out.note = str(parsed.get("note") or "Extraction complete.")
        return out
