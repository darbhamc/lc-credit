import type { AuditEntry } from "../lib/types";

export default function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) {
    return <div className="aud"><p className="empty">No changes recorded yet</p></div>;
  }
  return (
    <div className="aud">
      {entries.map((e, i) => (
        <article className="arow" key={i}>
          <div className="t">{e.at}</div>
          <div><span className="f">:{e.tag}:</span> {e.label}</div>
          <div className="v">
            <s>{String(e.from || "—").slice(0, 60)}</s> → {String(e.to).slice(0, 90)}
          </div>
          <div className="s">
            {e.source}{e.utterance ? ` — "${e.utterance.slice(0, 70)}"` : ""}
          </div>
        </article>
      ))}
    </div>
  );
}
