import { useCallback, useMemo, useState } from "react";

import Copilot from "./components/Copilot";
import FormPane from "./components/FormPane";
import LedgerPane from "./components/LedgerPane";
import VariantsPane from "./components/VariantsPane";
import WirePane from "./components/WirePane";
import { api, ApiError, CONFIDENCE_FLOOR } from "./lib/api";
import { FIELD_MAP, REQUIRED } from "./lib/catalogue";
import { localAmend } from "./lib/fallback";
import { blankCredit, localLookup } from "./lib/seed";
import type {
  AuditEntry, FieldDiff, FieldMeta, LCFields, Message, Variant,
} from "./lib/types";
import { validate } from "./lib/validate";

const REFERENCE_PATTERN = /\bDC-\d{4}-\d{4,5}\b/i;

export default function App() {
  const [lc, setLc] = useState<LCFields>(blankCredit);
  const [meta, setMeta] = useState<Record<string, FieldMeta>>({});
  const [view, setView] = useState<"form" | "wire" | "variants" | "ledger">("form");
  const [section, setSection] = useState("basics");
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", text: "Start from a past credit, a document, or a blank form." },
  ]);
  const [busy, setBusy] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [creditNumber, setCreditNumber] = useState<string | null>(null);

  const { errors, warnings } = useMemo(() => validate(lc), [lc]);
  const errorCount = Object.keys(errors).length;
  const requiredDone = REQUIRED.filter((f) => String(lc[f.key] ?? "").trim()).length;
  const pending = Object.entries(meta).filter(
    ([, m]) => m.state === "pending" || m.state === "low",
  );
  const lowConfidence = pending.filter(([, m]) => m.state === "low").length;

  const say = (role: Message["role"], text: string, card?: Message["card"]) =>
    setMessages((m) => [...m, { role, text, card }]);

  const stamp = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const pulse = (keys: string[]) => {
    setFlash(Object.fromEntries(keys.map((k) => [k, true])));
    window.setTimeout(() => setFlash({}), 1000);
  };

  const record = (entries: Omit<AuditEntry, "at">[]) =>
    setAudit((a) => [...entries.map((e) => ({ ...e, at: stamp() })), ...a]);

  /* -- manual entry ------------------------------------------------------ */
  const onChange = useCallback((key: string, value: string) => {
    setLc((prev) => ({ ...prev, [key]: value }));
    setMeta((prev) => ({ ...prev, [key]: { state: "manual", source: "Manual entry" } }));
  }, []);

  /* -- shared: write a whole credit into the form as pending ------------- */
  function loadCredit(
    fields: LCFields,
    source: string,
    utterance: string,
    confidences?: Record<string, number>,
  ) {
    const next = { ...blankCredit(), ...fields, dcNumber: "" };
    const nextMeta: Record<string, FieldMeta> = {};
    const entries: Omit<AuditEntry, "at">[] = [];

    Object.keys(FIELD_MAP).forEach((key) => {
      if (!String(next[key] ?? "").trim() || key === "dcNumber") return;
      const confidence = confidences?.[key];
      nextMeta[key] = {
        state: confidence != null && confidence < CONFIDENCE_FLOOR ? "low" : "pending",
        source,
        confidence,
      };
      if (next[key] !== lc[key]) {
        entries.push({
          tag: FIELD_MAP[key].tag,
          label: FIELD_MAP[key].label,
          from: lc[key] ?? "",
          to: next[key],
          source,
          utterance,
        });
      }
    });

    setLc(next);
    setMeta(nextMeta);
    setCreditNumber(null);
    record(entries);
    pulse(Object.keys(nextMeta));
    return { count: Object.keys(nextMeta).length, low: Object.values(nextMeta).filter((m) => m.state === "low").length };
  }

  /* -- journey 2: reference lookup --------------------------------------- */
  async function loadFromReference(reference: string) {
    setBusy(`Fetching ${reference}`);
    try {
      const { fields, corridor } = await api.lookup(reference);
      const { count } = loadCredit(fields, `Reference ${reference}`, `Use ${reference} as the base`);
      say("copilot", `Loaded ${reference} — ${corridor}. Credit number cleared for the new issue.`, {
        kind: "bulk", title: `${reference} loaded`, count, lowConfidence: 0,
      });
    } catch (err) {
      const offline = localLookup(reference);
      if (!offline) {
        say("copilot", `No credit on file under ${reference}. Try DC-2024-08871, DC-2025-04781, or DC-2026-00417.`);
      } else {
        const { count } = loadCredit(offline.fields, `Reference ${reference}`, `Use ${reference} as the base`);
        say("copilot",
          `Backend unreachable (${(err as ApiError).message}) — loaded ${reference} from the bundled archive. ${offline.corridor}.`,
          { kind: "bulk", title: `${reference} loaded`, count, lowConfidence: 0 });
      }
    }
    setBusy("");
  }

  /* -- journey 3: document extraction ------------------------------------ */
  async function onUpload(file: File) {
    say("user", `Uploaded ${file.name}`);
    setBusy(`Reading ${file.name}`);
    try {
      const result = await api.extract(file);
      const { count, low } = loadCredit(result.fields, file.name, "Document upload", result.confidences);
      say("copilot",
        `${result.note} ${count} fields populated${low ? `, ${low} below the ${CONFIDENCE_FLOOR} confidence floor and flagged amber` : ""}.`,
        { kind: "bulk", title: file.name, count, lowConfidence: low });
    } catch (err) {
      say("copilot",
        `Extraction failed: ${(err as ApiError).message}. The form is untouched — enter the credit manually or try a clearer scan.`);
    }
    setBusy("");
  }

  /* -- journeys 4 and 5: instructions ------------------------------------ */
  async function onSend(text: string) {
    const reference = text.match(REFERENCE_PATTERN);
    say("user", text);
    if (reference) {
      await loadFromReference(reference[0].toUpperCase());
      return;
    }

    setBusy("Working out the changes");
    try {
      const { reply, batches, degraded } = await api.amend(lc, text);
      if (!batches.length) {
        say("copilot", reply);
      } else if (batches.length === 1) {
        say("copilot", degraded ? reply : reply, {
          kind: "diff", changes: batches[0].changes, utterance: text,
        });
      } else {
        const drafted: Variant[] = batches.map((b, i) => {
          const fields = { ...lc, dcNumber: "" };
          b.changes.forEach((c) => { fields[c.key] = c.new_value; });
          return { ...b, id: `v${Date.now()}-${i}`, fields };
        });
        setVariants(drafted);
        setActiveVariant(null);
        setView("variants");
        say("copilot", `${reply} Open the variants view to compare and edit each one.`, {
          kind: "variants", names: drafted.map((v) => v.name),
        });
      }
    } catch (err) {
      const local = localAmend(lc, text);
      if (local.length) {
        say("copilot",
          `Copilot unreachable (${(err as ApiError).message}). Worked out ${local.length} change${local.length > 1 ? "s" : ""} locally — review carefully.`,
          { kind: "diff", changes: local, utterance: text });
      } else {
        say("copilot",
          `Copilot unreachable (${(err as ApiError).message}). The form still works — edit fields directly, or reload from a reference ID.`);
      }
    }
    setBusy("");
  }

  /* -- proposal lifecycle ------------------------------------------------- */
  function applyDiffs(changes: FieldDiff[], utterance: string) {
    if (!changes.length) return;
    const next = { ...lc };
    const nextMeta = { ...meta };
    const entries: Omit<AuditEntry, "at">[] = [];

    changes.forEach((c) => {
      entries.push({
        tag: c.tag, label: c.label, from: next[c.key] ?? "",
        to: c.new_value, source: "Copilot instruction", utterance,
      });
      next[c.key] = c.new_value;
      nextMeta[c.key] = { state: "accepted", source: "Copilot instruction", confidence: c.confidence };
    });

    setLc(next);
    setMeta(nextMeta);
    record(entries);
    pulse(changes.map((c) => c.key));
  }

  const decide = (mi: number, ci: number, decision: "accepted" | "rejected") =>
    setMessages((prev) =>
      prev.map((m, i) =>
        i !== mi || m.card?.kind !== "diff" ? m : {
          ...m,
          card: { ...m.card, changes: m.card.changes.map((c, j) => (j === ci ? { ...c, decision } : c)) },
        },
      ),
    );

  function onAcceptChange(mi: number, ci: number) {
    const card = messages[mi]?.card;
    if (card?.kind !== "diff") return;
    applyDiffs([card.changes[ci]], card.utterance);
    decide(mi, ci, "accepted");
  }

  function onAcceptBatch(mi: number) {
    const card = messages[mi]?.card;
    if (card?.kind !== "diff") return;
    applyDiffs(card.changes.filter((c) => !c.decision), card.utterance);
    setMessages((prev) =>
      prev.map((m, i) =>
        i !== mi || m.card?.kind !== "diff" ? m : {
          ...m,
          card: {
            ...m.card,
            changes: m.card.changes.map((c) => (c.decision ? c : { ...c, decision: "accepted" as const })),
          },
        },
      ),
    );
  }

  function onAcceptPending() {
    const keys = pending.map(([k]) => k);
    setMeta((prev) => {
      const next = { ...prev };
      keys.forEach((k) => { next[k] = { ...next[k], state: "accepted" }; });
      return next;
    });
    say("copilot", `${keys.length} fields accepted. They now count as reviewed for submission.`);
  }

  /* -- variants and submission ------------------------------------------- */
  function openVariant(v: Variant) {
    setActiveVariant(v.id);
    loadCredit(v.fields, v.name, `Open draft ${v.name}`);
    setView("form");
  }

  async function submit() {
    if (errorCount || pending.length) return;
    setBusy("Submitting for issue");
    try {
      const { draftId } = await api.saveDraft(lc);
      const { creditNumber: issued } = await api.submit(draftId);
      setLc((prev) => ({ ...prev, dcNumber: issued }));
      setCreditNumber(issued);
      setView("wire");
      say("copilot", `Issued as ${issued}. The wire view holds the outbound MT700 and the provenance tab holds the full trail.`);
    } catch (err) {
      say("copilot", `Submission failed: ${(err as ApiError).message}. Nothing was issued.`);
    }
    setBusy("");
  }

  const submitBlocker = pending.length
    ? "Accept the AI-populated fields first"
    : errorCount
      ? "Fix validation errors first"
      : "";

  return (
    <div className="lcx">
      <header className="top">
        <div className="brand">LC<i>·</i>COPILOT</div>
        <div className="tline">IMPORT DOCUMENTARY CREDIT · MT700 · UCP 600</div>
        <div className="pills">
          <span className="pill">{creditNumber ? "ISSUED" : "DRAFT"}</span>
          <span className={`pill${errorCount ? "" : " on"}`}>
            {errorCount ? `${errorCount} ERRORS` : "VALID"}
          </span>
        </div>
      </header>

      <div className="body">
        <main className="left">
          <div className="vbar">
            {(["form", "wire", "ledger", ...(variants.length ? ["variants" as const] : [])] as const).map((v) => (
              <button key={v} className={`vb${view === v ? " on" : ""}`} onClick={() => setView(v)}>
                {v === "form" ? "Application form" : v === "wire" ? "Wire view" : v === "ledger" ? "All credits" : `Variants (${variants.length})`}
              </button>
            ))}
            {pending.length > 0 && (
              <button className="btn accept-all" onClick={onAcceptPending}>
                Accept {pending.length} populated field{pending.length > 1 ? "s" : ""}
              </button>
            )}
          </div>

          {view === "form" && (
            <FormPane
              lc={lc} meta={meta} errors={errors} warnings={warnings} flash={flash}
              activeSection={section} onSection={setSection} onChange={onChange}
            />
          )}
          {view === "ledger" && (
            <LedgerPane onSelect={(reference) => {
              loadFromReference(reference);
              setView("form");
            }} />
          )}
          {view === "wire" && <WirePane lc={lc} creditNumber={creditNumber} />}
          {view === "variants" && (
            <VariantsPane
              variants={variants}
              activeId={activeVariant}
              onOpen={openVariant}
              onDiscard={() => { setVariants([]); setView("form"); }}
            />
          )}

          <footer className="foot">
            <div className="meter">
              <i style={{ width: `${Math.round((requiredDone / REQUIRED.length) * 100)}%` }} />
            </div>
            <span className="fstat"><b>{requiredDone}</b>/{REQUIRED.length} required</span>
            {errorCount > 0 && <span className="fstat bad"><b>{errorCount}</b> to fix</span>}
            {pending.length > 0 && (
              <span className="fstat warn">
                <b>{pending.length}</b> awaiting review
                {lowConfidence ? ` · ${lowConfidence} low confidence` : ""}
              </span>
            )}
            <div className="spacer" />
            <button className="btn" onClick={() => setView(view === "wire" ? "form" : "wire")}>
              {view === "wire" ? "Form view" : "Preview MT700"}
            </button>
            <button
              className="btn pri"
              disabled={!!errorCount || pending.length > 0 || !!creditNumber || !!busy}
              onClick={submit}
              title={submitBlocker}
            >
              {creditNumber ? "Issued" : "Submit for issue"}
            </button>
          </footer>
        </main>

        <Copilot
          messages={messages}
          audit={audit}
          busy={busy}
          lc={lc}
          pendingCount={pending.length}
          onSend={onSend}
          onUpload={onUpload}
          onAcceptChange={onAcceptChange}
          onRejectChange={(mi, ci) => decide(mi, ci, "rejected")}
          onAcceptBatch={onAcceptBatch}
          onAcceptPending={onAcceptPending}
          onShowVariants={() => setView("variants")}
        />
      </div>
    </div>
  );
}
