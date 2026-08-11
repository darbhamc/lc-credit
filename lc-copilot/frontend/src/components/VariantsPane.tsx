import { FIELDS } from "../lib/catalogue";
import type { Variant } from "../lib/types";

interface Props {
  variants: Variant[];
  activeId: string | null;
  onOpen: (variant: Variant) => void;
  onDiscard: () => void;
}

export default function VariantsPane({ variants, activeId, onOpen, onDiscard }: Props) {
  // Only show rows where the drafts actually disagree — the whole point of
  // the view is the delta, not another copy of the base credit.
  const differing = FIELDS.filter(
    (f) => new Set(variants.map((v) => v.fields[f.key] ?? "")).size > 1,
  );

  return (
    <div className="vwrap">
      <div className="vlist">
        {variants.map((v) => (
          <button
            key={v.id}
            className={`vcard${activeId === v.id ? " on" : ""}`}
            onClick={() => onOpen(v)}
          >
            <b>{v.name}</b>
            <p>{v.summary}</p>
          </button>
        ))}
        <button className="btn" style={{ width: "100%", marginTop: 6 }} onClick={onDiscard}>
          Discard batch
        </button>
      </div>

      <div className="matrix">
        <header className="whd">
          <span>Comparison — fields that differ</span>
          <em>{variants.length} DRAFTS</em>
        </header>
        <table className="mx">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Field</th>
              {variants.map((v) => <th key={v.id}>{v.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {differing.map((f) => (
              <tr key={f.key}>
                <td><span className="tag">:{f.tag}:</span> {f.label}</td>
                {variants.map((v) => (
                  <td key={v.id} className="d">{v.fields[f.key] || "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Open a draft to edit it in the full form. Each one still needs its fields
          accepted before it can be submitted.
        </p>
      </div>
    </div>
  );
}
