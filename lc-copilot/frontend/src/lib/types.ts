export type FieldType = "text" | "area" | "date" | "num" | "select";

export interface FieldSpec {
  key: string;
  tag: string;
  label: string;
  section: string;
  type: FieldType;
  required?: boolean;
  readOnly?: boolean;
  span?: number;
  rows?: number;
  options?: string[];
  placeholder?: string;
}

export interface SectionSpec {
  id: string;
  name: string;
}

export type LCFields = Record<string, string>;

/** How a value got into the form. Drives the field-state colour bar. */
export type Provenance = "manual" | "pending" | "low" | "accepted";

export interface FieldMeta {
  state: Provenance;
  source: string;
  confidence?: number;
}

export interface FieldDiff {
  key: string;
  tag: string;
  label: string;
  old_value: string;
  new_value: string;
  rationale: string;
  confidence: number;
  /** Set once the user has ruled on it. */
  decision?: "accepted" | "rejected";
}

export interface Batch {
  name: string;
  summary: string;
  changes: FieldDiff[];
}

export interface Variant extends Batch {
  id: string;
  fields: LCFields;
}

export interface AuditEntry {
  at: string;
  tag: string;
  label: string;
  from: string;
  to: string;
  source: string;
  utterance?: string;
}

export type CardPayload =
  | { kind: "bulk"; title: string; count: number; lowConfidence: number }
  | { kind: "diff"; changes: FieldDiff[]; utterance: string }
  | { kind: "variants"; names: string[] };

export interface Message {
  role: "system" | "user" | "copilot";
  text: string;
  card?: CardPayload;
}

/** The copilot proposal lifecycle. */
export type ProposalState =
  | "idle"
  | "extracting"
  | "proposed"
  | "partially_accepted"
  | "applied";
