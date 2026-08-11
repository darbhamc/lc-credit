import { FIELDS } from "./catalogue";
import type { LCFields } from "./types";

const SWIFT_X = /[^A-Za-z0-9/\-?:().,'+ \n]/;
const FREE_TEXT = [
  "goodsDesc", "docsRequired", "addlConditions",
  "instructions", "charges", "senderInfo",
];
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

const day = (value?: string) => (value ? new Date(`${value}T00:00:00`) : null);
const text = (fields: LCFields, key: string) => String(fields[key] ?? "").trim();

export interface ValidationResult {
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

/**
 * Mirrors backend/app/services/validation.py for instant feedback.
 * The server remains the authority — nothing submits without passing there.
 */
export function validate(lc: LCFields): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  FIELDS.forEach((f) => {
    if (f.required && !text(lc, f.key)) errors[f.key] = "Required to submit";
  });

  const issue = day(lc.issueDate);
  const expiry = day(lc.expiryDate);
  const ship = day(lc.latestShip);

  if (issue && expiry && expiry <= issue) {
    errors.expiryDate = "Expiry must fall after the issue date";
  }
  if (ship && expiry && ship > expiry) {
    errors.latestShip = "Latest shipment cannot fall after expiry";
  }
  if (text(lc, "latestShip") && text(lc, "shipPeriod")) {
    errors.latestShip = "44C and 44D are mutually exclusive — keep one";
    errors.shipPeriod = "44C and 44D are mutually exclusive — keep one";
  }
  if (!text(lc, "latestShip") && !text(lc, "shipPeriod")) {
    warnings.latestShip = "Set either a latest shipment date or a shipment period";
  }
  if (text(lc, "maxAmount") && (text(lc, "tolPlus") || text(lc, "tolMinus"))) {
    errors.maxAmount = "39B cannot coexist with a 39A tolerance";
  }
  if (lc.availableBy === "BY DEF PAYMENT" && !text(lc, "deferredDetails")) {
    errors.deferredDetails = "Required when the credit is available by deferred payment";
  }
  if (["BY ACCEPTANCE", "BY NEGOTIATION"].includes(lc.availableBy)) {
    if (!text(lc, "draftsAt")) errors.draftsAt = "Required for acceptance or negotiation credits";
    if (!text(lc, "drawee")) errors.drawee = "Required for acceptance or negotiation credits";
  }
  if (ship && expiry && text(lc, "presentation")) {
    const window = Math.round((expiry.getTime() - ship.getTime()) / 86_400_000);
    if (Number(lc.presentation) > window) {
      errors.presentation = `Only ${window} days between shipment and expiry`;
    }
  }

  const amount = text(lc, "amount").replace(/,/g, "");
  if (amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) errors.amount = "Enter a positive amount";
    if (ZERO_DECIMAL.has(lc.currency) && amount.includes(".")) {
      errors.amount = `${lc.currency} has no minor units`;
    }
  }

  (["tolPlus", "tolMinus"] as const).forEach((key) => {
    const raw = text(lc, key);
    if (raw && (Number(raw) < 0 || Number(raw) > 100 || !Number.isFinite(Number(raw)))) {
      errors[key] = "0–100";
    }
  });

  FREE_TEXT.forEach((key) => {
    if (text(lc, key) && SWIFT_X.test(lc[key])) {
      warnings[key] = "Contains characters outside the SWIFT X character set";
    }
  });

  return { errors, warnings };
}
