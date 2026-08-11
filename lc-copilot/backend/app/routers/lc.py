import json
import random
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..catalogue import FIELDS, SECTIONS
from ..config import settings
from ..db import get_db
from ..models import LCApplication, LCChange, LCDocument
from ..schemas import (
    AmendRequest, AmendResponse, DraftRequest, DraftResponse, ExtractResponse,
    LCRecord, LookupRequest, SubmitResponse, ValidateRequest, ValidateResponse,
)
from ..services.amendment import amend
from ..services.extraction import DatabaseSource, DocumentSource
from ..services.llm import LLMUnavailable
from ..services.validation import validate
from ..services.wire import describe, to_mt700

router = APIRouter(prefix="/api/lc", tags=["letter-of-credit"])


@router.get("/catalogue")
def catalogue():
    """The field catalogue, so the form is never out of step with the server."""
    return {"sections": SECTIONS, "fields": FIELDS}


@router.get("/history")
def history(db: Session = Depends(get_db)):
    rows = (
        db.query(LCApplication)
        .filter(LCApplication.reference.isnot(None))
        .order_by(LCApplication.reference)
        .all()
    )
    return [{"reference": r.reference, "corridor": r.corridor} for r in rows]


@router.post("/lookup", response_model=LCRecord)
def lookup(body: LookupRequest, db: Session = Depends(get_db)):
    try:
        extraction = DatabaseSource(body.referenceId, db).extract()
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    record = (
        db.query(LCApplication)
        .filter(LCApplication.reference == body.referenceId.strip().upper())
        .one()
    )
    return LCRecord(reference=record.reference, corridor=record.corridor, fields=extraction.fields)


@router.post("/extract", response_model=ExtractResponse)
async def extract(file: UploadFile = File(...), db: Session = Depends(get_db)):
    payload = await file.read()
    if len(payload) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB")
    if file.filename.lower().endswith((".doc", ".docx")):
        raise HTTPException(
            415, "Word files are not supported. Upload the credit as PDF, an image, or MT700 text."
        )

    try:
        extraction = DocumentSource(file.filename, file.content_type or "", payload).extract()
    except LLMUnavailable as exc:
        raise HTTPException(503, f"Extraction unavailable: {exc}") from exc

    store = Path(settings.upload_dir)
    store.mkdir(parents=True, exist_ok=True)
    document_id = uuid.uuid4().hex
    path = store / f"{document_id}-{Path(file.filename).name}"
    path.write_bytes(payload)

    db.add(
        LCDocument(
            id=document_id,
            filename=file.filename,
            media_type=file.content_type or "application/octet-stream",
            size_bytes=len(payload),
            storage_path=str(path),
            extraction={"fields": extraction.fields, "confidences": extraction.confidences},
        )
    )
    db.commit()

    return ExtractResponse(
        fields=extraction.fields,
        confidences=extraction.confidences,
        note=extraction.note,
        documentId=document_id,
    )


@router.post("/amend", response_model=AmendResponse)
def amend_route(body: AmendRequest):
    try:
        reply, batches, degraded = amend(body.fields, body.instruction)
    except LLMUnavailable as exc:
        raise HTTPException(503, f"Copilot unavailable: {exc}") from exc
    if not batches:
        return AmendResponse(reply="Nothing in that instruction maps to a credit field.", batches=[])
    return AmendResponse(reply=reply, batches=batches, degraded=degraded)


@router.post("/validate", response_model=ValidateResponse)
def validate_route(body: ValidateRequest):
    errors, warnings = validate(body.fields)
    return ValidateResponse(errors=errors, warnings=warnings)


@router.post("/drafts", response_model=DraftResponse)
def save_draft(body: DraftRequest, db: Session = Depends(get_db)):
    record = db.get(LCApplication, body.id) if body.id else None
    if record is None:
        record = LCApplication(status="draft", fields={})
        db.add(record)
        db.flush()
    if record.status == "issued":
        raise HTTPException(409, "An issued credit cannot be edited. Raise an amendment instead.")

    record.fields = body.fields
    for change in body.accepted:
        tag, label = describe(change.key)
        db.add(
            LCChange(
                application_id=record.id,
                tag=tag,
                field_key=change.key,
                old_value=change.old_value,
                new_value=change.new_value,
                source=change.source,
                source_detail=change.source_detail,
                utterance=change.utterance,
                confidence=change.confidence,
            )
        )
    db.commit()
    return DraftResponse(draftId=record.id, status=record.status)


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: str, db: Session = Depends(get_db)):
    record = db.get(LCApplication, draft_id)
    if record is None:
        raise HTTPException(404, "Draft not found")
    return {"draftId": record.id, "status": record.status, "fields": record.fields}


@router.get("/{application_id}/audit")
def audit(application_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(LCChange)
        .filter(LCChange.application_id == application_id)
        .order_by(LCChange.created_at.desc())
        .all()
    )
    return [
        {
            "tag": r.tag,
            "field": r.field_key,
            "from": r.old_value,
            "to": r.new_value,
            "source": r.source,
            "sourceDetail": r.source_detail,
            "utterance": r.utterance,
            "confidence": r.confidence,
            "actor": r.actor,
            "at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/submit/{draft_id}", response_model=SubmitResponse)
def submit(draft_id: str, db: Session = Depends(get_db)):
    record = db.get(LCApplication, draft_id)
    if record is None:
        raise HTTPException(404, "Draft not found")

    errors, _ = validate(record.fields)
    if errors:
        raise HTTPException(422, {"message": "Application does not validate", "errors": errors})

    credit_number = f"DC-{record.created_at.year}-{random.randint(10000, 99999)}"
    fields = dict(record.fields)
    fields["dcNumber"] = credit_number
    record.fields = fields
    record.reference = credit_number
    record.status = "issued"
    db.commit()

    return SubmitResponse(creditNumber=credit_number, mt700=to_mt700(fields))


@router.post("/preview")
def preview(body: ValidateRequest):
    return {"mt700": to_mt700(body.fields)}
