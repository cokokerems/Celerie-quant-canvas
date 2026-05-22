// Celerie formula test runner — node src/lib/test.js
import * as qm from './quantMath.js';

const PASS = '✓', FAIL = '✗';
let passed = 0, failed = 0;

function check(name, result, expectFinite = true, approx = null) {
  const finite = Number.isFinite(result);
  const approxOk = approx === null || Math.abs(result - approx) < Math.abs(approx) * 0.01 + 1e-6;
  const ok = (expectFinite ? finite : true) && approxOk;
  if (ok) { passed++; console.log(`  ${PASS} ${name}: ${result.toFixed(6)}`); }
  else     { failed++; console.log(`  ${FAIL} ${name}: got ${result} (expected ~${approx})`); }
}

// ── Greeks ────────────────────────────────────────────────────────────────────
console.log('\nOption Greeks (S=100, K=100, r=0.05, σ=0.20, T=1)');
const [S,K,r,sig,T] = [100,100,0.05,0.20,1];
check('Gamma',    qm.optionGamma(S,K,r,sig,T),    true, 0.01876);
check('Vega',     qm.optionVega(S,K,r,sig,T),     true, 37.52);
check('ThetaCall',qm.optionThetaCall(S,K,r,sig,T),true);
check('RhoCall',  qm.optionRhoCall(S,K,r,sig,T),  true);
check('ThetaPut', qm.optionThetaPut(S,K,r,sig,T), true);
check('RhoPut',   qm.optionRhoPut(S,K,r,sig,T),   true);
check('PutCallParity', qm.putCallParity(100,100,0.05,1), true, 4.877);

// ── Fixed Income ──────────────────────────────────────────────────────────────
console.log('\nFixed Income (C=5, FV=100, r=0.06, n=10)');
const bp = qm.bondPrice(5,100,0.06,10);
check('BondPrice',    bp,                                       true, 92.64);
check('MacaulayDur',  qm.macaulayDuration(5,100,0.06,10),      true, 8.02);
check('ModifiedDur',  qm.modifiedDuration(5,100,0.06,10),      true, 7.57);
check('Convexity',    qm.bondConvexity(5,100,0.06,10),         true);
check('YTM (round-trip)', qm.ytm(5,100,bp,10),                 true, 0.06);
check('YTM (discount)',   qm.ytm(5,100,95,10),                 true);
check('CurrentYield', 5/95,                                     true, 0.0526);

// ── TVM ───────────────────────────────────────────────────────────────────────
console.log('\nTime Value of Money');
check('PresentValue',   qm.presentValue(100,0.05,5),                   true, 78.35);
check('FutureValue',    qm.futureValue(100,0.05,5),                    true, 127.63);
check('AnnuityPV',      qm.annuityPV(10,0.05,10),                     true, 77.22);
check('AnnuityFV',      qm.annuityFV(10,0.05,10),                     true, 125.78);
check('Perpetuity',     qm.perpetuity(5,0.05),                         true, 100);
check('GrowingPerp',    qm.growingPerpetuity(5,0.10,0.05),             true, 100);
check('CompoundInterest',qm.compoundInterest(100,0.06,5,12),           true, 134.89);
check('ContinuousComp', qm.continuousCompound(100,0.06,5),             true, 134.99);
check('NPV5',           qm.npv5(-100,30,40,40,30,0.10),               true);
check('IRR5',           qm.irr5(-100,30,40,40,30),                    true);
// IRR cross-check: npv at solved rate should ≈ 0
const irrVal = qm.irr5(-100,30,40,40,30);
const npvAtIrr = qm.npv5(-100,30,40,40,30, irrVal);
check('IRR cross-check (NPV≈0)', Math.abs(npvAtIrr), false, 0);

// ── Portfolio & Equity ────────────────────────────────────────────────────────
console.log('\nPortfolio Theory & Equity Valuation');
check('GordonGrowth',     qm.gordonGrowth(5,0.10,0.05),              true, 100);
check('PEvaluation',      qm.peValuation(3,20),                       true, 60);
check('EVebitda',         qm.evEbitda(100,10),                        true, 1000);
check('CAPM',             qm.capm(0.03,1.2,0.10),                     true, 0.114);
check('WACC',             qm.wacc(600,400,0.12,0.06,0.25),            true, 0.09);
check('PortfolioRet2',    qm.portfolioReturn2(0.6,0.12,0.4,0.08),     true, 0.104);
check('PortfolioVar2',    qm.portfolioVariance2(0.6,0.15,0.4,0.10,0.3), true);
check('Beta',             qm.betaFromCov(0.024,0.04),                  true, 0.6);
check('JensenAlpha',      qm.jensenAlpha(0.12,0.03,0.8,0.10),         true, 0.034);
check('TreynorRatio',     qm.treynorRatio(0.12,0.03,0.8),             true, 0.1125);
check('InformationRatio', qm.informationRatio(0.12,0.10,0.04),         true, 0.5);

// ── Risk ──────────────────────────────────────────────────────────────────────
console.log('\nRisk Metrics');
check('SharpeRatio',   qm.sharpeRatio(0.12,0.03,0.15),    true, 0.6);
check('SortinoRatio',  qm.sortinoRatio(0.12,0.05,0.08),   true, 0.875);
check('VaRparametric', qm.varParametric(0.001,0.02,1.645), true, 0.0319);
check('CalmarRatio',   qm.calmarRatio(0.15,0.10),          true, 1.5);

// ── Stochastic ────────────────────────────────────────────────────────────────
console.log('\nStochastic');
check('GBMexpected',  qm.gbmExpected(100,0.08,1),  true, 108.33);
check('LogReturn',    qm.logReturn(105,100),         true, 0.04879);
check('RealizedVol',  qm.realizedVol(0.01),          true, 0.15875);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`Total: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed > 0) process.exit(1);
