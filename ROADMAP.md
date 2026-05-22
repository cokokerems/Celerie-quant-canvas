# Celerie — Roadmap

Priority order reflects the wedge: correctness and learning depth before breadth.

---

## Done ✓

- [x] Black-Scholes call/put, delta, binary-event edge (live compute)
- [x] Drag-and-drop canvas with JSON graph architecture
- [x] LLM Builder agent (natural language → block graph)
- [x] LLM Tutor agent (explains selected block)
- [x] Server-side API proxy (key never reaches client)
- [x] Vite + React local dev setup
- [x] Kahn topological sort evaluation engine
- [x] Cycle detection with per-block error state
- [x] Domain guards (GUARDS map) — invalid inputs show `— ⚠` not NaN
- [x] Three-state block model: incomplete / error / ok
- [x] Delete-key guard (no accidental deletion while typing)
- [x] JSON save / load (download + upload celerie-model.json)
- [x] 37 new computable blocks across Fixed Income, Portfolio Theory, Risk Metrics, TVM, Stochastic
- [x] All-green test suite (43/43, node src/lib/test.js)
- [x] Warm cream UI theme (shadcn-inspired, DM Sans + Lora)

---

## Next up — Depth & Correctness

### 1. Tutor depth pass (highest priority)
The Tutor is the wedge. Right now it calls Claude with a generic prompt.
- Add block-specific context: pass the block's `_latex`, `_desc`, and current computed
  value so the tutor explains *this instance* not just the concept in the abstract.
- Add "why does this matter for my model?" framing — not just textbook definition.
- Consider streaming the response (SSE from server.js) for faster perceived latency.

### 2. Wiring validation / Validator agent (third agent role)
- Catch dimensional mismatches: e.g. a probability (0–1) fed into a price port.
- Use the `_tags` field in formulas.json to classify port types.
- Surface as inline port warnings, not just block errors.
- UX: "Decline / Send once / Always" permission overlay for agent-initiated rewires
  (same pattern as Cursor's agent permission system).

### 3. Concept blocks — make EMA and Kalman actually compute
- Both need a price series as input. Requires a time-series data block.
- EMA: straightforward recursive filter.
- Kalman: 1D position/velocity model on price. Educational value is high —
  teaches state estimation intuition nobody else covers.
- Gate this behind a lightweight-charts charting layer (see item 5).

### 4. Lazy-loaded block specs for the Builder agent
- Current approach puts the full vocab in the system prompt (~600 tokens and growing).
- Give the agent a `list_blocks()` tool and a `load_block_spec(type)` tool.
- The agent calls `list_blocks()` first, then loads only what it needs.
- Scales to 100+ block types without ballooning the context window.

### 5. Charting layer (lightweight-charts)
- Required before time-series blocks (EMA, Kalman, GBM simulation) are useful.
- lightweight-charts is ~40 KB gzipped — acceptable dependency.
- Output block variant that renders a line chart instead of a scalar value.

---

## Later / Backlog

### Security
- Sandbox the custom formula cell evaluator. Currently uses `new Function(...)` —
  fine for demo, must be replaced (e.g. Compartment from SES, or a Worker) before
  any multi-user deployment.

### Persistence
- Cloud save (user accounts). Out of scope until product-market fit.
- In-browser history / undo stack (Ctrl+Z). Medium complexity, high UX value.

### More block types (resist until depth is right)
- Black-Scholes with dividend yield (continuous and discrete)
- Binomial options pricing model (1-period first, then n-period tree)
- Implied volatility solver (Newton on BS price = market price)
- Heston model (stochastic vol) — concept block only, not computable without ODE solver
- Fama-French three-factor model
- Kelly Criterion

### Agent improvements
- Validator agent (see item 2 above)
- Builder memory: remember the last model built and allow incremental edits
- Tutor history: don't re-explain the same block twice in a session

---

## Not doing (intentional scope cuts)

- Order routing or live market data (regulatory scope: MiFID II / CONSOB)
- Mobile layout (canvas interaction requires pointer precision)
- Collaborative editing (complex, no clear early-user need)
- Export to Python/Excel (interesting but detracts from the learning loop)
