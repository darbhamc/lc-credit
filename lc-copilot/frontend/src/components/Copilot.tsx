import { useEffect, useRef, useState } from "react";

import { FIELD_MAP } from "../lib/catalogue";
import type { AuditEntry, LCFields, Message } from "../lib/types";
import AuditTrail from "./AuditTrail";

interface Props {
  messages: Message[];
  audit: AuditEntry[];
  busy: string;
  lc: LCFields;
  pendingCount: number;
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  onAcceptChange: (messageIndex: number, changeIndex: number) => void;
  onRejectChange: (messageIndex: number, changeIndex: number) => void;
  onAcceptBatch: (messageIndex: number) => void;
  onAcceptPending: () => void;
  onShowVariants: () => void;
}

const STARTERS: [string, string][] = [
  ["Load DC-2025-04781", "Use DC-2025-04781 as the base"],
  [
    "Change beneficiary",
    "Change the beneficiary to Hanwha Trading Co., 30 Gukjegeumyung-ro, Seoul, South Korea and set the amount to USD 2,400,000",
  ],
  ["Shift shipment", "Push the latest shipment date out by 30 days and make partial shipments not allowed"],
  [
    "Draft 3 variants",
    "Create three credits from this base: one for Rotterdam at USD 500,000, one for Hamburg at EUR 480,000 expiring 15 December 2026, and one for Jebel Ali at USD 610,000 with transhipment allowed",
  ],
];

export default function Copilot(props: Props) {
  const {
    messages, audit, busy, lc, pendingCount, onSend, onUpload,
    onAcceptChange, onRejectChange, onAcceptBatch, onAcceptPending, onShowVariants,
  } = props;

  const [tab, setTab] = useState<"chat" | "audit">("chat");
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [messages, busy, tab]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft("");
  };

  return (
    <aside className="right">
      <div className="rtab" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "chat"}
          className={`rt${tab === "chat" ? " on" : ""}`}
          onClick={() => setTab("chat")}
        >
          Copilot
        </button>
        <button
          role="tab"
          aria-selected={tab === "audit"}
          className={`rt${tab === "audit" ? " on" : ""}`}
          onClick={() => setTab("audit")}
        >
          Provenance ({audit.length})
        </button>
      </div>

      {tab === "audit" ? (
        <AuditTrail entries={audit} />
      ) : (
        <>
          <div className="thread" ref={thread}>
            {messages.map((m, mi) => (
              <div key={mi} className={`m ${m.role}`}>
                {m.text}

                {m.card?.kind === "bulk" && (
                  <div className="card">
                    <div className="chd">
                      <b>{m.card.title}</b> · {m.card.count} fields
                      {m.card.lowConfidence ? ` · ${m.card.lowConfidence} low` : ""}
                      {pendingCount > 0 && <button onClick={onAcceptPending}>Accept all</button>}
                    </div>
                    <div className="chg">
                      <p className="why">
                        Fields are live in the form and marked amber. Review, correct anything
                        wrong, then accept.
                      </p>
                    </div>
                  </div>
                )}

                {m.card?.kind === "variants" && (
                  <div className="card">
                    <div className="chd">
                      <b>{m.card.names.length} drafts</b>
                      <button onClick={onShowVariants}>Compare</button>
                    </div>
                    {m.card.names.map((n) => (
                      <div className="chg" key={n}><span className="new">{n}</span></div>
                    ))}
                  </div>
                )}

                {m.card?.kind === "diff" && (
                  <div className="card">
                    <div className="chd">
                      <b>
                        {m.card.changes.length} proposed change
                        {m.card.changes.length > 1 ? "s" : ""}
                      </b>
                      {m.card.changes.some((c) => !c.decision) && (
                        <button onClick={() => onAcceptBatch(mi)}>Accept all</button>
                      )}
                    </div>
                    {m.card.changes.map((c, ci) => {
                      const spec = FIELD_MAP[c.key];
                      return (
                        <div className="chg" key={c.key}>
                          <div className="h">
                            <i>:{spec.tag}:</i>
                            <em>{spec.label}</em>
                            {c.confidence < 0.8 && (
                              <em className="conf">{Math.round(c.confidence * 100)}%</em>
                            )}
                          </div>
                          {lc[c.key] ? <div className="old">{lc[c.key]}</div> : null}
                          <div className="new">{c.new_value}</div>
                          {c.rationale && <p className="why">{c.rationale}</p>}
                          {c.decision ? (
                            <div className={`done ${c.decision === "accepted" ? "a" : "r"}`}>
                              {c.decision}
                            </div>
                          ) : (
                            <div className="acts">
                              <button onClick={() => onAcceptChange(mi, ci)}>Accept</button>
                              <button onClick={() => onRejectChange(mi, ci)}>Reject</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="busy"><i />{busy}</div>}
          </div>

          <div className="compose">
            <div
              className={`drop${dragging ? " on" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) onUpload(file);
              }}
              onClick={() => picker.current?.click()}
            >
              Drop a past credit here — PDF, image, or MT700 text
            </div>
            <input
              ref={picker}
              type="file"
              hidden
              accept=".pdf,.png,.jpg,.jpeg,.txt,.mt700,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />

            <div className="chips">
              {STARTERS.map(([label, prompt]) => (
                <button key={label} className="chip" onClick={() => onSend(prompt)}>
                  {label}
                </button>
              ))}
            </div>

            <div className="inbox">
              <button className="icn" onClick={() => picker.current?.click()} title="Attach a document">
                ↑
              </button>
              <textarea
                rows={2}
                value={draft}
                placeholder="Reference an ID, or describe the changes you want…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button className="snd" disabled={!draft.trim() || !!busy} onClick={send}>
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
