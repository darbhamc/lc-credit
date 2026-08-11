# Demo script

Roughly six minutes, exercising all five journeys end to end.

## Setup

```bash
make backend    # terminal 1
make frontend   # terminal 2
```

Open http://localhost:5173.

---

## 1. Manual entry (30s)

Fill anything in Credit basics. Point out:

- The MT700 tag in each field's gutter — this is the real wire tag, not a label.
- The blue state bar appearing as you type: manually entered.
- Section nav on the left showing required-field progress and error counts.

## 2. Reference lookup (60s)

Copilot panel → **Load DC-2025-04781**.

The Houston-to-Al-Khobar oilfield credit fills every section. Point out:

- Everything is amber — populated, not yet reviewed.
- The credit number is cleared. A new issue never inherits one.
- Provenance tab already lists every field that changed.

## 3. Conversational amendment (90s)

**Change beneficiary**.

- The diff card renders as a telex correction: struck original above, new value below.
- Nothing has moved in the form yet.
- Accept one change, reject another. Watch the form update field by field, the bar turn green, and the audit trail grow.

Then type something not in the chips:

> Set confirmation to CONFIRM and reduce the presentation period to 10 days

## 4. Validation (45s)

Set the expiry date earlier than the latest shipment date.

- The field turns red with a specific message, not a generic one.
- The error count in the top bar and section nav updates.
- Submit is disabled, and the tooltip says why.

Undo it.

## 5. Batch variants (90s)

**Draft 3 variants**.

- Three drafts appear; the comparison matrix shows only the fields that differ.
- Open one, edit it in the full form, return to the matrix.

## 6. Document extraction (60s)

Drop a PDF or scan of a real credit into the dropzone.

- Per-field confidence.
- Anything under 0.75 gets a hatched amber bar and a low-confidence label.
- Fields the model returned that are not in the catalogue were dropped silently — check the server log.

## 7. Submit (30s)

Accept all pending fields, then **Submit for issue**.

- Credit number assigned, wire view opens with the outbound MT700.
- Provenance tab holds the full trail: what changed, from what, to what, by which route, and on whose instruction.

---

## The two questions worth planting

**"What stops it hallucinating a value into a live credit?"**
Three things: the catalogue filter drops unknown fields and illegal enum values; validation runs server-side on submit; and submission is blocked while any AI-populated field is unreviewed.

**"What happens when the model is down?"**
Stop the backend and try **Shift shipment**. The local parser handles it and says so.
