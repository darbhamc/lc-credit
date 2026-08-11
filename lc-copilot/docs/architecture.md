# Architecture decisions

## 1. The LLM boundary sits in exactly one place

`backend/app/services/llm.py` is the only module that talks to Anthropic. Everything
else receives parsed JSON or an exception. Two consequences:

- The model can never emit free-form prose into a credit field.
- All business logic is testable without a network or an API key.

`coercion.py` is deliberately dependency-free and separate from `extraction.py` so the
rule "anything not in the catalogue is dropped" can be reasoned about on its own.

## 2. Evidence and intent are treated differently

| Source | Behaviour |
|---|---|
| Reference ID | Populates the form immediately, marked pending |
| Uploaded document | Populates the form immediately, marked pending, with per-field confidence |
| Natural-language instruction | Produces a proposal card; writes nothing until accepted |

A document is a record of something that happened. An instruction is a statement of
what someone wants. The first can be shown; the second must be confirmed.

## 3. Submission is gated twice

`errors == 0` **and** `pending == 0`. Validation catches malformed credits; the pending
gate catches unreviewed machine output. Either alone is insufficient — a fluent,
schema-valid hallucination passes validation.

## 4. The confidence floor is 0.75

Below it, a field renders with a hatched amber bar and is labelled low confidence.
The number is a starting point, not a finding. Tune it against your own extraction
accuracy on real scans before trusting it.

## 5. One catalogue, two tiers

`shared/field-catalogue.json` drives the React form, the server-side validation, and
the prompt handed to the model. Adding a field is one edit. There is no path by which
the form and the wire message can disagree about what fields exist.

## 6. Validation is duplicated on purpose

The client copy exists for latency — a user should see "expiry must fall after issue"
without a round trip. The server copy is the authority and runs again on submit. The
two files carry a comment pointing at each other; keep them in step.

## 7. Graceful degradation is implemented, not aspirational

If the model is unreachable, `local_fallback()` handles amounts, currencies, relative
date shifts, and the partial/transhipment/confirmation toggles using regex. Results are
labelled as local so nobody mistakes them for model output. If the whole backend is
down, the frontend falls back to the bundled seed archive for reference lookup.

## 8. Provenance is a table, not a log line

`lc_change_log` is append-only and records old value, new value, source, the originating
utterance, confidence, and actor. It is queryable, exportable, and survives the session.
An audit trail that only exists in the browser is not an audit trail.

## 9. Issued credits are immutable

`POST /api/lc/drafts` rejects edits to an issued application. Changing an issued credit
is an amendment (MT707), a different instrument with its own consent requirements. It is
not modelled here — but the door is closed rather than left ajar.
