# QuantBlocks — project brief for Claude Code

## What this is
A drag-and-drop visual builder for quantitative finance concepts — "Scratch for quant
finance." Users place blocks (data, valuation, hedging, physics-derived filtering,
advanced formula cells) on a canvas, wire them together, and the model computes live.
An embedded LLM agent has two roles: a **Builder** (natural language -> block graph)
and a **Tutor** (explains the concept behind any selected block).

The whole canvas is a **JSON graph** (blocks + connections). The agent never touches
pixels — it reads and writes that JSON via a constrained vocabulary. This is the core
architectural decision; preserve it.

## Current state
Single-file React component in `App.jsx` (originally delivered as `QuantBlocks.jsx`).
- Live compute engine for: Black-Scholes call/put, option delta, binary-event edge,
  custom formula cells.
- "Concept" blocks (EMA, Kalman filter) are placeholders the agent can place and
  explain but that do not compute yet.
- Agent calls hit the Anthropic Messages API. In the Claude.ai artifact runtime the
  key was injected automatically; **running locally you must supply your own API key**
  and route the call through a small backend (do NOT ship a key in client code).

## The wedge (don't lose this)
The defensible value is the **Tutor / learning outcome**, not the Builder. The Builder
is a flashy assembler anyone can copy. The product teaches the concept while you build.
Every roadmap decision should answer: "for whom, doing what, better than today?"

## Salvaged design edges already folded in
- **Tiered blocks**: prebuilt -> parametric -> advanced formula cell (the "drop into
  code" escape hatch). This is the answer to "why not just use Excel."
- **Binary-Event Edge block**: Cornwall-Capital-style mispricing — your probability vs
  the market's, output as an edge ratio. This block is unique to us; protect it.

## Open threads / next steps discussed
1. **Validator agent** (third role): catch wiring mistakes (e.g. a price fed into a
   volatility port) using a dimensional/units check. Reuse a "Decline / Send once /
   Always" permission overlay for agent-initiated rewires.
2. **Lazy-loaded block specs**: don't hold all block definitions in the agent context;
   give it a catalog + a `load_block_spec(type)` tool so it scales to many blocks.
3. Make the concept blocks (Kalman, EMA) actually compute on a price series.
4. Secure the formula-cell evaluator (currently uses a JS Function constructor — fine
   for demo, must be sandboxed for production).
5. Real charting layer (lightweight-charts) if/when time-series blocks land.

## Constraints
- Keep it a single self-contained component unless a refactor is explicitly requested.
- No browser localStorage/sessionStorage in artifact builds.
- Positioning is educational ("we teach the math, we don't give financial advice or
  route orders") to stay clear of MiFID II / CONSOB regulated-entity scope.

## Commands (fill in once scaffolded)
- `npm run dev` — start dev server
- `npm run build` — production build
