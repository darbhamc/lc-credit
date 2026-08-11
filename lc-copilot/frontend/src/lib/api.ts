import type { AuditEntry, Batch, LCFields } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError("backend unreachable");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ApiError(detail.slice(0, 200) || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  history: () => request<{ reference: string; corridor: string }[]>("/api/lc/history"),

  lookup: (referenceId: string) =>
    request<{ reference: string; corridor: string; fields: LCFields }>("/api/lc/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referenceId }),
    }),

  extract: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{
      fields: LCFields;
      confidences: Record<string, number>;
      note: string;
      documentId: string;
    }>("/api/lc/extract", { method: "POST", body });
  },

  amend: (fields: LCFields, instruction: string) =>
    request<{ reply: string; batches: Batch[]; degraded: boolean }>("/api/lc/amend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, instruction }),
    }),

  saveDraft: (fields: LCFields, id?: string) =>
    request<{ draftId: string; status: string }>("/api/lc/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, fields, accepted: [] }),
    }),

  submit: (draftId: string) =>
    request<{ creditNumber: string; mt700: string }>(`/api/lc/submit/${draftId}`, {
      method: "POST",
    }),

  audit: (applicationId: string) =>
    request<AuditEntry[]>(`/api/lc/${applicationId}/audit`),
};

export const CONFIDENCE_FLOOR = 0.75;
