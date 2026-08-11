from typing import Any

from pydantic import BaseModel, Field


class LookupRequest(BaseModel):
    referenceId: str


class LCRecord(BaseModel):
    reference: str | None = None
    corridor: str | None = None
    fields: dict[str, Any]


class FieldDiff(BaseModel):
    key: str
    tag: str = ""
    label: str = ""
    old_value: str = ""
    new_value: str = ""
    rationale: str = ""
    confidence: float = 1.0


class Batch(BaseModel):
    name: str
    summary: str = ""
    changes: list[FieldDiff] = Field(default_factory=list)


class AmendRequest(BaseModel):
    fields: dict[str, Any]
    instruction: str


class AmendResponse(BaseModel):
    reply: str
    batches: list[Batch]
    degraded: bool = False


class ExtractResponse(BaseModel):
    fields: dict[str, str]
    confidences: dict[str, float]
    note: str = ""
    documentId: str | None = None


class ValidateRequest(BaseModel):
    fields: dict[str, Any]


class ValidateResponse(BaseModel):
    errors: dict[str, str]
    warnings: dict[str, str]


class AcceptedChange(BaseModel):
    key: str
    old_value: str = ""
    new_value: str = ""
    source: str = "instruction"
    source_detail: str | None = None
    utterance: str | None = None
    confidence: float | None = None


class DraftRequest(BaseModel):
    id: str | None = None
    fields: dict[str, Any]
    accepted: list[AcceptedChange] = Field(default_factory=list)


class DraftResponse(BaseModel):
    draftId: str
    status: str


class SubmitResponse(BaseModel):
    creditNumber: str
    mt700: str
