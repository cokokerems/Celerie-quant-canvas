# Celerie — project brief for Claude Code

> Simple drag / drop / connect canvas to bring scientific finance to everyone's tables.

## What this is
A drag-and-drop visual builder for quantitative finance concepts — "Scratch for quant
finance." Users place blocks (data, valuation, hedging, physics-derived filtering,
advanced formula cells) on a canvas, wire them together, and the model computes live.
An embedded LLM agent has two roles: a **Builder** (natural language -> block graph)
and a **Tutor** (explains the concept behind any selected block).

The whole canvas is a **JSON graph** (blocks + connections). The agent never touches
pixels — it reads and writes that JSON via a constrained vocabulary. This is the core
architectural decision; preserve it.

## Repo layout
- `QuantBlocks.jsx` — the entire app (single React component + styles). Brand inside is "Celerie".
- `server.js` — Express proxy that holds the Anthropic key and exposes `POST /api/claude`.
- `vite.config.js` — dev server proxies `/api` to the backend on :8787.
- `.env` (from `.env.example`) — holds `ANTHROPIC_API_KEY`. Never commit it; never ship it to the client.
- `npm run dev` runs web + api together (concurrently).

## Current state
- Live compute engine for: Black-Scholes call/put, option delta, binary-event edge,
  custom formula cells.
- "Concept" blocks (EMA, Kalman filter) are placeholders the agent can place and
  explain but that do not compute yet.
- Agent (Builder + Tutor) calls go through the local `server.js` proxy. The API key
  lives in `.env` on the server only — the browser never sees it.

## The wedge (don't lose this)
The defensible value is the **Tutor / learning outcome**. The product teaches the concept while you build.
Every roadmap decision should answer: "for whom, doing what, better than today?"
Resist adding more block *types* before the existing ones are deep and correct —
breadth-creep is what killed earlier versions of this idea.

## Design edges already folded in
- **Tiered blocks**: prebuilt -> parametric -> advanced formula cell (the "drop into
  code" escape hatch). This is the answer to "why not just use Excel."
- **Binary-Event Edge block**: Cornwall-Capital-style mispricing — your probability vs
  the market's. Output is **expected edge** (profit per contract), not a raw ratio.
  This block is unique to us; keep it the most rigorous thing on the canvas.

## In-progress hardening (engine correctness pass)
1. Replace the fixed-point `evaluate` with a Kahn topological sort + cycle detection;
   compute each node once in dependency order.
2. Domain guards (`GUARDS`): BS/Delta require S,K,sigma,T > 0; binary-event requires
   both probabilities in (0,1). Failed guard or NaN/non-finite => store a per-block
   error, never render garbage.
3. `evaluate` returns `{ vals, errors }`; errored blocks show a red border + inline ⚠.
4. Delete-key handler must not fire while typing in an input/textarea/contentEditable.

## Open threads / next steps (after the correctness pass)
1. **JSON save/load** of the graph (it already *is* JSON). Do this BEFORE new features —
   it removes the demo risk of losing a model on refresh. This is the next prompt.
2. **Validator agent** (third role): catch wiring mistakes (e.g. a price fed into a
   volatility port) via dimensional/units checks. Reuse a "Decline / Once / Always"
   permission overlay for agent-initiated rewires.
3. **Lazy-loaded block specs**: give the agent a catalog + a `load_block_spec(type)`
   tool instead of the full vocab in context, so it scales to many blocks.
4. Make the concept blocks (Kalman, EMA) compute on a real price series.
5. Secure the formula-cell evaluator (currently a JS `Function` constructor — fine for
   demo, must be sandboxed for production).
6. Charting layer (e.g. lightweight-charts) once time-series blocks land.

## Constraints
- Keep it a single self-contained component unless a refactor is explicitly requested.
- No browser localStorage/sessionStorage for artifact builds; for the standalone Vite
  app, file-based or download/upload JSON is fine.
- Positioning is educational ("we teach the math, we don't give financial advice or
  route orders") to stay clear of MiFID II / CONSOB regulated-entity scope.
