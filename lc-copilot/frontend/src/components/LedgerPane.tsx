import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface LCEntry {
  reference: string;
  corridor: string;
  applicant: string;
  beneficiary: string;
  adviseThrough: string;
  amount: string;
  currency: string;
}

interface Props {
  onSelect: (reference: string) => void;
}

export default function LedgerPane({ onSelect }: Props) {
  const [ledger, setLedger] = useState<LCEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const fetchLedger = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/lc/history");
        if (!response.ok) throw new Error("Failed to fetch ledger");
        const data = await response.json();
        setLedger(data);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchLedger();
  }, []);

  const truncate = (text: string, maxLength: number = 40) => {
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  };

  return (
    <div className="scroll">
      <div style={{ padding: "16px" }}>
        <h2>All Letters of Credit</h2>
        
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: "red" }}>Error: {error}</p>}
        
        {!loading && ledger.length === 0 && (
          <p>No letters of credit found in the database.</p>
        )}

        {!loading && ledger.length > 0 && (
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "12px",
            fontSize: "14px",
          }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333", backgroundColor: "#f5f5f5" }}>
                <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>Reference</th>
                <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>Corridor</th>
                <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>Applicant</th>
                <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>Beneficiary</th>
                <th style={{ padding: "8px", textAlign: "left", fontWeight: "bold" }}>Advise Through</th>
                <th style={{ padding: "8px", textAlign: "right", fontWeight: "bold" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((lc, idx) => (
                <tr
                  key={lc.reference}
                  onClick={() => onSelect(lc.reference)}
                  style={{
                    borderBottom: "1px solid #ddd",
                    backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fafafa",
                    cursor: "pointer",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e8f4f8")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "#ffffff" : "#fafafa")}
                >
                  <td style={{ padding: "8px", fontWeight: "500", color: "#0066cc" }}>{lc.reference}</td>
                  <td style={{ padding: "8px" }}>{lc.corridor}</td>
                  <td style={{ padding: "8px" }} title={lc.applicant}>{truncate(lc.applicant)}</td>
                  <td style={{ padding: "8px" }} title={lc.beneficiary}>{truncate(lc.beneficiary)}</td>
                  <td style={{ padding: "8px" }} title={lc.adviseThrough}>{truncate(lc.adviseThrough)}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontWeight: "500" }}>
                    {lc.amount && `${lc.currency} ${lc.amount}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
