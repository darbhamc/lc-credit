import type { LCFields } from "./types";

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export interface WireLine {
  tag: string;
  value: string;
}

function amount(currency: string, raw: string): string {
  const value = Number(String(raw ?? "").replace(/,/g, ""));
  if (!raw || !Number.isFinite(value)) return "";
  const body = ZERO_DECIMAL.has(currency)
    ? `${value.toFixed(0)},`
    : value.toFixed(2).replace(".", ",");
  return currency + body;
}

const swiftDate = (value?: string) => (value ? value.slice(2).replace(/-/g, "") : "");

/** Mirrors backend/app/services/wire.py. */
export function toWire(lc: LCFields): WireLine[] {
  const lines: WireLine[] = [];
  const put = (tag: string, value?: string) => {
    const body = String(value ?? "").trim();
    if (body) lines.push({ tag, value: body.toUpperCase() });
  };

  put("27", lc.seq);
  put("40A", lc.form);
  put("20", lc.dcNumber || "PENDING ISSUE");
  put("31C", swiftDate(lc.issueDate));
  put("40E", lc.rules);
  put("31D", `${swiftDate(lc.expiryDate)}\n${lc.expiryPlace ?? ""}`.trim());
  put("50", lc.applicant);
  put("59", lc.beneficiary);
  put("32B", amount(lc.currency, lc.amount));
  if (lc.tolPlus || lc.tolMinus) {
    put("39A", `${String(lc.tolPlus || 0).padStart(2, "0")}/${String(lc.tolMinus || 0).padStart(2, "0")}`);
  }
  put("39B", lc.maxAmount);
  put("39C", lc.addlAmounts);
  put("41A", `${lc.availableWith ?? ""}\n${lc.availableBy ?? ""}`.trim());
  put("42C", lc.draftsAt);
  put("42A", lc.drawee);
  put("42P", lc.deferredDetails);
  put("43P", lc.partial);
  put("43T", lc.transhipment);
  put("44A", lc.takingCharge);
  put("44E", lc.portLoading);
  put("44F", lc.portDischarge);
  put("44B", lc.finalDest);
  put("44C", swiftDate(lc.latestShip));
  put("44D", lc.shipPeriod);
  put("45A", lc.goodsDesc);
  put("46A", lc.docsRequired);
  put("47A", lc.addlConditions);
  put("71D", lc.charges);
  if (String(lc.presentation ?? "").trim()) {
    put("48", `${lc.presentation} DAYS AFTER THE DATE OF SHIPMENT BUT WITHIN THE VALIDITY OF THE CREDIT`);
  }
  put("49", lc.confirmation);
  put("53A", lc.reimbursing);
  put("78", lc.instructions);
  put("57A", lc.adviseThrough);
  put("72Z", lc.senderInfo);
  return lines;
}
