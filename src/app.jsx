import { useState, useRef, useCallback } from "react";

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const CATEGORIES = ["beers", "wines", "spirits", "softs", "pimms", "other"];

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map(s => s.trim().toLowerCase());
  return lines.slice(1).map((line, i) => {
    // Handle quoted fields
    const cols = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());

    const get = (key, fallback = "") => {
      const idx = header.indexOf(key);
      return idx >= 0 ? (cols[idx] ?? fallback) : fallback;
    };

    const allocations = {};
    CATEGORIES.forEach(cat => {
      const raw = get(cat, "0");
      allocations[cat] = { allocated: parseInt(raw) || 0, issued: 0, log: [] };
    });

    return {
      id: `t-${Date.now()}-${i}`,
      table: get("table", `Table ${i + 1}`),
      contact: get("contact", ""),
      company: get("company", ""),
      guests: parseInt(get("guests", "0")) || 0,
      arrival: get("arrival", ""),
      notes: get("notes", ""),
      allocations,
    };
  });
}

function exportCSV(tables) {
  const catHeaders = CATEGORIES.join(",");
  const issuedHeaders = CATEGORIES.map(c => `${c}_issued`).join(",");
  const header = `table,contact,company,guests,arrival,notes,${catHeaders},${issuedHeaders}`;
  const rows = tables.map(t => {
    const alloc = CATEGORIES.map(c => t.allocations[c]?.allocated ?? 0).join(",");
    const issued = CATEGORIES.map(c => t.allocations[c]?.issued ?? 0).join(",");
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    return `${esc(t.table)},${esc(t.contact)},${esc(t.company)},${t.guests},${esc(t.arrival)},${esc(t.notes)},${alloc},${issued}`;
  });
  return [header, ...rows].join("\n");
}

function exportAuditCSV(tables) {
  const rows = ["table,contact,company,category,amount,timestamp,note"];
  tables.forEach(t => {
    CATEGORIES.forEach(cat => {
      (t.allocations[cat]?.log ?? []).forEach(entry => {
        rows.push(`"${t.table}","${t.contact}","${t.company}","${cat}",${entry.amount},"${entry.ts}","${entry.note ?? ""}"`);
      });
    });
  });
  return rows.join("\n");
}

const SAMPLE_CSV = `table,contact,company,guests,arrival,notes,beers,wines,spirits,softs,pimms,other
Table 1,Sarah Chen,Apex Capital,8,19:00,VIP — champagne on arrival,24,12,6,12,0,0
Table 2,James Obi,Meridian Group,6,19:30,,18,6,0,12,0,0
Table 3,Priya Shah,Nova Partners,10,20:00,Pimm's jug requested,30,18,4,20,10,0
Table 4,Tom Reeves,Selfridges,4,19:00,,12,6,0,8,0,0
Table 5,Lucia Ferri,Hoxton Co,12,20:30,Late arrival expected,36,24,8,24,0,4`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Badge({ pct }) {
  const color = pct >= 100 ? "#ef4444" : pct >= 75 ? "#f59e0b" : "#22c55e";
  return (
    <span style={{
      display: "inline-block", minWidth: 36, padding: "1px 6px",
      borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      background: color + "22", color, border: `1px solid ${color}55`,
      fontFamily: "monospace"
    }}>
      {Math.round(pct)}%
    </span>
  );
}

function IssueDrawer({ table, cat, onClose, onIssue }) {
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState("");
  const alloc = table.allocations[cat];
  const remaining = alloc.allocated - alloc.issued;

  const handle = (delta) => {
    const next = Math.max(0, Math.min(remaining, amount + delta));
    setAmount(next);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", background: "#1a1a1a", borderTop: "2px solid #f59e0b",
        borderRadius: "16px 16px 0 0", padding: "20px 20px 32px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.6)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ color: "#f59e0b", fontWeight: 800, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Issue · {cat}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 2 }}>{table.table}</div>
        <div style={{ color: "#888", fontSize: 12, marginBottom: 16 }}>{table.contact}{table.company ? ` · ${table.company}` : ""}</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {[["Allocated", alloc.allocated], ["Issued", alloc.issued], ["Remaining", remaining]].map(([label, val]) => (
            <div key={label} style={{ flex: 1, background: "#111", borderRadius: 8, padding: "8px 4px", textAlign: "center" }}>
              <div style={{ color: "#555", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
              <div style={{ color: "#fff", fontSize: 22, fontWeight: 800, fontFamily: "monospace" }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => handle(-5)} style={spinBtn}> -5 </button>
          <button onClick={() => handle(-1)} style={spinBtn}> -1 </button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 36, fontWeight: 900, color: "#f59e0b", fontFamily: "monospace" }}>
            {amount}
          </div>
          <button onClick={() => handle(1)} style={{ ...spinBtn, background: "#f59e0b22", color: "#f59e0b" }}> +1 </button>
          <button onClick={() => handle(5)} style={{ ...spinBtn, background: "#f59e0b22", color: "#f59e0b" }}> +5 </button>
        </div>

        <input
          placeholder="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{
            width: "100%", background: "#111", border: "1px solid #333", borderRadius: 8,
            color: "#fff", padding: "10px 12px", fontSize: 14, marginBottom: 12,
            outline: "none", boxSizing: "border-box"
          }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "13px 0", borderRadius: 8, border: "1px solid #333",
            background: "none", color: "#888", fontSize: 15, fontWeight: 700, cursor: "pointer"
          }}>Cancel</button>
          <button
            disabled={amount === 0 || remaining === 0}
            onClick={() => { onIssue(amount, note); onClose(); }}
            style={{
              flex: 2, padding: "13px 0", borderRadius: 8, border: "none",
              background: amount === 0 || remaining === 0 ? "#333" : "#f59e0b",
              color: amount === 0 || remaining === 0 ? "#555" : "#000",
              fontSize: 15, fontWeight: 800, cursor: "pointer", letterSpacing: "0.03em"
            }}
          >
            Issue {amount} {cat}
          </button>
        </div>

        {alloc.log.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid #222", paddingTop: 12 }}>
            <div style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Log</div>
            {[...alloc.log].reverse().slice(0, 5).map((entry, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 4 }}>
                <span style={{ color: "#22c55e", fontFamily: "monospace" }}>+{entry.amount}</span>
                <span style={{ flex: 1, padding: "0 8px" }}>{entry.note || "—"}</span>
                <span>{entry.ts}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const spinBtn = {
  width: 44, height: 44, borderRadius: 8, border: "1px solid #333",
  background: "#111", color: "#aaa", fontSize: 14, fontWeight: 700,
  cursor: "pointer", flexShrink: 0
};

function TableCard({ table, onIssue }) {
  const [expanded, setExpanded] = useState(false);
  const [drawer, setDrawer] = useState(null); // cat string

  const activeCats = CATEGORIES.filter(c => (table.allocations[c]?.allocated ?? 0) > 0);
  const totalAlloc = activeCats.reduce((s, c) => s + table.allocations[c].allocated, 0);
  const totalIssued = activeCats.reduce((s, c) => s + table.allocations[c].issued, 0);
  const pct = totalAlloc > 0 ? (totalIssued / totalAlloc) * 100 : 0;

  return (
    <>
      <div style={{
        background: "#161616", border: "1px solid #2a2a2a", borderRadius: 12,
        marginBottom: 8, overflow: "hidden",
        borderLeft: pct >= 100 ? "3px solid #ef4444" : pct >= 75 ? "3px solid #f59e0b" : "3px solid #2a2a2a"
      }}>
        {/* Header row */}
        <div
          onClick={() => setExpanded(e => !e)}
          style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: "#f59e0b", fontWeight: 800, fontSize: 15, letterSpacing: "0.02em" }}>
                {table.table}
              </span>
              {table.arrival && (
                <span style={{ color: "#555", fontSize: 11 }}>⏱ {table.arrival}</span>
              )}
              {table.guests > 0 && (
                <span style={{ color: "#555", fontSize: 11 }}>👥 {table.guests}</span>
              )}
            </div>
            <div style={{ color: "#888", fontSize: 12, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {table.contact}{table.company ? ` · ${table.company}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "#fff", fontWeight: 700 }}>
              {totalIssued}<span style={{ color: "#444" }}>/{totalAlloc}</span>
            </div>
            <Badge pct={pct} />
          </div>
          <span style={{ color: "#444", fontSize: 12, marginLeft: 4 }}>{expanded ? "▲" : "▼"}</span>
        </div>

        {/* Category grid */}
        {expanded && (
          <div style={{ borderTop: "1px solid #222", padding: "10px 14px 14px" }}>
            {table.notes && (
              <div style={{ background: "#0f0f0f", borderRadius: 6, padding: "6px 10px", marginBottom: 10, fontSize: 12, color: "#888", borderLeft: "2px solid #f59e0b55" }}>
                📝 {table.notes}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CATEGORIES.map(cat => {
                const alloc = table.allocations[cat];
                if (!alloc || alloc.allocated === 0) return null;
                const catPct = alloc.allocated > 0 ? (alloc.issued / alloc.allocated) * 100 : 0;
                const remaining = alloc.allocated - alloc.issued;
                return (
                  <button
                    key={cat}
                    onClick={() => setDrawer(cat)}
                    style={{
                      background: "#111", border: "1px solid #2a2a2a", borderRadius: 8,
                      padding: "10px 12px", cursor: "pointer", textAlign: "left",
                      transition: "border-color 0.15s"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ color: "#aaa", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{cat}</span>
                      <Badge pct={catPct} />
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 900, color: remaining === 0 ? "#ef4444" : "#fff" }}>
                      {alloc.issued}<span style={{ color: "#333", fontSize: 14, fontWeight: 400 }}>/{alloc.allocated}</span>
                    </div>
                    <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: "#222", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(catPct, 100)}%`, background: catPct >= 100 ? "#ef4444" : catPct >= 75 ? "#f59e0b" : "#22c55e", borderRadius: 2 }} />
                    </div>
                    <div style={{ color: "#555", fontSize: 10, marginTop: 3 }}>
                      {remaining > 0 ? `${remaining} remaining` : "EXHAUSTED"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {drawer && (
        <IssueDrawer
          table={table}
          cat={drawer}
          onClose={() => setDrawer(null)}
          onIssue={(amt, note) => onIssue(table.id, drawer, amt, note)}
        />
      )}
    </>
  );
}

// ─── Totals footer ────────────────────────────────────────────────────────────

function TotalsBar({ tables }) {
  const totals = CATEGORIES.map(cat => {
    const alloc = tables.reduce((s, t) => s + (t.allocations[cat]?.allocated ?? 0), 0);
    const issued = tables.reduce((s, t) => s + (t.allocations[cat]?.issued ?? 0), 0);
    return { cat, alloc, issued };
  }).filter(t => t.alloc > 0);

  if (totals.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "#0d0d0d", borderTop: "1px solid #2a2a2a",
      padding: "10px 14px 16px", zIndex: 50
    }}>
      <div style={{ color: "#555", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Running totals</div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
        {totals.map(({ cat, alloc, issued }) => (
          <div key={cat} style={{ flexShrink: 0, textAlign: "center" }}>
            <div style={{ color: "#555", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat}</div>
            <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 800, color: issued >= alloc ? "#ef4444" : "#fff" }}>
              {issued}<span style={{ color: "#333" }}>/{alloc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onLoad }) {
  const [csvText, setCsvText] = useState("");
  const [eventName, setEventName] = useState("Chukka Club");
  const [error, setError] = useState("");
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const handleLoad = () => {
    setError("");
    if (!csvText.trim()) { setError("Paste or upload a CSV first."); return; }
    const tables = parseCSV(csvText);
    if (tables.length === 0) { setError("No data rows found — check CSV format."); return; }
    onLoad(tables, eventName);
  };

  const handleSample = () => {
    setCsvText(SAMPLE_CSV);
    setEventName("Chukka Club — Sample Event");
  };

  const inputStyle = {
    width: "100%", background: "#111", border: "1px solid #2a2a2a", borderRadius: 8,
    color: "#fff", padding: "11px 14px", fontSize: 14, outline: "none",
    boxSizing: "border-box", marginBottom: 10
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ color: "#f59e0b", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>Chukka Club</div>
          <div style={{ color: "#fff", fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Tab Manager</div>
          <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>Load your booked tables to begin</div>
        </div>

        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 11, color: "#666", lineHeight: 1.6 }}>
          <div style={{ color: "#888", marginBottom: 4, fontWeight: 700 }}>CSV columns:</div>
          <code style={{ color: "#f59e0b", wordBreak: "break-all" }}>table, contact, company, guests, arrival, notes, beers, wines, spirits, softs, pimms, other</code>
        </div>

        <input style={inputStyle} placeholder="Event name" value={eventName} onChange={e => setEventName(e.target.value)} />

        <textarea
          style={{ ...inputStyle, height: 130, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          placeholder="Paste CSV here…"
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={() => fileRef.current.click()} style={{
            flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid #2a2a2a",
            background: "none", color: "#aaa", fontSize: 13, fontWeight: 700, cursor: "pointer"
          }}>
            📂 Upload CSV
          </button>
          <button onClick={handleSample} style={{
            flex: 1, padding: "11px 0", borderRadius: 8, border: "1px solid #2a2a2a",
            background: "none", color: "#aaa", fontSize: 13, fontWeight: 700, cursor: "pointer"
          }}>
            🎲 Load Sample
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleFile} />

        {error && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8, padding: "8px 12px", background: "#ef444411", borderRadius: 6 }}>{error}</div>}

        <button onClick={handleLoad} style={{
          width: "100%", padding: "14px 0", borderRadius: 8, border: "none",
          background: "#f59e0b", color: "#000", fontSize: 16, fontWeight: 800,
          cursor: "pointer", letterSpacing: "0.02em"
        }}>
          Start Session →
        </button>
      </div>
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("setup"); // setup | live
  const [eventName, setEventName] = useState("");
  const [tables, setTables] = useState([]);
  const [search, setSearch] = useState("");

  const handleLoad = (loadedTables, name) => {
    setTables(loadedTables);
    setEventName(name);
    setScreen("live");
  };

  const handleIssue = useCallback((tableId, cat, amount, note) => {
    const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    setTables(prev => prev.map(t => {
      if (t.id !== tableId) return t;
      const alloc = t.allocations[cat];
      const newIssued = Math.min(alloc.issued + amount, alloc.allocated);
      return {
        ...t,
        allocations: {
          ...t.allocations,
          [cat]: {
            ...alloc,
            issued: newIssued,
            log: [...alloc.log, { amount, ts, note }]
          }
        }
      };
    }));
  }, []);

  const handleExport = () => {
    const csv = exportCSV(tables);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${eventName.replace(/\s+/g, "_")}_tabs.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleAuditExport = () => {
    const csv = exportAuditCSV(tables);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${eventName.replace(/\s+/g, "_")}_audit.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (screen === "setup") return <SetupScreen onLoad={handleLoad} />;

  const filtered = tables.filter(t => {
    const q = search.toLowerCase();
    return !q || t.table.toLowerCase().includes(q) || t.contact.toLowerCase().includes(q) || t.company.toLowerCase().includes(q);
  });

  // Sort: exhausted last, highest % first
  const sorted = [...filtered].sort((a, b) => {
    const pct = t => {
      const alloc = CATEGORIES.reduce((s, c) => s + (t.allocations[c]?.allocated ?? 0), 0);
      const issued = CATEGORIES.reduce((s, c) => s + (t.allocations[c]?.issued ?? 0), 0);
      return alloc > 0 ? issued / alloc : 0;
    };
    return pct(b) - pct(a);
  });

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", paddingBottom: 90 }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 60,
        background: "#0a0a0a", borderBottom: "1px solid #1a1a1a",
        padding: "10px 14px 8px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ color: "#f59e0b", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700 }}>Tab Manager</div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{eventName}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleAuditExport} title="Export audit log" style={headerBtn}>📋</button>
            <button onClick={handleExport} title="Export tabs CSV" style={headerBtn}>💾</button>
            <button onClick={() => setScreen("setup")} title="Load new event" style={headerBtn}>⚙️</button>
          </div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tables, contacts…"
          style={{
            width: "100%", background: "#111", border: "1px solid #222", borderRadius: 8,
            color: "#fff", padding: "8px 12px", fontSize: 14, outline: "none",
            boxSizing: "border-box"
          }}
        />
        <div style={{ color: "#444", fontSize: 11, marginTop: 5 }}>
          {sorted.length} tables · tap to expand · tap category to issue
        </div>
      </div>

      {/* Table cards */}
      <div style={{ padding: "10px 14px 0" }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", color: "#444", padding: "60px 0", fontSize: 14 }}>No tables match search</div>
        ) : (
          sorted.map(t => <TableCard key={t.id} table={t} onIssue={handleIssue} />)
        )}
      </div>

      <TotalsBar tables={tables} />
    </div>
  );
}

const headerBtn = {
  width: 36, height: 36, borderRadius: 8, border: "1px solid #2a2a2a",
  background: "#111", cursor: "pointer", fontSize: 16, display: "flex",
  alignItems: "center", justifyContent: "center"
};
