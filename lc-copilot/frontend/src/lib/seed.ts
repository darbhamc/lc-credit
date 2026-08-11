import raw from "../../../shared/seed-credits.json";
import type { LCFields } from "./types";

interface SeedCredit {
  ref: string;
  corridor: string;
  overrides: Partial<LCFields>;
}

export const BASE_CREDIT = raw.base as LCFields;
export const SEED_CREDITS = raw.credits as SeedCredit[];

/**
 * Offline mirror of the reference lookup. The app prefers the API; this keeps
 * the demo usable when the backend is not running.
 */
export function localLookup(reference: string): { fields: LCFields; corridor: string } | null {
  const hit = SEED_CREDITS.find(
    (c) => c.ref.toUpperCase() === reference.trim().toUpperCase(),
  );
  if (!hit) return null;
  return { fields: { ...BASE_CREDIT, ...hit.overrides, dcNumber: "" }, corridor: hit.corridor };
}

export function blankCredit(): LCFields {
  return {
    ...BASE_CREDIT,
    seq: "1/1",
    dcNumber: "",
    issueDate: new Date().toISOString().slice(0, 10),
  };
}
