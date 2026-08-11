import { fieldsIn, SECTIONS, tagsIn } from "../lib/catalogue";
import type { FieldMeta, FieldSpec, LCFields } from "../lib/types";

interface Props {
  lc: LCFields;
  meta: Record<string, FieldMeta>;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  flash: Record<string, boolean>;
  activeSection: string;
  onSection: (id: string) => void;
  onChange: (key: string, value: string) => void;
}

function stateOf(
  key: string,
  lc: LCFields,
  meta: Record<string, FieldMeta>,
  errors: Record<string, string>,
) {
  if (errors[key]) return "err";
  if (meta[key]) return meta[key].state;
  return String(lc[key] ?? "").trim() ? "manual" : "empty";
}

function Note({
  field, lc, meta, errors, warnings,
}: {
  field: FieldSpec;
  lc: LCFields;
  meta: Record<string, FieldMeta>;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}) {
  const { key } = field;
  if (errors[key]) return <span className="note e">{errors[key]}</span>;
  if (warnings[key]) return <span className="note w">{warnings[key]}</span>;

  const m = meta[key];
  if (!m) return null;
  if (m.state === "pending" || m.state === "low") {
    const pct = m.confidence != null && m.confidence < 1 ? ` · ${Math.round(m.confidence * 100)}%` : "";
    return (
      <span className="note p">
        {m.state === "low" ? "Low confidence" : "Populated"} from {m.source}{pct}
      </span>
    );
  }
  if (m.state === "accepted") return <span className="note p">Accepted · {m.source}</span>;
  return null;
}

export default function FormPane({
  lc, meta, errors, warnings, flash, activeSection, onSection, onChange,
}: Props) {
  const sectionProgress = (id: string) => {
    const required = fieldsIn(id).filter((f) => f.required);
    if (!required.length) return "";
    const done = required.filter((f) => String(lc[f.key] ?? "").trim()).length;
    return `${done}/${required.length}`;
  };
  const sectionErrors = (id: string) => fieldsIn(id).filter((f) => errors[f.key]).length;

  return (
    <div className="main">
      <nav className="nav" aria-label="Application sections">
        {SECTIONS.map((s) => {
          const bad = sectionErrors(s.id);
          return (
            <button
              key={s.id}
              className={`nv${activeSection === s.id ? " on" : ""}`}
              onClick={() => {
                onSection(s.id);
                document.getElementById(`sec-${s.id}`)?.scrollIntoView({
                  behavior: "smooth", block: "start",
                });
              }}
            >
              {s.name}
              <small className={bad ? "bad" : ""}>{bad ? `!${bad}` : sectionProgress(s.id)}</small>
            </button>
          );
        })}
      </nav>

      <div className="scroll">
        {SECTIONS.map((s) => (
          <section className="sec" id={`sec-${s.id}`} key={s.id}>
            <header className="sech">
              <h2>{s.name}</h2>
              <span>{tagsIn(s.id).join(" · ")}</span>
            </header>

            <div className="grid">
              {fieldsIn(s.id).map((f) => {
                const state = stateOf(f.key, lc, meta, errors);
                const id = `field-${f.key}`;
                return (
                  <div
                    key={f.key}
                    className={`fld w${f.span ?? 1}${flash[f.key] ? " flash" : ""}`}
                    data-state={state}
                  >
                    <label className="lab" htmlFor={id}>
                      <span className="tag">:{f.tag}:</span>
                      <b>{f.label}</b>
                      {f.required && <span className="rq" aria-label="required">•</span>}
                    </label>

                    {f.type === "select" ? (
                      <select id={id} value={lc[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)}>
                        <option value="">—</option>
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === "area" ? (
                      <textarea
                        id={id}
                        rows={f.rows ?? 3}
                        value={lc[f.key] ?? ""}
                        placeholder={f.placeholder ?? ""}
                        onChange={(e) => onChange(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        id={id}
                        type={f.type === "date" ? "date" : f.type === "num" ? "number" : "text"}
                        readOnly={f.readOnly}
                        value={lc[f.key] ?? ""}
                        placeholder={f.placeholder ?? ""}
                        onChange={(e) => onChange(f.key, e.target.value)}
                      />
                    )}

                    <Note field={f} lc={lc} meta={meta} errors={errors} warnings={warnings} />
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
