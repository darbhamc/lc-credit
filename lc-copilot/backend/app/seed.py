"""Load the twelve archived credits so reference lookup works on first run."""
import json

from sqlalchemy.orm import Session

from .config import SHARED
from .db import SessionLocal, init_db
from .models import Counterparty, LCApplication


def seed(db: Session) -> int:
    data = json.loads((SHARED / "seed-credits.json").read_text())
    base = data["base"]
    added = 0

    for credit in data["credits"]:
        reference = credit["ref"]
        if db.query(LCApplication).filter(LCApplication.reference == reference).first():
            continue
        fields = {**base, **credit["overrides"]}
        db.add(
            LCApplication(
                reference=reference,
                corridor=credit["corridor"],
                status="issued",
                fields=fields,
            )
        )
        for role, key in (("applicant", "applicant"), ("beneficiary", "beneficiary")):
            block = fields.get(key, "")
            if not block:
                continue
            name, *rest = block.split("\n")
            if not db.query(Counterparty).filter(Counterparty.name == name).first():
                db.add(
                    Counterparty(
                        name=name,
                        address="\n".join(rest),
                        role=role,
                        country=rest[-1] if rest else None,
                    )
                )
        added += 1

    db.commit()
    return added


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        count = seed(db)
        print(f"Seeded {count} archived credits.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
