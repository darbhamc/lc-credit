import { FIELD_MAP } from "./catalogue";
import type { FieldDiff, LCFields } from "./types";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function coerce(key: string, value: string): string | null {
  const spec = FIELD_MAP[key];
  if (!spec || value == null || value === "") return null;
  const body = String(value).trim();
  if (spec.type === "select" && spec.options) {
    return spec.options.find((o) => o.toUpperCase() === body.toUpperCase()) ?? null;
  }
  if (spec.type === "num") {
    const cleaned = body.replace(/,/g, "");
    return Number.isFinite(Number(cleaned)) ? cleaned : null;
  }
  return body;
}

/**
 * Deterministic cover for the most common amendments, used only when the
 * backend copilot is unreachable. Results are labelled as local so nobody
 * mistakes them for model output.
 */
export function localAmend(lc: LCFields, instruction: string): FieldDiff[] {
  const text = instruction.toLowerCase();
  const changes: FieldDiff[] = [];

  const add = (key: string, value: string, why: string) => {
    const coerced = coerce(key, value);
    if (coerced == null || coerced === String(lc[key] ?? "")) return;
    const spec = FIELD_MAP[key];
    changes.push({
      key,
      tag: spec.tag,
      label: spec.label,
      old_value: String(lc[key] ?? ""),
      new_value: coerced,
      rationale: why,
      confidence: 0.6,
    });
  };

  const currency = text.match(/\b(usd|eur|gbp|jpy|sgd|aed|inr|chf|aud|cny)\b/);
  if (currency) add("currency", currency[1].toUpperCase(), "Currency named in the instruction");

  const amount = text.match(/(?:amount|value)[^0-9]{0,20}([0-9][0-9,.]*)\s*(k|m|million|thousand)?/);
  if (amount) {
    let value = Number(amount[1].replace(/,/g, ""));
    const unit = amount[2] ?? "";
    if (/^(m|million)$/.test(unit)) value *= 1_000_000;
    if (/^(k|thousand)$/.test(unit)) value *= 1_000;
    if (Number.isFinite(value) && value > 0) {
      add("amount", value.toFixed(0), "Amount named in the instruction");
    }
  }

  if (text.includes("partial")) {
    add("partial", /not allow|disallow|no partial/.test(text) ? "NOT ALLOWED" : "ALLOWED",
      "Partial shipment terms named");
  }
  if (/transhipment|transshipment/.test(text)) {
    add("transhipment", /not allow|disallow/.test(text) ? "NOT ALLOWED" : "ALLOWED",
      "Transhipment terms named");
  }
  if (text.includes("confirm")) {
    const value = text.includes("may add") ? "MAY ADD"
      : /without|unconfirm/.test(text) ? "WITHOUT" : "CONFIRM";
    add("confirmation", value, "Confirmation instruction named");
  }

  const shift = text.match(/(?:push|extend|move|bring)[^0-9]{0,60}?(\d{1,3})\s*days?/);
  if (shift && lc.latestShip) {
    const moved = new Date(`${lc.latestShip}T00:00:00`);
    moved.setDate(moved.getDate() + Number(shift[1]));
    add("latestShip", moved.toISOString().slice(0, 10), `Shifted by ${shift[1]} days`);
  }

  const named = text.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?/);
  if (named && text.includes("expir")) {
    const year = named[3] ?? String(new Date().getFullYear());
    const month = String(MONTHS.indexOf(named[2].toUpperCase()) + 1).padStart(2, "0");
    add("expiryDate", `${year}-${month}-${named[1].padStart(2, "0")}`, "Expiry date named");
  }

  return changes;
}
