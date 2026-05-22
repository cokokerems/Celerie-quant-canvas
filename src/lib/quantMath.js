// Celerie — quantitative math library
// All functions take plain numbers and return plain numbers.
// Shared by the evaluate engine in QuantBlocks.jsx.

// ── Normal distribution helpers ──────────────────────────────────────────────
const erf = (x) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
export const Phi  = (x) => 0.5 * (1 + erf(x / Math.SQRT2));           // CDF
export const phi  = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); // PDF

// ── Black-Scholes helpers ─────────────────────────────────────────────────────
const bsD1 = (S, K, r, sigma, T) => (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
const bsD2 = (S, K, r, sigma, T) => bsD1(S, K, r, sigma, T) - sigma * Math.sqrt(T);

// ── Option Greeks ─────────────────────────────────────────────────────────────
export const optionGamma = (S, K, r, sigma, T) =>
  phi(bsD1(S, K, r, sigma, T)) / (S * sigma * Math.sqrt(T));

export const optionVega = (S, K, r, sigma, T) =>
  S * phi(bsD1(S, K, r, sigma, T)) * Math.sqrt(T);

export const optionThetaCall = (S, K, r, sigma, T) =>
  -(S * phi(bsD1(S, K, r, sigma, T)) * sigma) / (2 * Math.sqrt(T))
  - r * K * Math.exp(-r * T) * Phi(bsD2(S, K, r, sigma, T));

export const optionThetaPut = (S, K, r, sigma, T) =>
  -(S * phi(bsD1(S, K, r, sigma, T)) * sigma) / (2 * Math.sqrt(T))
  + r * K * Math.exp(-r * T) * Phi(-bsD2(S, K, r, sigma, T));

export const optionRhoCall = (S, K, r, sigma, T) =>
  K * T * Math.exp(-r * T) * Phi(bsD2(S, K, r, sigma, T));

export const optionRhoPut = (S, K, r, sigma, T) =>
  -K * T * Math.exp(-r * T) * Phi(-bsD2(S, K, r, sigma, T));

// ── Fixed Income ──────────────────────────────────────────────────────────────

// Bond price: periodic coupon C, face value FV, yield r, n periods
export const bondPrice = (C, FV, r, n) => {
  if (r === 0) return C * n + FV;
  return C * (1 - Math.pow(1 + r, -n)) / r + FV * Math.pow(1 + r, -n);
};

// Macaulay Duration
export const macaulayDuration = (C, FV, r, n) => {
  const P = bondPrice(C, FV, r, n);
  if (P === 0) return NaN;
  let num = 0;
  for (let t = 1; t <= n; t++) num += t * C / Math.pow(1 + r, t);
  num += n * FV / Math.pow(1 + r, n);
  return num / P;
};

// Modified Duration
export const modifiedDuration = (C, FV, r, n) =>
  macaulayDuration(C, FV, r, n) / (1 + r);

// Bond Convexity
export const bondConvexity = (C, FV, r, n) => {
  const P = bondPrice(C, FV, r, n);
  if (P === 0 || r === 0) return NaN;
  let num = 0;
  for (let t = 1; t <= n; t++) num += t * (t + 1) * C / Math.pow(1 + r, t + 2);
  num += n * (n + 1) * FV / Math.pow(1 + r, n + 2);
  return num / P;
};

// Yield to Maturity — Newton's method (solve bondPrice(C,FV,r,n) = P for r)
export const ytm = (C, FV, P, n) => {
  let r = C / P; // initial guess: current yield
  for (let i = 0; i < 200; i++) {
    const f  = bondPrice(C, FV, r, n) - P;
    const df = -modifiedDuration(C, FV, r, n) * bondPrice(C, FV, r, n);
    const step = f / df;
    r -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return r;
};

// ── Time Value of Money ───────────────────────────────────────────────────────

export const presentValue   = (FV, r, n)        => FV / Math.pow(1 + r, n);
export const futureValue    = (PV, r, n)        => PV * Math.pow(1 + r, n);
export const annuityPV      = (PMT, r, n)       => r === 0 ? PMT * n : PMT * (1 - Math.pow(1 + r, -n)) / r;
export const annuityFV      = (PMT, r, n)       => r === 0 ? PMT * n : PMT * (Math.pow(1 + r, n) - 1) / r;
export const perpetuity     = (CF, r)           => CF / r;
export const growingPerpetuity = (CF1, r, g)    => CF1 / (r - g);
export const compoundInterest  = (P, r, n, m)   => P * Math.pow(1 + r / m, m * n);
export const continuousCompound = (P, r, t)     => P * Math.exp(r * t);

// NPV: up to 5 cash flows CF0..CF4, discount rate r
export const npv5 = (CF0, CF1, CF2, CF3, CF4, r) => {
  const cfs = [CF0, CF1, CF2, CF3, CF4];
  return cfs.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
};

// IRR — Newton's method on npv5 = 0
export const irr5 = (CF0, CF1, CF2, CF3, CF4) => {
  const cfs = [CF0, CF1, CF2, CF3, CF4];
  const npv  = (r) => cfs.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
  const dnpv = (r) => cfs.reduce((acc, cf, t) => acc - t * cf / Math.pow(1 + r, t + 1), 0);
  let r = 0.1;
  for (let i = 0; i < 300; i++) {
    const step = npv(r) / dnpv(r);
    r -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return r;
};

// ── Portfolio Theory ──────────────────────────────────────────────────────────

// 2-asset portfolio expected return
export const portfolioReturn2 = (w1, R1, w2, R2) => w1 * R1 + w2 * R2;

// 2-asset portfolio variance
export const portfolioVariance2 = (w1, s1, w2, s2, rho) =>
  w1 * w1 * s1 * s1 + w2 * w2 * s2 * s2 + 2 * w1 * w2 * rho * s1 * s2;

// Beta from covariance and market variance
export const betaFromCov = (covIM, varM) => covIM / varM;

// Jensen's Alpha
export const jensenAlpha = (Rp, Rf, beta, Rm) => Rp - (Rf + beta * (Rm - Rf));

// Treynor Ratio
export const treynorRatio = (Rp, Rf, beta) => (Rp - Rf) / beta;

// Information Ratio
export const informationRatio = (Rp, Rb, trackingError) => (Rp - Rb) / trackingError;

// ── Risk Metrics ─────────────────────────────────────────────────────────────

// Sharpe Ratio
export const sharpeRatio = (Rp, Rf, sigma) => (Rp - Rf) / sigma;

// Sortino Ratio (downside deviation σd provided externally)
export const sortinoRatio = (Rp, MAR, sigmaDown) => (Rp - MAR) / sigmaDown;

// Parametric VaR (1-day, given daily μ and σ, confidence z e.g. 1.645 for 95%)
export const varParametric = (mu, sigma, z) => -(mu - z * sigma);

// Expected Shortfall / CVaR (parametric, normal)
export const cvar = (mu, sigma, z) =>
  -(mu - sigma * phi(Phi_inv(z)) / (1 - z));

// Calmar Ratio
export const calmarRatio = (annualReturn, maxDrawdown) => annualReturn / Math.abs(maxDrawdown);

// CAPM expected return
export const capm = (Rf, beta, Rm) => Rf + beta * (Rm - Rf);

// WACC (two-component: equity and debt)
export const wacc = (E, D, Re, Rd, Tc) => {
  const V = E + D;
  return (E / V) * Re + (D / V) * Rd * (1 - Tc);
};

// ── Equity Valuation ─────────────────────────────────────────────────────────

// Gordon Growth Model (DDM)
export const gordonGrowth = (D1, r, g) => D1 / (r - g);

// P/E multiple valuation
export const peValuation = (EPS, pe) => EPS * pe;

// EV/EBITDA multiple
export const evEbitda = (EBITDA, multiple) => EBITDA * multiple;

// ── Stochastic ───────────────────────────────────────────────────────────────

// GBM expected value at time T
export const gbmExpected = (S0, mu, T) => S0 * Math.exp(mu * T);

// GBM standard deviation at time T
export const gbmStdDev = (S0, sigma, T) =>
  S0 * Math.exp(sigma * sigma * T) * Math.sqrt(Math.expm1(sigma * sigma * T));

// Log return
export const logReturn = (St, S0) => Math.log(St / S0);

// Annualized realized volatility from daily log-return std dev
export const realizedVol = (dailySigma) => dailySigma * Math.sqrt(252);

// Put-call parity: C - P should equal S - K*e^(-rT)
export const putCallParity = (S, K, r, T) => S - K * Math.exp(-r * T);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Inverse normal CDF (Beasley-Springer-Moro approximation)
function Phi_inv(p) {
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
             0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  const q = p - 0.5;
  if (Math.abs(q) <= 0.42) {
    const r2 = q * q;
    return q * (((a[3]*r2+a[2])*r2+a[1])*r2+a[0]) / ((((b[3]*r2+b[2])*r2+b[1])*r2+b[0])*r2+1);
  }
  const r2 = Math.sqrt(-Math.log(q > 0 ? 1 - p : p));
  const s = (q > 0 ? 1 : -1) * (((((((c[8]*r2+c[7])*r2+c[6])*r2+c[5])*r2+c[4])*r2+c[3])*r2+c[2])*r2+c[1])*r2+c[0];
  return s;
}
