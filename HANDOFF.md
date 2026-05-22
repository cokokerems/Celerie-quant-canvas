# Celerie — Handoff for New Chat

Read this before touching anything. It gives you the full picture in one pass.

---

## What Celerie is

A drag-and-drop visual quant finance builder — "Scratch for quant finance." Users
place blocks on a canvas, wire them together, and the model computes live. An embedded
LLM agent has two roles: **Builder** (natural language → block graph) and **Tutor**
(explains the concept behind any selected block).

**Core architectural invariant**: the canvas is a JSON graph of `{ blocks, connections }`.
The agent reads and writes that JSON via a constrained vocabulary. It never touches
pixels. Preserve this.

**The wedge**: the defensible value is the Tutor / learning outcome, not the Builder.
Every feature decision should answer "for whom, doing what, better than today?"

---

## Repo layout

```
QuantBlocks.jsx          — entire app (single React component + all styles)
server.js                — Express proxy; exposes POST /api/claude; holds API key
vite.config.js           — proxies /api → localhost:8787
.env                     — ANTHROPIC_API_KEY (never commit, never ship to client)
.env.example             — template

src/lib/quantMath.js     — all math (Greeks, bonds, TVM, portfolio, risk, stochastic)
src/data/formulas.json   — 37 formula definitions (LaTeX, inputs, constraints, tags)
src/lib/test.js          — formula test runner; run with: node src/lib/test.js

CLAUDE.md                — project brief + current state (keep updated)
ROADMAP.md               — prioritised feature backlog
HANDOFF.md               — this file
```

**Commands**:
- `npm run dev` — starts Vite (port 5173) + Express proxy (port 8787) concurrently
- `npm run build` — production build
- `node src/lib/test.js` — runs 43 formula tests; must stay all-green after any change
  to quantMath.js or formulas.json

---

## Architecture inside QuantBlocks.jsx

### Block registry (`DEFS`)
Each block is an entry in `DEFS`:
```js
{
  label:   "Black–Scholes Call",
  cat:     "valuation",       // must be a key in CAT
  out:     true,              // has an output port
  inputs:  [{ name: "S" }, { name: "K" }, ...],  // named input ports
  params:  { value: 100 },    // default editable params (data blocks)
  compute: (inputs, params) => number,
  // optional flags:
  concept: true,              // placeholder block, no compute
  multiparam: true,           // uses a multi-field param UI (binary_event)
  isFormula: true,            // free-form expression cell
  _latex, _desc, _tags        // metadata from formulas.json (informational)
}
```

New blocks are merged in from `formulas.json` via the `FORMULA_DEFS.forEach` loop
just after the hand-written `DEFS` object. **Do not duplicate hand-written entries.**

### Category palette (`CAT`)
```js
{ data, valuation, hedging, filtering, advanced, output,
  fixed_income, portfolio, risk, tvm }
```
Each entry: `{ c: "#hexcolor", label: "Human name" }`.

### Evaluation engine (`evaluate`)
- Kahn topological sort over the connection graph.
- Returns `{ vals, errors }`.
- Three block states:
  - **incomplete** — required input not wired → `vals[id] = undefined`, no error
  - **error** — guard failed / non-finite result / cycle → `errors[id] = "message"`
  - **ok** — `vals[id]` is a finite number

### Domain guards (`GUARDS`)
Map of `blockType → (inputs, params) => string | null`. Guards run **only when
the block is ready** (all required inputs present). Returning a non-null string
sets the block to error state without running `compute`.

### Agent calls
`callClaude(system, content)` POSTs to `/api/claude` on the local Express proxy.
The proxy adds the API key header and forwards to `api.anthropic.com/v1/messages`.
The browser never sees the key.

---

## What was done in the last session (in order)

1. **Engine correctness pass** — replaced fixed-point loop with Kahn topo sort;
   added GUARDS for all block types; `evaluate` now returns `{ vals, errors }`;
   error blocks show red border + `— ⚠` tooltip; delete-key ignores inputs/textareas.

2. **JSON save / load** — "Save" downloads `celerie-model.json`; "Load" reads it
   back. Both in the header. No localStorage used.

3. **Formula library** — 37 new computable blocks added via `src/lib/quantMath.js`
   and `src/data/formulas.json`. All tested (43/43 pass). New categories: Fixed
   Income, Portfolio Theory, Risk Metrics, Time Value of Money.

---

## What to do next (from ROADMAP.md, priority order)

### 1. Tutor depth pass — recommended starting point
The Tutor is the core value proposition but currently sends a generic prompt.
Improve it by:
- Passing the block's `_latex`, `_desc`, and current computed `val` to the system
  prompt so the tutor explains *this instance* with context.
- Framing: "why does this matter in my model right now?" not just textbook definition.
- Streaming the response via SSE for better perceived latency (server.js needs an
  SSE endpoint; the existing `/api/claude` endpoint can stay for the Builder).

### 2. Wiring validation / Validator agent
Third agent role. Catches dimensional mismatches (e.g. probability fed into a price
port). Uses `_tags` in formulas.json to classify port types. UX: "Decline / Once /
Always" overlay for agent-initiated rewires.

### 3. Concept blocks (EMA, Kalman) — make them compute
Need a time-series data block + charting layer first (lightweight-charts, ~40 KB gz).

### 4. Lazy-loaded block specs for Builder agent
Current vocab is ~600 tokens and growing. Give the agent `list_blocks()` +
`load_block_spec(type)` tools instead of the full vocab in context.

---

## Constraints to respect

- `QuantBlocks.jsx` stays a single self-contained component unless explicitly asked
  to refactor. `quantMath.js` and `formulas.json` are approved exceptions.
- No localStorage/sessionStorage.
- Educational positioning only — no financial advice, no order routing.
- All formula tests must stay green after any change to quantMath.js or formulas.json.
- The JSON graph architecture (blocks + connections) is load-bearing. Don't bypass it.
