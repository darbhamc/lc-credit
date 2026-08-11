import { toWire } from "../lib/wire";
import type { LCFields } from "../lib/types";

interface Props {
  lc: LCFields;
  creditNumber: string | null;
}

/**
 * The signature view: the application rendered as the message that actually
 * goes on the wire. Same object, different reading.
 */
export default function WirePane({ lc, creditNumber }: Props) {
  return (
    <div className="scroll">
      <div className="wire">
        {creditNumber && (
          <p className="issued">Credit issued as {creditNumber}. Outbound MT700 below.</p>
        )}
        <header className="whd">
          <span>MT700 · Issue of a documentary credit</span>
          <em>{creditNumber ?? "DRAFT — NOT TRANSMITTED"}</em>
        </header>
        {toWire(lc).map((line, i) => (
          <div className="wl" key={`${line.tag}-${i}`}>
            <b>:{line.tag}:</b>
            <span>{line.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
