import raw from "../../../shared/field-catalogue.json";
import type { FieldSpec, SectionSpec } from "./types";

export const SECTIONS = raw.sections as SectionSpec[];
export const FIELDS = raw.fields as FieldSpec[];
export const FIELD_MAP: Record<string, FieldSpec> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
);
export const REQUIRED = FIELDS.filter((f) => f.required);

export function fieldsIn(section: string): FieldSpec[] {
  return FIELDS.filter((f) => f.section === section);
}

export function tagsIn(section: string): string[] {
  return [...new Set(fieldsIn(section).map((f) => f.tag))];
}
