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
```
QuantBlocks.jsx          — entire app (single React component + styles)
server.js                — Express proxy; holds ANTHROPIC_API_KEY, exposes POST /api/claude
vite.config.js           — dev server proxies /api → :8787
.env (from .env.example) — ANTHROPIC_API_KEY. Never commit; never ship to client.
src/lib/quantMath.js     — all math functions (Greeks, bonds, TVM, portfolio, risk, stochastic)
src/data/formulas.json   — 37 formula definitions (LaTeX, inputs, descriptions, tags)
src/lib/test.js          — formula test runner (node src/lib/test.js) — 43/43 pass
```
`npm run dev` runs web + api together (concurrently).

## Current state (as of last session)

### Compute engine
- **Evaluation**: Kahn topological sort; each node computed exactly once in dependency
  order. Cycle detection built in — cycle participants are marked as errors.
- **Error model**: `evaluate()` returns `{ vals, errors }`. Three block states:
  - *incomplete* — required input not wired → shows `—`, no red border
  - *error* — guard failed, non-finite result, or cycle → red border + `— ⚠` tooltip
  - *ok* — `vals[id]` is a finite number
- **Domain guards** (`GUARDS`): BS/Delta/Greeks require S,K,σ,T > 0; binary-event
  requires probs in (0,1); bond blocks require n > 0, r ≥ 0; etc.
- **Delete-key guard**: does not fire when focus is inside input/textarea.

### Block library (44 blocks total)
**Original 7**: spot, strike, rate, vol, time, bs_call, bs_put, delta, binary_event,
ema (concept), kalman (concept), formula (custom cell), output.

**37 new blocks** across 4 new categories:
- **Equity Valuation**: Gordon Growth, P/E Multiple, EV/EBITDA, WACC
- **Derivatives**: Gamma, Vega, Call Theta, Call Rho, Put-Call Parity
- **Fixed Income**: Bond Price, Current Yield, Macaulay Duration, Modified Duration,
  Convexity, YTM (Newton solve)
- **Portfolio Theory**: CAPM, Portfolio Return (2-asset), Portfolio Variance (2-asset),
  Beta, Jensen's Alpha, Treynor Ratio, Information Ratio
- **Risk Metrics**: Sharpe Ratio, Sortino Ratio, Parametric VaR, Calmar Ratio
- **Time Value of Money**: Present Value, Future Value, NPV (5-period), IRR (Newton),
  Annuity PV, Annuity FV, Perpetuity, Growing Perpetuity, Compound Interest,
  Continuous Compounding
- **Stochastic**: GBM Expected Value, Log Return, Realized Volatility

### UI & persistence
- **Theme**: warm cream (#FFF8E7 bg / #1D1F10 text), sage green accent (#4A7C59),
  shadcn-inspired cards with DM Sans + DM Mono + Lora fonts.
- **Save / Load**: header buttons download/upload `celerie-model.json`.
- **Agent**: Builder + Tutor calls go through `server.js` proxy; API key server-only.

## The wedge (don't lose this)
The defensible value is the **Tutor / learning outcome**. The product teaches the
concept while you build. Every roadmap decision should answer: "for whom, doing what,
better than today?" Resist adding more block *types* before the existing ones are
deep and correct — breadth-creep is what killed earlier versions of this idea.

## Design edges already folded in
- **Tiered blocks**: prebuilt → parametric → advanced formula cell.
- **Binary-Event Edge**: Cornwall-Capital-style mispricing. Output is expected edge
  (profit per contract). Most rigorous block on the canvas — keep it that way.

## Constraints
- Keep it a **single self-contained component** (`QuantBlocks.jsx`) unless a refactor
  is explicitly requested. `quantMath.js` and `formulas.json` are approved exceptions.
- No browser localStorage/sessionStorage. File-based save/load is fine (and done).
- Educational positioning — no financial advice, no order routing (MiFID II / CONSOB).
- `npm run dev` — start dev server + proxy
- `npm run build` — production build
- `node src/lib/test.js` — run formula test suite (must stay all-green)
