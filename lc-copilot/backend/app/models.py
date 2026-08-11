import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    pass


class LCApplication(Base):
    """A credit application. `fields` holds the MT700 key/value payload."""

    __tablename__ = "lc_applications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    reference: Mapped[str | None] = mapped_column(String(40), index=True, unique=True)
    corridor: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | issued
    fields: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    changes: Mapped[list["LCChange"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )
    documents: Mapped[list["LCDocument"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )


class LCChange(Base):
    """Append-only provenance trail. One row per accepted field change."""

    __tablename__ = "lc_change_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("lc_applications.id"), index=True)
    tag: Mapped[str] = mapped_column(String(8))
    field_key: Mapped[str] = mapped_column(String(40))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(60))  # manual | reference | document | instruction
    source_detail: Mapped[str | None] = mapped_column(String(200))
    utterance: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    actor: Mapped[str] = mapped_column(String(80), default="demo.user")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    application: Mapped[LCApplication] = relationship(back_populates="changes")


class LCDocument(Base):
    """An uploaded source document plus what was pulled out of it."""

    __tablename__ = "lc_documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    application_id: Mapped[str | None] = mapped_column(ForeignKey("lc_applications.id"))
    filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(80))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(500))
    extraction: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    application: Mapped[LCApplication | None] = relationship(back_populates="documents")


class Counterparty(Base):
    """Applicants and beneficiaries seen before, for typeahead."""

    __tablename__ = "counterparties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    address: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))  # applicant | beneficiary
    country: Mapped[str | None] = mapped_column(String(80))
