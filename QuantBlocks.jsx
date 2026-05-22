import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";

/* ============================================================
   CELERIE — drag-and-drop quantitative model builder
   with an embedded LLM agent (Builder + Tutor roles).
   The canvas is a JSON graph; the agent reads & writes it.
   ============================================================ */

// ---- math helpers ----
const erf = (x) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const N = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
const d1 = (S, K, r, s, T) => (Math.log(S / K) + (r + (s * s) / 2) * T) / (s * Math.sqrt(T));
const d2v = (S, K, r, s, T) => d1(S, K, r, s, T) - s * Math.sqrt(T);

// ---- category palette ----
const CAT = {
  data:      { c: "#2563EB", label: "Data" },
  valuation: { c: "#B45309", label: "Valuation" },
  hedging:   { c: "#7C3AED", label: "Hedging" },
  filtering: { c: "#4A7C59", label: "Filtering (Physics)" },
  advanced:  { c: "#DC2626", label: "Advanced" },
  output:    { c: "#78716C", label: "Output" },
};

// safe-ish expression evaluator for the advanced formula-cell tier
const safeEval = (expr, scope) => {
  try {
    const f = new Function("a", "b", "c", "Math", `return (${expr || "0"});`);
    const r = f(scope.a ?? 0, scope.b ?? 0, scope.c ?? 0, Math);
    return Number.isFinite(r) ? r : undefined;
  } catch {
    return undefined;
  }
};

// ---- block registry. The agent is given this same vocabulary. ----
const DEFS = {
  spot:   { label: "Spot Price",        cat: "data",      out: true, params: { value: 100 },  inputs: [], compute: (_, p) => +p.value },
  strike: { label: "Strike Price",      cat: "data",      out: true, params: { value: 100 },  inputs: [], compute: (_, p) => +p.value },
  rate:   { label: "Risk-Free Rate",    cat: "data",      out: true, params: { value: 0.05 }, inputs: [], compute: (_, p) => +p.value },
  vol:    { label: "Volatility σ",      cat: "data",      out: true, params: { value: 0.2 },  inputs: [], compute: (_, p) => +p.value },
  time:   { label: "Time to Expiry",    cat: "data",      out: true, params: { value: 1 },    inputs: [], compute: (_, p) => +p.value },
  series: { label: "Noisy Price Series",cat: "data",      out: true, params: {},              inputs: [], concept: true },

  bs_call: { label: "Black–Scholes Call", cat: "valuation", out: true,
    inputs: [{ name: "S" }, { name: "K" }, { name: "r" }, { name: "sigma" }, { name: "T" }],
    compute: (i) => i.S * N(d1(i.S, i.K, i.r, i.sigma, i.T)) - i.K * Math.exp(-i.r * i.T) * N(d2v(i.S, i.K, i.r, i.sigma, i.T)) },
  bs_put: { label: "Black–Scholes Put",  cat: "valuation", out: true,
    inputs: [{ name: "S" }, { name: "K" }, { name: "r" }, { name: "sigma" }, { name: "T" }],
    compute: (i) => i.K * Math.exp(-i.r * i.T) * N(-d2v(i.S, i.K, i.r, i.sigma, i.T)) - i.S * N(-d1(i.S, i.K, i.r, i.sigma, i.T)) },

  delta: { label: "Option Delta", cat: "hedging", out: true,
    inputs: [{ name: "S" }, { name: "K" }, { name: "r" }, { name: "sigma" }, { name: "T" }],
    compute: (i) => N(d1(i.S, i.K, i.r, i.sigma, i.T)) },

  // Cornwall-style binary-event mispricing: your probability vs the market's.
  binary_event: { label: "Binary-Event Edge", cat: "valuation", out: true, inputs: [],
    multiparam: true, params: { payoff: 100, mktProb: 0.05, myProb: 0.3 },
    compute: (_, p) => (+p.myProb) / (+p.mktProb) },

  ema:    { label: "EMA Denoise",   cat: "filtering", out: true, inputs: [{ name: "series" }], concept: true },
  kalman: { label: "Kalman Filter", cat: "filtering", out: true, inputs: [{ name: "series" }], concept: true },

  formula: { label: "Custom Formula", cat: "advanced", out: true,
    inputs: [{ name: "a" }, { name: "b" }, { name: "c" }],
    isFormula: true, params: { expr: "a * b + c" },
    compute: (i, p) => safeEval(p.expr, i) },

  output: { label: "Display", cat: "output", out: false, inputs: [{ name: "value" }], compute: (i) => i.value },
};

const NODE_W = 196, HEADER = 42, ROW = 26;
const inPortY  = (i) => HEADER + 18 + i * ROW;
const outPortY = (n) => HEADER + 18 + (Math.max(n, 1) - 1) * (ROW / 2);

const fmt = (v) =>
  v == null || Number.isNaN(v) ? "—" : Math.abs(v) >= 100 ? v.toFixed(2) : Math.abs(v) < 1 ? v.toFixed(4) : v.toFixed(3);

let _id = 0;
const uid = () => `b${++_id}`;

// ---- seed model so the canvas opens with something live ----
const seed = () => {
  const ids = { S: uid(), K: uid(), r: uid(), s: uid(), T: uid(), bs: uid(), o: uid() };
  return {
    blocks: [
      { id: ids.S,  type: "spot",    x: 40,  y: 60,  params: { value: 100 } },
      { id: ids.K,  type: "strike",  x: 40,  y: 150, params: { value: 100 } },
      { id: ids.r,  type: "rate",    x: 40,  y: 240, params: { value: 0.05 } },
      { id: ids.s,  type: "vol",     x: 40,  y: 330, params: { value: 0.2 } },
      { id: ids.T,  type: "time",    x: 40,  y: 420, params: { value: 1 } },
      { id: ids.bs, type: "bs_call", x: 320, y: 190, params: {} },
      { id: ids.o,  type: "output",  x: 600, y: 230, params: {} },
    ],
    connections: [
      { from: ids.S, to: ids.bs, toPort: "S" },
      { from: ids.K, to: ids.bs, toPort: "K" },
      { from: ids.r, to: ids.bs, toPort: "r" },
      { from: ids.s, to: ids.bs, toPort: "sigma" },
      { from: ids.T, to: ids.bs, toPort: "T" },
      { from: ids.bs, to: ids.o, toPort: "value" },
    ],
  };
};

// ---- evaluation engine over the JSON graph ----
function evaluate(blocks, connections) {
  const vals = {};
  const inputsFor = (b) => {
    const inp = {};
    (DEFS[b.type].inputs || []).forEach((p) => {
      const c = connections.find((c) => c.to === b.id && c.toPort === p.name);
      inp[p.name] = c ? vals[c.from] : undefined;
    });
    return inp;
  };
  for (let pass = 0; pass < blocks.length + 2; pass++) {
    blocks.forEach((b) => {
      const d = DEFS[b.type];
      if (d.concept) { vals[b.id] = undefined; return; }
      const inp = inputsFor(b);
      const ready = (d.inputs || []).every((p) => inp[p.name] !== undefined);
      if ((ready || d.isFormula) && d.compute) vals[b.id] = d.compute(inp, b.params || {});
    });
  }
  return vals;
}

export default function App() {
  const [{ blocks, connections }, setGraph] = useState(seed);
  const [selected,   setSelected]   = useState(null);
  const [pending,    setPending]    = useState(null);
  const [drag,       setDrag]       = useState(null);
  const [prompt,     setPrompt]     = useState("Price a European put option");
  const [status,     setStatus]     = useState("");
  const [busy,       setBusy]       = useState(false);
  const [explain,    setExplain]    = useState("");
  const [explaining, setExplaining] = useState(false);
  const canvasRef = useRef(null);

  const vals = useMemo(() => evaluate(blocks, connections), [blocks, connections]);

  const setBlocks = (fn) => setGraph((g) => ({ ...g, blocks: fn(g.blocks) }));
  const setConns  = (fn) => setGraph((g) => ({ ...g, connections: fn(g.connections) }));

  // ---- dragging ----
  const onPointerMove = useCallback((e) => {
    if (!drag) return;
    const r = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - r.left - drag.dx, y = e.clientY - r.top - drag.dy;
    setBlocks((bs) => bs.map((b) => (b.id === drag.id ? { ...b, x, y } : b)));
  }, [drag]);
  const onPointerUp = () => setDrag(null);

  const startDrag = (e, b) => {
    e.stopPropagation();
    const r = canvasRef.current.getBoundingClientRect();
    setDrag({ id: b.id, dx: e.clientX - r.left - b.x, dy: e.clientY - r.top - b.y });
    setSelected(b.id);
  };

  // ---- ports / connections ----
  const clickOut = (e, id) => { e.stopPropagation(); setPending({ id }); };
  const clickIn  = (e, id, port) => {
    e.stopPropagation();
    if (!pending) return;
    setConns((cs) => [...cs.filter((c) => !(c.to === id && c.toPort === port)), { from: pending.id, to: id, toPort: port }]);
    setPending(null);
  };

  const addBlock = (type) => {
    const r = canvasRef.current.getBoundingClientRect();
    setBlocks((bs) => [...bs, { id: uid(), type, x: r.width / 2 - 100 + Math.random() * 40, y: 80 + Math.random() * 60, params: { ...DEFS[type].params } }]);
  };
  const delBlock = (id) => {
    setGraph((g) => ({ blocks: g.blocks.filter((b) => b.id !== id), connections: g.connections.filter((c) => c.from !== id && c.to !== id) }));
    if (selected === id) setSelected(null);
  };
  const setParam = (id, k, v) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, params: { ...b.params, [k]: v } } : b)));

  // ---- LLM agent: BUILDER ----
  const vocab = Object.entries(DEFS)
    .map(([t, d]) => `${t} (${d.cat}${d.inputs?.length ? ", inputs: " + d.inputs.map((i) => i.name).join("/") : ""})`)
    .join("; ");

  const callClaude = async (system, content) => {
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, content, model: "claude-sonnet-4-6", max_tokens: 1024 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `agent backend returned ${res.status}`);
    }
    const data = await res.json();
    return data.text || "";
  };

  const build = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setStatus("Agent is assembling blocks…");
    try {
      const sys = `You are the build agent for a visual quant-model canvas. Convert the user's request into a model graph.
Available block types: ${vocab}.
A model usually wires data blocks (spot/strike/rate/vol/time) into a valuation or hedging block, then into an output block.
Two special blocks take params instead of wires:
- binary_event: params {payoff, mktProb, myProb} — for "market prices a 5% chance but I think 30%" style mispricing. Set mktProb/myProb as decimals.
- formula: param {expr} — a free-form expression using vars a, b, c (e.g. "a*b+c"). Wire numbers into ports a/b/c if needed.
Return ONLY raw JSON, no prose, no markdown fences, in this exact shape:
{"blocks":[{"id":"n1","type":"binary_event","params":{"mktProb":0.05,"myProb":0.3,"payoff":100}}],"connections":[{"from":"n1","to":"n6","toPort":"value"}]}
Use short ids like n1,n2. toPort must match the target block's input names. Do not invent block types.`;
      const raw = (await callClaude(sys, prompt)).replace(/```json|```/g, "").trim();
      const spec = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));

      const map = {};
      const cols = { data: 40, filtering: 40, valuation: 340, hedging: 340, advanced: 340, output: 640 };
      const stack = {};
      const nb = spec.blocks.filter((b) => DEFS[b.type]).map((b) => {
        const nid = uid(); map[b.id] = nid;
        const cat = DEFS[b.type].cat;
        stack[cat] = (stack[cat] || 0) + 1;
        return { id: nid, type: b.type, x: cols[cat] ?? 340, y: 50 + (stack[cat] - 1) * 92, params: { ...DEFS[b.type].params, ...(b.params || {}) } };
      });
      const nc = (spec.connections || [])
        .filter((c) => map[c.from] && map[c.to])
        .map((c) => ({ from: map[c.from], to: map[c.to], toPort: c.toPort }));
      setGraph({ blocks: nb, connections: nc });
      setStatus(`Built ${nb.length} blocks.`);
    } catch (e) {
      setStatus(`Couldn't build that — ${e?.message || "try rephrasing."}`);
    } finally { setBusy(false); }
  };

  // ---- LLM agent: TUTOR ----
  const tutor = async () => {
    const b = blocks.find((x) => x.id === selected);
    if (!b) return;
    setExplaining(true); setExplain("");
    try {
      const sys = `You are a quant-finance tutor for a first-year economics student aiming for investment banking / private equity. Explain the concept behind a model block clearly, with intuition first, in under 110 words. No markdown headers.`;
      const txt = await callClaude(sys, `Explain the "${DEFS[b.type].label}" block and why it matters in a quantitative model.`);
      setExplain(txt);
    } catch (e) { setExplain(`Couldn't reach the tutor agent — ${e?.message || "backend unreachable."}`); }
    finally { setExplaining(false); }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Delete" && selected) delBlock(selected); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // ---- connection paths ----
  const portPos = (b, kind, idx) => {
    const d = DEFS[b.type];
    if (kind === "out") return { x: b.x + NODE_W, y: b.y + outPortY((d.inputs || []).length) };
    return { x: b.x, y: b.y + inPortY(idx) };
  };

  const selectedBlock = blocks.find((b) => b.id === selected);

  return (
    <div style={st.app}>
      <style>{css}</style>

      {/* top bar */}
      <header style={st.top}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={st.logoWrap}>
            <span style={st.logo}>Celerie</span>
            <span style={st.logoLeaf}>✦</span>
          </div>
          <span style={st.divider} />
          <span style={st.tag}>visual quant canvas · agent-assisted</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={st.live}><span className="dot" />live compute</span>
          <button className="btn-ghost" style={st.ghost} onClick={() => setGraph(seed())}>Reset</button>
          <button className="btn-ghost" style={st.ghost} onClick={() => setGraph({ blocks: [], connections: [] })}>Clear</button>
        </div>
      </header>

      <div style={st.body}>
        {/* palette */}
        <aside style={st.palette}>
          <div style={st.palHeader}>Blocks</div>
          {Object.entries(CAT).filter(([k]) => k !== "output").map(([cat, meta]) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div style={{ ...st.catLabel, color: meta.c }}>
                <span style={{ ...st.catDot, background: meta.c }} />
                {meta.label}
              </div>
              {Object.entries(DEFS).filter(([, d]) => d.cat === cat).map(([t, d]) => (
                <button key={t} className="palItem" style={{ ...st.palItem, borderLeftColor: meta.c }} onClick={() => addBlock(t)}>
                  <span>{d.label}</span>
                  {d.concept && <span style={{ ...st.badge, color: meta.c, borderColor: `${meta.c}44`, background: `${meta.c}0e` }}>concept</span>}
                </button>
              ))}
            </div>
          ))}
          <div>
            <div style={{ ...st.catLabel, color: CAT.output.c }}>
              <span style={{ ...st.catDot, background: CAT.output.c }} />
              Output
            </div>
            <button className="palItem" style={{ ...st.palItem, borderLeftColor: CAT.output.c }} onClick={() => addBlock("output")}>Display</button>
          </div>
        </aside>

        {/* canvas */}
        <main
          ref={canvasRef}
          className="canvas"
          style={st.canvas}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => { setSelected(null); setPending(null); }}
        >
          <svg style={st.svg}>
            {connections.map((c, i) => {
              const fb = blocks.find((b) => b.id === c.from), tb = blocks.find((b) => b.id === c.to);
              if (!fb || !tb) return null;
              const idx = (DEFS[tb.type].inputs || []).findIndex((p) => p.name === c.toPort);
              const s = portPos(fb, "out"), t = portPos(tb, "in", idx);
              return (
                <path key={i} d={`M${s.x},${s.y} C${s.x + 60},${s.y} ${t.x - 60},${t.y} ${t.x},${t.y}`}
                  fill="none" stroke="var(--wire)" strokeWidth="1.5" strokeDasharray="none" />
              );
            })}
          </svg>

          {blocks.map((b) => {
            const d = DEFS[b.type], meta = CAT[d.cat], v = vals[b.id];
            const sel = selected === b.id;
            return (
              <div
                key={b.id}
                style={{
                  ...st.node,
                  left: b.x,
                  top: b.y,
                  borderColor: sel ? meta.c : "var(--line)",
                  boxShadow: sel
                    ? `0 0 0 2px ${meta.c}33, 0 8px 24px rgba(29,31,16,.12)`
                    : "0 1px 3px rgba(29,31,16,.07), 0 4px 12px rgba(29,31,16,.05)",
                }}
              >
                {/* colored top accent strip */}
                <div style={{ ...st.nodeAccent, background: meta.c }} />

                <div style={st.nodeHead} onPointerDown={(e) => startDrag(e, b)}>
                  <span style={st.nodeTitle}>{d.label}</span>
                  <span className="x" style={st.x} onClick={(e) => { e.stopPropagation(); delBlock(b.id); }}>×</span>
                </div>

                {/* input port rows */}
                {(d.inputs || []).map((p, i) => (
                  <div key={p.name} style={{ ...st.portRow, top: inPortY(i) - 10 }}>
                    <span className="port in" style={{ ...st.port, borderColor: meta.c }} onClick={(e) => clickIn(e, b.id, p.name)} />
                    <span style={st.portLbl}>{p.name}</span>
                  </div>
                ))}

                {/* single-param data blocks */}
                {d.out && (!d.inputs || !d.inputs.length) && !d.concept && !d.multiparam && (
                  <div style={st.paramBox}>
                    <input
                      className="field"
                      style={st.input}
                      type="number"
                      step="any"
                      value={b.params.value}
                      onChange={(e) => setParam(b.id, "value", e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}

                {/* binary-event mispricing inputs */}
                {d.multiparam && (
                  <div style={{ padding: "8px 12px 2px" }}>
                    {[["payoff", "payoff if hit"], ["mktProb", "mkt prob"], ["myProb", "your prob"]].map(([k, lbl]) => (
                      <div key={k} style={st.miniRow}>
                        <span style={st.miniLbl}>{lbl}</span>
                        <input
                          className="field"
                          style={st.miniInput}
                          type="number"
                          step="any"
                          value={b.params[k]}
                          onChange={(e) => setParam(b.id, k, e.target.value)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ))}
                    <div style={st.subVal}>
                      fair {fmt((+b.params.myProb) * (+b.params.payoff))} · mkt {fmt((+b.params.mktProb) * (+b.params.payoff))}
                    </div>
                  </div>
                )}

                {/* formula cell */}
                {d.isFormula && (
                  <div style={{ padding: "8px 12px 2px" }}>
                    <textarea
                      className="field formula-cell"
                      style={st.formulaCell}
                      rows={2}
                      value={b.params.expr}
                      spellCheck={false}
                      onChange={(e) => setParam(b.id, "expr", e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div style={st.formulaHint}>vars: a, b, c · Math.*</div>
                  </div>
                )}

                {/* computed value */}
                {!d.concept && (d.inputs?.length || d.multiparam || d.type === "output") ? (
                  <div style={{ ...st.valBox, color: meta.c }}>
                    {d.cat === "output" ? "= " : ""}{fmt(v)}{d.multiparam && <span style={st.edgeTag}>× edge</span>}
                  </div>
                ) : null}
                {d.concept && <div style={st.conceptBox}>physics / signal block</div>}

                {/* output port */}
                {d.out && (
                  <span
                    className="port out"
                    style={{ ...st.port, ...st.outPort, top: outPortY((d.inputs || []).length) - 6, borderColor: meta.c }}
                    onClick={(e) => clickOut(e, b.id)}
                  />
                )}
              </div>
            );
          })}

          {pending && (
            <div style={st.hint}>click an input port to connect →</div>
          )}
        </main>

        {/* agent panel */}
        <aside style={st.agent}>
          <div style={st.agentBrand}>
            <span style={st.agentIcon}>◆</span>
            <span style={st.agentTitle}>Agent</span>
          </div>

          <div style={st.section}>Builder</div>
          <div style={st.help}>Describe a model in plain English. The agent writes the block graph.</div>
          <textarea className="field" style={st.area} value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
          <button
            className="btn-primary"
            style={{ ...st.primary, opacity: busy ? 0.65 : 1 }}
            disabled={busy}
            onClick={build}
          >
            {busy ? "Building…" : "Build model"}
          </button>
          <div style={st.examples}>
            {["Price a call option", "Compute the delta to hedge", "Binary event: market prices 5%, I think 35%", "Custom formula a*b+c"].map((ex) => (
              <span key={ex} className="chip" style={st.chip} onClick={() => setPrompt(ex)}>{ex}</span>
            ))}
          </div>
          {status && <div style={st.status}>{status}</div>}

          <div style={st.sectionDivider} />

          <div style={st.section}>Tutor</div>
          {selectedBlock ? (
            <>
              <div style={st.help}>
                Explaining: <span style={{ color: "var(--acc)", fontWeight: 600 }}>{DEFS[selectedBlock.type]?.label}</span>
              </div>
              <button
                className="btn-secondary"
                style={{ ...st.primary, ...st.secondary }}
                disabled={explaining}
                onClick={tutor}
              >
                {explaining ? "Thinking…" : "Explain this block"}
              </button>
              {explain && <div style={st.explain}>{explain}</div>}
            </>
          ) : (
            <div style={st.help}>Select a block on the canvas, then ask the agent to explain the concept.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---- styles ----
const css = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');

:root {
  --bg:      #FFF8E7;
  --panel:   #FFFCF4;
  --panel2:  #F7F0DC;
  --line:    #E3D9C4;
  --acc:     #4A7C59;
  --acc-lt:  #EAF3EE;
  --wire:    #9DAE90;
  --txt:     #1D1F10;
  --mut:     #8A8268;
  --r:       10px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.canvas {
  background-color: var(--bg);
  background-image: radial-gradient(circle, #C9BFA6 1px, transparent 1px);
  background-size: 24px 24px;
}

.palItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  background: var(--panel);
  border: 1px solid var(--line);
  border-left: 3px solid;
  color: var(--txt);
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-family: 'DM Sans', sans-serif;
  margin-bottom: 5px;
  cursor: pointer;
  transition: all .15s;
  font-weight: 400;
}
.palItem:hover {
  background: var(--acc-lt) !important;
  transform: translateX(2px);
  box-shadow: 0 2px 8px rgba(29,31,16,.08);
}

.chip {
  font-size: 11px;
  color: var(--mut);
  border: 1px solid var(--line);
  border-radius: 99px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all .15s;
  font-family: 'DM Sans', sans-serif;
  background: var(--panel);
}
.chip:hover {
  border-color: var(--acc) !important;
  color: var(--acc) !important;
  background: var(--acc-lt) !important;
}

.port { transition: transform .1s, background .1s; }
.port:hover { transform: scale(1.5); background: var(--acc) !important; }

.x { opacity: .3; transition: opacity .15s, color .15s; }
.x:hover { opacity: 1 !important; color: #DC2626 !important; }

.dot {
  width: 6px; height: 6px; border-radius: 9px;
  background: var(--acc); display: inline-block;
  box-shadow: 0 0 5px var(--acc);
  animation: pulse 2s infinite;
}
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.2} }

.field {
  font-family: 'DM Mono', monospace;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.field:focus {
  border-color: var(--acc) !important;
  box-shadow: 0 0 0 3px var(--acc-lt);
}

.formula-cell { color: #B45309; }

.btn-ghost {
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  transition: all .15s;
}
.btn-ghost:hover { background: var(--panel2) !important; border-color: var(--line) !important; color: var(--txt) !important; }

.btn-primary { font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all .15s; }
.btn-primary:hover:not(:disabled) { opacity: 0.88 !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(29,31,16,.18); }
.btn-primary:active:not(:disabled) { transform: translateY(0); }

.btn-secondary { font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all .15s; }
.btn-secondary:hover:not(:disabled) { background: var(--acc-lt) !important; }
`;

const st = {
  app: {
    position: "fixed", inset: 0,
    background: "var(--bg)",
    color: "var(--txt)",
    fontFamily: "'DM Sans', sans-serif",
    display: "flex", flexDirection: "column", overflow: "hidden",
  },

  top: {
    height: 54,
    borderBottom: "1px solid var(--line)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 20px",
    background: "var(--panel)",
  },

  logoWrap: { display: "flex", alignItems: "center", gap: 5 },
  logo: {
    fontFamily: "'Lora', serif",
    fontWeight: 600, fontSize: 20,
    letterSpacing: "-0.3px",
    color: "var(--txt)",
  },
  logoLeaf: { fontSize: 10, color: "var(--acc)", marginTop: -4, opacity: 0.8 },

  divider: {
    width: 1, height: 18,
    background: "var(--line)",
    display: "inline-block",
  },

  tag:  { color: "var(--mut)", fontSize: 12, letterSpacing: ".2px", fontWeight: 400 },
  live: { color: "var(--mut)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 6, marginRight: 4 },

  ghost: {
    background: "transparent",
    border: "1px solid var(--line)",
    color: "var(--mut)",
    padding: "5px 12px",
    borderRadius: 8,
    fontSize: 12,
  },

  body: { flex: 1, display: "flex", minHeight: 0 },

  // Palette
  palette: {
    width: 212,
    borderRight: "1px solid var(--line)",
    background: "var(--panel2)",
    padding: "14px 12px",
    overflowY: "auto",
  },
  palHeader: {
    fontSize: 11, fontWeight: 600, letterSpacing: "1px",
    textTransform: "uppercase", color: "var(--mut)",
    marginBottom: 14, paddingBottom: 8,
    borderBottom: "1px solid var(--line)",
  },
  catLabel: {
    fontSize: 10.5, fontWeight: 600, letterSpacing: ".8px",
    textTransform: "uppercase", marginBottom: 6,
    display: "flex", alignItems: "center", gap: 6,
  },
  catDot: { width: 6, height: 6, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  palItem: {}, // extended by className
  badge: {
    fontSize: 9, fontWeight: 500,
    border: "1px solid",
    borderRadius: 4, padding: "1px 5px",
    letterSpacing: ".3px",
  },

  // Canvas
  canvas:  { flex: 1, position: "relative", overflow: "hidden", cursor: "default" },
  svg:     { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" },

  // Nodes — shadcn Card style
  node: {
    position: "absolute", width: NODE_W,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    userSelect: "none",
    paddingBottom: 12,
    overflow: "visible",
    transition: "border-color .15s, box-shadow .15s",
  },
  nodeAccent: {
    height: 3,
    borderRadius: "12px 12px 0 0",
    marginBottom: 0,
    position: "relative",
    top: 0,
    marginTop: -1,
    marginLeft: -1,
    marginRight: -1,
    width: "calc(100% + 2px)",
  },
  nodeHead: {
    height: HEADER - 3,
    display: "flex", alignItems: "center", gap: 8,
    padding: "0 12px",
    cursor: "grab",
    borderBottom: "1px solid var(--line)",
    borderRadius: "0",
  },
  nodeTitle: {
    fontSize: 12, fontWeight: 500, flex: 1,
    fontFamily: "'DM Sans', sans-serif",
    color: "var(--txt)",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  x: { fontSize: 16, color: "var(--mut)", cursor: "pointer", lineHeight: 1, flexShrink: 0 },

  portRow: { position: "absolute", left: 0, display: "flex", alignItems: "center", gap: 6, paddingLeft: 0 },
  port: {
    width: 11, height: 11, borderRadius: 99,
    background: "var(--panel)",
    border: "2px solid",
    cursor: "crosshair",
    display: "inline-block", marginLeft: -6,
  },
  outPort: { position: "absolute", right: -6, marginLeft: 0 },
  portLbl: { fontSize: 10.5, color: "var(--mut)", fontFamily: "'DM Mono', monospace" },

  paramBox:  { padding: "10px 12px 2px" },
  input: {
    width: "100%",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    color: "var(--txt)",
    borderRadius: 7, padding: "5px 9px", fontSize: 13,
  },

  miniRow:   { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 5 },
  miniLbl:   { fontSize: 10, color: "var(--mut)", whiteSpace: "nowrap", fontFamily: "'DM Sans', sans-serif" },
  miniInput: {
    width: 64,
    background: "var(--bg)", border: "1px solid var(--line)",
    color: "var(--txt)", borderRadius: 6,
    padding: "3px 6px", fontSize: 11.5, textAlign: "right",
  },
  subVal:    { fontSize: 9.5, color: "var(--mut)", marginTop: 2, fontFamily: "'DM Mono', monospace" },
  edgeTag:   { fontSize: 9, color: "var(--mut)", fontWeight: 400, marginLeft: 5 },

  formulaCell: {
    width: "100%",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    borderRadius: 7, padding: "6px 9px", fontSize: 12, resize: "none", lineHeight: 1.4,
  },
  formulaHint: { fontSize: 9.5, color: "var(--mut)", marginTop: 3, fontFamily: "'DM Mono', monospace" },

  valBox:     { padding: "8px 12px 0", fontSize: 17, fontWeight: 600, textAlign: "right", fontFamily: "'DM Mono', monospace" },
  conceptBox: { padding: "8px 12px 0", fontSize: 10.5, color: "var(--mut)", fontStyle: "italic" },

  hint: {
    position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
    background: "var(--acc)", color: "#fff",
    padding: "7px 16px", borderRadius: 99, fontSize: 12, fontWeight: 500,
    boxShadow: "0 4px 12px rgba(74,124,89,.35)",
    whiteSpace: "nowrap",
  },

  // Agent panel
  agent: {
    width: 276,
    borderLeft: "1px solid var(--line)",
    background: "var(--panel2)",
    padding: "18px 16px",
    overflowY: "auto",
    display: "flex", flexDirection: "column", gap: 0,
  },
  agentBrand: {
    display: "flex", alignItems: "center", gap: 7, marginBottom: 18,
    paddingBottom: 14, borderBottom: "1px solid var(--line)",
  },
  agentIcon:  { color: "var(--acc)", fontSize: 12 },
  agentTitle: { fontFamily: "'Lora', serif", fontWeight: 500, fontSize: 15, color: "var(--txt)", letterSpacing: "-.2px" },

  section: {
    fontSize: 10.5, fontWeight: 600, letterSpacing: "1px",
    textTransform: "uppercase", color: "var(--mut)", marginBottom: 8,
  },
  sectionDivider: { borderTop: "1px solid var(--line)", margin: "20px 0 18px" },

  help: { fontSize: 12, color: "var(--mut)", lineHeight: 1.55, marginBottom: 10, fontWeight: 400 },

  area: {
    width: "100%",
    background: "var(--panel)",
    border: "1px solid var(--line)",
    color: "var(--txt)",
    borderRadius: 8, padding: "9px 11px", fontSize: 12.5, resize: "vertical",
    marginBottom: 9, lineHeight: 1.45,
    fontFamily: "'DM Sans', sans-serif",
  },

  primary: {
    width: "100%",
    background: "var(--txt)",
    color: "var(--bg)",
    border: "none",
    padding: "10px 16px",
    borderRadius: 8, fontWeight: 600, fontSize: 13,
  },
  secondary: {
    background: "transparent",
    color: "var(--acc)",
    border: "1.5px solid var(--acc)",
  },

  examples: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11 },
  chip: {},  // extended by className

  status: { fontSize: 11.5, color: "var(--acc)", marginTop: 12, lineHeight: 1.45, fontWeight: 500 },

  explain: {
    fontSize: 12, color: "var(--txt)", lineHeight: 1.65, marginTop: 12,
    background: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: 8, padding: 13,
    fontWeight: 400,
  },
};
