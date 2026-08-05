# LC Copilot

Import documentary credit issuance (SWIFT **MT700**, **UCP 600**) with a conversational copilot that pre-populates and amends the application.

Corporate treasury users rarely raise a credit from scratch — they re-issue variants of credits they have raised before. This makes clone-and-tweak a first-class workflow while keeping the structured, auditable form as the system of record.

---

## The one rule

**The model proposes. Deterministic code applies. A human accepts.**

The LLM never writes a value into an issued credit. It returns a field-level diff; the backend validates and coerces it; the user accepts or rejects it field by field. Submission is blocked while any AI-populated field remains unreviewed.

---

## Five journeys

| # | Journey | Entry point |
|---|---|---|
| 1 | Manual entry | The form itself — section nav, live validation, MT700 preview |
| 2 | Auto-fill from a reference ID | `Use DC-2025-04781 as the base` → `POST /api/lc/lookup` |
| 3 | Auto-fill from a document | Drop a PDF, image, or MT700 text → `POST /api/lc/extract` |
| 4 | Conversational amendment | `Push the latest shipment date out by 30 days` → `POST /api/lc/amend` |
| 5 | Batch variants | `Create three credits from this base: one for Rotterdam at USD 500,000…` → one batch per credit |

Journeys 2 and 3 populate the form immediately as **pending**; journey 4 writes nothing until accepted. A document is evidence, an instruction is an intent — the asymmetry is deliberate.

---

## Quick start

```bash
git clone git@github.com:<you>/lc-copilot.git
cd lc-copilot

cp .env.example backend/.env      # add ANTHROPIC_API_KEY for journeys 3-5
make install
make backend                       # http://localhost:8000/docs
make frontend                      # http://localhost:5173
```

The database seeds itself on first boot with twelve archived credits across real trade corridors, so reference lookup works immediately.

No API key? The app still runs. Manual entry, reference lookup, validation, MT700 rendering, and a deterministic fallback parser for common amendments all work without one.

---

## Layout

```
shared/                  field-catalogue.json, seed-credits.json  ← one source of truth
backend/app/
  catalogue.py           loads the shared catalogue
  models.py              lc_applications, lc_change_log, lc_documents, counterparties
  routers/lc.py          the API surface
  services/
    validation.py        UCP 600 consistency rules (the authority)
    wire.py              MT700 rendering
    coercion.py          pure, dependency-free type coercion
    extraction.py        DatabaseSource | DocumentSource behind one interface
    amendment.py         instruction → diffs, plus deterministic fallback
    llm.py               the only file that talks to Anthropic
  tests/                 validation, amendment, wire rendering
frontend/src/
  lib/                   catalogue, types, validate, wire, fallback, api
  components/            FormPane, WirePane, VariantsPane, Copilot, AuditTrail
```

Both tiers read `shared/field-catalogue.json`, so a field cannot exist on one side of the wire and not the other.

---

## API

```
GET  /api/lc/catalogue             field + section definitions
GET  /api/lc/history               archived credits available for lookup
POST /api/lc/lookup                { referenceId }         → LCRecord
POST /api/lc/extract               multipart file          → fields + confidences
POST /api/lc/amend                 { fields, instruction } → { reply, batches[] }
POST /api/lc/validate              { fields }              → { errors, warnings }
POST /api/lc/preview               { fields }              → { mt700 }
POST /api/lc/drafts                { id?, fields, accepted[] }
GET  /api/lc/drafts/{id}
POST /api/lc/submit/{draftId}      → { creditNumber, mt700 }
GET  /api/lc/{id}/audit            full provenance trail
```

---

## Validation rules

Enforced in `backend/app/services/validation.py`, mirrored client-side for instant feedback. The server is the authority.

- Expiry must fall after the issue date, and latest shipment must not fall after expiry
- 44C (latest shipment date) and 44D (shipment period) are mutually exclusive
- 39B (maximum amount) cannot coexist with a 39A tolerance
- 42P required for deferred payment; 42C and 42a required for acceptance or negotiation
- Presentation period (48) cannot exceed the window between shipment and expiry
- Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) reject minor units
- Free text outside the SWIFT X character set warns rather than blocks

Charges use tag **71D**, per the 2018 standards release. 71B is the pre-2018 tag and is not used here.

---

## Design

The application form and the wire message are the same object viewed two ways. The record is paper-white and disciplined; the machine is a dark terminal beside it. Every field carries its real MT700 tag in the gutter.

Field state is functional colour, not decoration:

| State | Bar |
|---|---|
| Manually entered | Ledger blue |
| AI-populated, awaiting review | Amber |
| Below the 0.75 confidence floor | Hatched amber |
| Accepted by a human | Green |
| Fails validation | Red |

Type is IBM Plex throughout — Mono for anything that goes on the wire, Sans Condensed for labels, Sans for chrome.

---

## Tests

```bash
cd backend && python -m pytest -q     # validation, amendment, wire rendering
cd frontend && npm run typecheck
```

The suite caught two real defects during development: a seeded credit that left only 20 days between latest shipment and expiry while requiring a 21-day presentation period, and a date-shift regex too narrow to match its own documented example.

---

## Not production yet

Deliberately out of scope for this build:

- **No authentication or authorisation.** Add SSO and maker-checker before anything real.
- **Uploads are stored unencrypted on local disk.** Move to encrypted object storage with a retention policy.
- **No rate limiting or prompt-injection hardening** on the extraction path. A hostile document is currently trusted input.
- **SQLite by default.** Postgres via `DATABASE_URL`; `docker-compose.yml` provides one.
- **Amendments to issued credits (MT707)** are not modelled. An issued credit is immutable here.
