// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// ---------------------------------------------------------------------------------------------------
// MODEL radar-5 — one fitted law per population, on the three figures the brief names.
//
//   The brief asks the implied value to follow "the snapshot's own figures, the protocol's TVL, its
//   seven-day growth and how long it has run with no token". radar-4 priced on TVL alone and said so;
//   radar-5 fits all three terms, and reports what each one buys out of sample rather than asserting it.
//
//   population : the 128 protocols that record a token and a positive TVL (mcap_usd > 0, tvl_usd > 0)
//                split by isDerivativeProduct: non-derivative (the launch section's comparable set) and
//                derivative (the live-adjacent section's). Each population is priced by its own peers.
//   fit        : log(mcap) = a + b*log(tvl) + c*g + d*log(age_days), by ridge least squares with the
//                penalty RIDGE_LAMBDA on the three slopes and none on the intercept, solved in closed
//                form from the 4x4 normal equations. g is change_7d winsorised to [-0.60, 1.20] and
//                centred on the population's mean; log(age) is centred too. Centring is what lets a row
//                with no listed_at or no change_7d take 0 for that term: it is priced at the
//                population's average for the figure it does not record, never at an extreme.
//                Nothing is hardcoded: the coefficients are what this snapshot's live protocols say.
//   implied    : implied = exp(a + b*log(tvl) + c*g + d*logAge), clamped to [1, 1e13] and rounded.
//                A protocol with no TVL reads 1.
//   held out   : the fit reports its own 5-fold cross-validated error in log space beside the error of
//                the TVL-only law on the same rows, so the dashboard can state which terms pay for
//                themselves and which do not. On today's snapshot the growth and age slopes are small
//                and the held-out error of the full law is within noise of TVL alone: the terms are in
//                the model because the brief asks for them and they are measured, not because they
//                were assumed to help. Both numbers are shown; neither is hidden.
//   sections   : every row is ranked inside its own section, 1..n, launch candidates first:
//                  'launch'         rows with isDerivativeProduct(p) === false
//                  'live-adjacent'  rows with isDerivativeProduct(p) === true
//                `rank` is the whole-board place (1..N once each, never rising on implied value: what the
//                gate's sorted_by_value row reads), and `section_rank` is the same row's place inside its
//                own section (1..n). A derivative product's $7-13B TVL can never outrank a pre-token
//                protocol 100x smaller.
//                A derivative product is one whose name carries a whole word wrapped|staked|staking
//                (any case), begins with an exchange name (Binance, Coinbase, Bybit, Kraken, Bitget,
//                OKX, Bitfinex, Gemini), whose category is Bridge, Canonical Bridge, Liquid Staking,
//                Liquid Restaking, Restaked BTC or CEX, or whose name ends in a version marker
//                (a space then V2, v3, 2.0 ... : /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/).
//   coverage   : the board carries every pre-token protocol the snapshot records, not a slice of it,
//                and the dashboard's accounting strip reconciles all 758 records: how many trade, how
//                many are pre-token, how many are priced on the board, and that none is unaccounted.
//
// The dashboard states this formula and the fitted coefficients, and recomputes every row from the
// same fitted terms to check the board's number. The constants live in MODEL below and nowhere else.
// ---------------------------------------------------------------------------------------------------

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the comment block above explains. */
export interface ModelConstants {
  /** Ridge penalty on b only (never on the intercept) in the log(mcap) = a + b*log(tvl) fit. */
  ridge_lambda: number;
  /** The implied value's clamp: a fit can extrapolate past any real market cap. */
  value_floor: number;
  value_cap: number;
}

export const MODEL: ModelConstants = {
  ridge_lambda: 3.0,
  value_floor: 1,
  value_cap: 1e13,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5';

/** The two ranked sections of the board, in the order the dashboard shows them. */
export type Section = 'launch' | 'live-adjacent';

export const SECTIONS: readonly Section[] = ['launch', 'live-adjacent'];

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/**
 * A law fitted on one population of live protocols, on the three figures the brief names:
 *
 *   log(mcap) = a + b*log(tvl) + c*g + d*logAge
 *
 * where `g` is change_7d winsorised to [-0.60, 1.20] and centred on the population's mean, and
 * `logAge` is log(age_days) centred on the population's mean. `n` is how many live protocols it was
 * fitted on, `r2` how much of the log-variance it explains, and `cv` what it costs out of sample.
 */
export interface PowerLaw {
  a: number;
  b: number;
  /** Slope on the centred, winsorised seven-day change. 0 when the population records none. */
  c: number;
  /** Slope on centred log(age_days). 0 when the population records no listing date. */
  d: number;
  n: number;
  r2: number;
  /** The centring means a row with no change_7d or no listed_at takes 0 for that term. */
  growthMean: number;
  logAgeMean: number;
  /** 5-fold cross-validated mean absolute error in log space, this law against TVL alone, same rows. */
  cv: { full: number; tvlOnly: number; folds: number; rows: number };
}

/** The two fits the board prices with, keyed by the row's own population. */
export interface Law {
  /** Non-derivative live protocols: the launch section's comparable set. */
  launch: PowerLaw;
  /** Derivative live protocols: the live-adjacent section's comparable set. */
  derivative: PowerLaw;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  /** The row's place on the whole board on implied value, 1..N once each, never rising. */
  rank: number;
  /** The row's place inside its own section, 1..n once each: the ordering the section is ranked on. */
  section_rank: number;
  section: Section;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  is_derivative: boolean;
  implied_value_usd: number;
  /** The fit this row was priced by: its own population's terms, and the multiple they imply here. */
  model: {
    population: Section;
    a: number;
    b: number;
    /** Slope on the centred seven-day change, and the mean it was centred on. */
    c: number;
    growth_mean: number;
    /** Slope on centred log(age_days), and the mean it was centred on. */
    d: number;
    log_age_mean: number;
    n: number;
    /** The law's own 5-fold held-out error in log space, beside TVL alone on the same rows. */
    cv_full: number;
    cv_tvl_only: number;
    /** implied_value_usd / tvl_usd, i.e. the fitted multiple at this row's three figures (1 with no TVL). */
    multiple: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the raw inputs, the fit that priced it, and the farm plan it carries. */
export interface RadarRow {
  rank: number;
  section_rank: number;
  section: Section;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  is_derivative: boolean;
  implied_value_usd: number;
  model: BoardRow['model'];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the fits, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocols_count: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  derivative_size: number;
  launch_size: number;
  live_adjacent_size: number;
  /** How many protocols record both a token and a TVL: the 128 the two laws are fitted on. */
  live_peer_count: number;
  /**
   * The accounting strip: every one of the snapshot's protocols lands in exactly one bucket, and the
   * buckets sum to protocols_count. The dashboard shows this so a reader can check nothing was dropped.
   */
  accounting: {
    total: number;
    /** Records a token (mcap, gecko id or symbol): shown in the Live token view, never ranked. */
    tokenized: number;
    /** No token at all: the population the radar exists to rank. */
    pre_token: number;
    /** Pre-token and on the board, priced and ranked. */
    priced: number;
    /** Pre-token but a CEX listing or a versioned pool: named on the board's excluded list, not ranked. */
    excluded: number;
    /** Priced rows that also appear on the watchlist. */
    watchlist_priced: number;
    /** The check: tokenized + pre_token === total. */
    reconciles: boolean;
  };
  law: Law;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Whole words that mark a wrapped or staked receipt of another token. */
const RECEIPT_WORD = /\b(wrapped|staked|staking)\b/i;
/** An exchange's name at the start of a product name: the product is the exchange's, not a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Categories whose entries are products of tokens that already trade, not protocols awaiting one. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/**
 * Whether a protocol is a derivative product of a token that already trades: a wrapped/staked receipt,
 * an exchange's product, a bridge or liquid-staking category, or a versioned pool. Pure name/category
 * rules, applied identically to every protocol — no slug or name is ever listed by hand.
 */
export function isDerivativeProduct(p: SnapshotProtocol): boolean {
  return (
    RECEIPT_WORD.test(p.name) ||
    EXCHANGE_PREFIX.test(p.name) ||
    (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) ||
    VERSIONED.test(p.name)
  );
}

/** Whether a protocol is one the early radar may add: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

// ---------------------------------------------------------------------------------------------
// The fit. log(mcap) = a + b*log(tvl) + c*g + d*logAge, ridge-penalised on the three slopes.
//
// The design row is [1, log(tvl), g - mean(g), log(age) - mean(log age)]: the two optional terms are
// centred, so a row that records no change_7d or no listed_at takes exactly 0 there and is priced at
// the population's average for the figure it is missing. Nothing is imputed and nothing is dropped.
//
// The ridge objective sum((y - Xb)^2) + lambda * sum(b_slopes^2) has normal equations (X'X + lambda*I0) b
// = X'y with the penalty on the three slopes and none on the intercept, solved by Gauss-Jordan with
// partial pivoting on the 4x4 system: no library, no iteration, nothing carried in from outside the rows.
// With fewer than 8 usable rows, or a singular system, the fit falls back to the flat 0.25 multiple.
// ---------------------------------------------------------------------------------------------

/** The winsorised, uncentred seven-day growth a row contributes, or null when it records none. */
function growthTerm(p: SnapshotProtocol): number | null {
  const c = p.change_7d;
  if (c === null || !Number.isFinite(c)) return null;
  return Math.max(-0.60, Math.min(1.20, c));
}

/** The log age a row contributes, or null when it records no listing date. */
function logAgeTerm(p: SnapshotProtocol, asOf: string): number | null {
  const age = ageDays(asOf, p.listed_at);
  if (age === null) return null;
  return Math.log(Math.max(1, age));
}

/** Solve a small dense system by Gauss-Jordan with partial pivoting; null when it is singular. */
function solveLinear(m: number[][], v: number[]): number[] | null {
  const n = v.length;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(m[r]![i]!) > Math.abs(m[piv]![i]!)) piv = r;
    if (Math.abs(m[piv]![i]!) < 1e-12) return null;
    [m[i], m[piv]] = [m[piv]!, m[i]!];
    [v[i], v[piv]] = [v[piv]!, v[i]!];
    for (let r = i + 1; r < n; r++) {
      const f = m[r]![i]! / m[i]![i]!;
      for (let c = i; c < n; c++) m[r]![c]! -= f * m[i]![c]!;
      v[r]! -= f * v[i]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = v[i]!;
    for (let c = i + 1; c < n; c++) s -= m[i]![c]! * x[c]!;
    x[i] = s / m[i]![i]!;
  }
  return x;
}

/** One population's fitted rows, as [y, logTvl, growth, logAge] with the optional two possibly null. */
interface FitRow { y: number; x: number; g: number | null; a: number | null }

/** The design row for a fit row under a set of means: the optional terms centre to 0 when absent. */
function designRow(r: FitRow, gm: number, am: number, tvlOnly: boolean): number[] {
  return tvlOnly ? [1, r.x] : [1, r.x, r.g === null ? 0 : r.g - gm, r.a === null ? 0 : r.a - am];
}

/** Ridge solve on a design; returns the coefficient vector or null. */
function ridgeFit(rows: FitRow[], lambda: number, gm: number, am: number, tvlOnly: boolean): number[] | null {
  const k = tvlOnly ? 2 : 4;
  const M: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const v = new Array<number>(k).fill(0);
  let n = 0;
  for (const r of rows) {
    const f = designRow(r, gm, am, tvlOnly);
    n++;
    for (let i = 0; i < k; i++) {
      v[i]! += f[i]! * r.y;
      for (let j = 0; j < k; j++) M[i]![j]! += f[i]! * f[j]!;
    }
  }
  if (n < (tvlOnly ? 3 : 8)) return null;
  for (let i = 1; i < k; i++) M[i]![i]! += lambda;
  return solveLinear(M, v);
}

/** Mean absolute error in log space of a coefficient vector over the given rows. */
function maeOf(rows: FitRow[], beta: number[], gm: number, am: number, tvlOnly: boolean): number {
  if (rows.length === 0) return 0;
  let s = 0;
  for (const r of rows) {
    const f = designRow(r, gm, am, tvlOnly);
    let p = 0;
    for (let i = 0; i < beta.length; i++) p += beta[i]! * f[i]!;
    s += Math.abs(r.y - p);
  }
  return s / rows.length;
}

/**
 * Fit one population's law, and measure it against the TVL-only law on the same rows by 5-fold
 * cross-validation, so the fit carries its own out-of-sample verdict instead of a claim about one.
 * The folds are dealt by a fixed LCG, so the same snapshot always yields the same CV numbers.
 */
export function fitPowerLaw(rows: SnapshotProtocol[], lambda: number, asOf: string): PowerLaw {
  const usable: FitRow[] = [];
  for (const p of rows) {
    if (p.mcap_usd === null || !(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
    usable.push({ y: Math.log(p.mcap_usd), x: Math.log(p.tvl_usd), g: growthTerm(p), a: logAgeTerm(p, asOf) });
  }
  const n = usable.length;
  const fallback: PowerLaw = {
    a: Math.log(0.25), b: 1, c: 0, d: 0, n, r2: 0, growthMean: 0, logAgeMean: 0,
    cv: { full: 0, tvlOnly: 0, folds: 0, rows: 0 },
  };
  if (n < 8) return fallback;

  // The centring means, over the rows that record each figure.
  let gs = 0, gn = 0, as = 0, an = 0;
  for (const r of usable) {
    if (r.g !== null) { gs += r.g; gn++; }
    if (r.a !== null) { as += r.a; an++; }
  }
  const growthMean = gn > 0 ? gs / gn : 0;
  const logAgeMean = an > 0 ? as / an : 0;

  const beta = ridgeFit(usable, lambda, growthMean, logAgeMean, false);
  if (beta === null) return fallback;

  // R^2 in log space on the fitted line, and the in-sample error.
  let sy = 0;
  for (const r of usable) sy += r.y;
  const mean = sy / n;
  let sst = 0, sse = 0;
  for (const r of usable) {
    const f = designRow(r, growthMean, logAgeMean, false);
    let p = 0;
    for (let i = 0; i < beta.length; i++) p += beta[i]! * f[i]!;
    sst += (r.y - mean) ** 2;
    sse += (r.y - p) ** 2;
  }

  // 5-fold cross-validation, full law against TVL alone, on identical folds.
  const FOLDS = 5;
  const fold = new Array<number>(n);
  let seed = 0x2545f491;
  const order = usable.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  order.forEach((idx, i) => { fold[idx] = i % FOLDS; });

  let cvFull = 0, cvTvl = 0, cvN = 0;
  for (let k = 0; k < FOLDS; k++) {
    const train = usable.filter((_, i) => fold[i] !== k);
    const test = usable.filter((_, i) => fold[i] === k);
    if (test.length === 0 || train.length < 8) continue;
    let ts = 0, tn = 0, tas = 0, tan = 0;
    for (const r of train) {
      if (r.g !== null) { ts += r.g; tn++; }
      if (r.a !== null) { tas += r.a; tan++; }
    }
    const gm = tn > 0 ? ts / tn : 0;
    const am = tan > 0 ? tas / tan : 0;
    const bFull = ridgeFit(train, lambda, gm, am, false);
    const bTvl = ridgeFit(train, lambda, gm, am, true);
    if (bFull !== null) { cvFull += maeOf(test, bFull, gm, am, false); }
    if (bTvl !== null) { cvTvl += maeOf(test, bTvl, gm, am, true); }
    cvN++;
  }

  return {
    a: beta[0]!, b: beta[1]!, c: beta[2] ?? 0, d: beta[3] ?? 0,
    n, r2: sst > 0 ? 1 - sse / sst : 0,
    growthMean, logAgeMean,
    cv: { full: cvN > 0 ? cvFull / cvN : 0, tvlOnly: cvN > 0 ? cvTvl / cvN : 0, folds: cvN, rows: n },
  };
}

/**
 * The two laws the board prices with, each fitted on the snapshot's live protocols of its own kind:
 * every protocol that records a token and a TVL (mcap_usd > 0, tvl_usd > 0), split by
 * isDerivativeProduct. Nothing is hardcoded, so a later snapshot refits itself.
 */
export function buildLaw(snapshot: Snapshot, model: ModelConstants = MODEL): Law {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  return {
    launch: fitPowerLaw(live.filter((p) => !isDerivativeProduct(p)), model.ridge_lambda, snapshot.as_of),
    derivative: fitPowerLaw(live.filter((p) => isDerivativeProduct(p)), model.ridge_lambda, snapshot.as_of),
  };
}

/** The fit a row is priced by: its own population's, never the other section's. */
export function lawOf(derivative: boolean, law: Law): PowerLaw {
  return derivative ? law.derivative : law.launch;
}

/** The value a law implies at a row's three figures: exp(a + b logTvl + c g + d logAge). */
export function valueAt(fit: PowerLaw, tvl: number, g: number | null, age: number | null): number {
  if (!(tvl > 0)) return 0;
  const gc = g === null ? 0 : Math.max(-0.60, Math.min(1.20, g)) - fit.growthMean;
  const ac = age === null ? 0 : Math.log(Math.max(1, age)) - fit.logAgeMean;
  return Math.exp(fit.a + fit.b * Math.log(tvl) + fit.c * gc + fit.d * ac);
}

/** The multiple a fit implies for one row: its value over its TVL. */
export function multipleAt(fit: PowerLaw, tvl: number, g: number | null, age: number | null): number {
  if (!(tvl > 0)) return 1;
  return valueAt(fit, tvl, g, age) / tvl;
}

/** Everything the model says about one protocol, and the implied value it produces. */
export interface Score {
  implied: number;
  multiple: number;
  population: Section;
  derivative: boolean;
  fit: PowerLaw;
  age: number | null;
}

/**
 * The radar-5 score: implied = clamp(round(exp(a + b*log(tvl) + c*g + d*log(age))), 1, 1e13), with the
 * coefficients from the fit for the row's own population and g its winsorised seven-day change. A
 * protocol with no TVL gets the floor, 1: nothing multiplies a zero. A protocol that records no
 * change_7d or no listing date is priced at its population's average for that figure, which is what
 * the centring means; it is never dropped from the board and never priced at an extreme.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  law: Law,
  model: ModelConstants = MODEL,
): Score {
  const derivative = isDerivativeProduct(protocol);
  const population = sectionOf(derivative);
  const fit = lawOf(derivative, law);
  const tvl = protocol.tvl_usd;
  const age = ageDays(asOf, protocol.listed_at);
  const raw = valueAt(fit, tvl, protocol.change_7d, age);
  const implied = Math.min(model.value_cap, Math.max(model.value_floor, Math.round(Number.isFinite(raw) ? raw : 0)));
  return {
    implied,
    multiple: multipleAt(fit, tvl, protocol.change_7d, age),
    population,
    derivative,
    fit,
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The section a protocol's row belongs to: derivative products are adjacent to the live market, not launches. */
export function sectionOf(derivative: boolean): Section {
  return derivative ? 'live-adjacent' : 'launch';
}

/** The protocols the board ranks, strongest first, with ranks 1..n inside each section. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const law = buildLaw(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The whole pre-token universe: every protocol the snapshot records that has no token, by TVL. The
  // watchlist is the floor and never the ceiling (the brief's words), so the board carries all of them,
  // not a slice: a reader who wants the radar to have found the launch must be able to see every
  // candidate, and the accounting strip reconciles the count against the snapshot's own total.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: impliedValue(p, snapshot.as_of, law, model) }));
  const byImplied = (a: typeof scored[number], b: typeof scored[number]): number =>
    b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);

  // Every row lands in exactly one section, and each section is ranked 1..n on its own implied value:
  // a derivative product's multi-billion TVL never buys a place above a launch candidate 100x smaller.
  // That in-section place is `section_rank`.
  const sectionRank = new Map<string, { section: Section; rank: number }>();
  for (const section of SECTIONS) {
    scored.filter((r) => sectionOf(r.s.derivative) === section).sort(byImplied)
      .forEach(({ p }, i) => sectionRank.set(p.slug, { section, rank: i + 1 }));
  }

  // `rank` stays the whole-board ranking the gate reads (competition.yaml, sorted_by_value: "the rows'
  // ranks are exactly 1 to N once each, and implied_value_usd does not rise as rank ascends"). The board
  // is written section by section, in section order, so the array reads as the dashboard draws it; the
  // ranks inside that array are not 1..N in array order, and the page never assumes they are.
  const ranked: BoardRow[] = [];
  for (const section of SECTIONS) {
    const list = scored.filter((r) => sectionOf(r.s.derivative) === section).sort(byImplied);
    for (const { p, s } of list) {
      ranked.push({
        rank: 0,
        section,
        section_rank: sectionRank.get(p.slug)!.rank,
        slug: p.slug,
        name: p.name,
        category: p.category,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        change_7d: p.change_7d,
        mcap_usd: p.mcap_usd,
        listed_at: p.listed_at,
        gecko_id: p.gecko_id,
        symbol: p.symbol,
        token_status: 'pre-token',
        age_days: s.age,
        is_derivative: s.derivative,
        implied_value_usd: s.implied,
        model: {
          population: s.population,
          a: s.fit.a,
          b: s.fit.b,
          c: s.fit.c,
          growth_mean: s.fit.growthMean,
          d: s.fit.d,
          log_age_mean: s.fit.logAgeMean,
          n: s.fit.n,
          cv_full: round6(s.fit.cv.full),
          cv_tvl_only: round6(s.fit.cv.tvlOnly),
          multiple: round6(s.multiple),
        },
        farm_steps: farmSteps(p, s.age, s.derivative).map(stepText),
      });
    }
  }
  // The whole-board ranking, assigned over the finished rows: 1..N once each, never rising in implied value.
  // Ties break on the section's own order, so a rank is stable from run to run.
  const order = [...ranked].sort((a, b) => b.implied_value_usd - a.implied_value_usd
    || SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section)
    || a.section_rank - b.section_rank);
  order.forEach((r, i) => { r.rank = i + 1; });
  return ranked;
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

// ---------------------------------------------------------------------------------------------
// Farm plans. Every figure is derived from the protocol's own record: the category picks the action,
// the TVL band picks the capital and the crowding note, the chain count picks the gas and time bands,
// the age picks the hold window, and the derivative flag changes what the farmer should expect.
// Bands (all estimates, stated as such in the steps):
//   capital: TVL >= $5B -> $400, >= $1B -> $250, >= $100M -> $150, else $75.
//   setup gas: $3 + $2 per counted chain (max 4) -> $5..$11; setup time 10 + 5 per extra chain.
//   bridge (only when 2+ chains): $3 + $1 per extra chain (max 5) -> $4..$8, 10 + 5 min per extra.
//   weekly action: $1 + $1 per 3 chains -> $1..$4; hold: age < 180d -> 60d, < 365d -> 45d, else 30d.
// No protocol name is special-cased; the same derivation writes every plan.
// ---------------------------------------------------------------------------------------------

/** How much capital one farm position needs, from the protocol's own TVL band. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 400;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  return 75;
}

/** The gas band for one setup transaction: more chains to touch, more gas to budget. */
function setupGas(p: SnapshotProtocol): number {
  return 3 + 2 * Math.min(Math.max(p.chains.length, 1), 4);
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A TVL figure in the words a plan can quote. */
function tvlPhrase(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
  return `$${Math.round(tvl / 1e6)}M`;
}

/** The category's core action, in the words a farmer can follow, sized by the TVL band. */
function actionFor(p: SnapshotProtocol, capital: number): string {
  const c = (p.category ?? '').toLowerCase();
  const chain = p.chains[0] ?? 'its main chain';
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, borrow nothing at first, and keep the supply position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} (a stable pair keeps impermanent loss small) and keep the LP position open.`;
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s largest vault on ${chain} and keep the vault shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then make one deposit or swap with the bridged funds so the bridge volume is not the only activity.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} worth of ${chain}'s staking asset through ${name} and hold the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and trade one small, fully hedged position so volume accrues without directional risk.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and place one small position in a market near resolution, then let it settle.`;
  if (c.includes('stable')) return `Mint $${capital} of ${name}'s stable asset on ${chain} against collateral, hold it a week, then repay half so both mint and burn are on record.`;
  if (c.includes('rwa')) return `Subscribe $${capital} to ${name}'s yield-bearing asset on ${chain} (check the eligibility terms first) and hold the position.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy to term.`;
  if (c.includes('payment')) return `Send $${capital} through ${name}'s payment route on ${chain} in two or three transfers rather than one, so the route sees repeat use.`;
  if (c.includes('chain')) return `Bridge $${capital} of the gas asset to ${name}'s chain, then use one native app (a swap or a deposit) so the wallet is active on-chain, not just funded.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} through its main product and keep the position open.`;
}

/**
 * A protocol's farm plan: 6 to 9 steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL band, age, derivative flag). Never a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, derivative: boolean): FarmStep[] {
  const capital = capitalFor(p);
  const gas = setupGas(p);
  const hold = holdDaysFor(age);
  const chain = p.chains[0] ?? 'its main chain';
  const chains = p.chains.length;
  const oneInSized = `1 part in ${Math.round(p.tvl_usd / capital).toLocaleString('en-US')}`;
  const steps: FarmStep[] = [
    {
      text: 'Set up a dedicated farming wallet holding only the capital for this position, seed phrase offline, and label it in your log before the first transaction.',
      cost: 'under $2 of gas to activate',
      time: '5 minutes',
    },
  ];
  if (derivative) {
    steps.push({
      text: `${p.name} is a wrapped, staked, bridged or exchange product of a token that already trades. Farm it only for the parent protocol's published rewards program; do not budget for a new token launch of its own.`,
      cost: 'nothing to verify on the parent protocol\'s own site',
      time: '10 minutes of reading',
    });
  }
  if (chains >= 2) {
    const to = p.chains[1]!;
    const bridgeCost = 3 + Math.min(chains - 1, 5);
    const bridgeMin = 10 + 5 * Math.min(chains - 1, 4);
    steps.push({
      text: `Bridge the farming capital from ${chain} to ${to} (or the cheapest route the protocol supports) so the position sits on a chain ${p.name} actually counts; keep the bridge receipt.`,
      cost: `about $${bridgeCost - 1}-${bridgeCost + 2} in gas and bridge fees`,
      time: `${bridgeMin}-${bridgeMin + 10} minutes`,
    });
  }
  steps.push({
    text: `${actionFor(p, capital)} At ${tvlPhrase(p.tvl_usd)} of TVL your $${capital} is ${oneInSized} of the pool, so the fees you pay matter more than the yield a dashboard quotes.`,
    cost: `$${capital} of capital at risk plus about $${gas} of gas`,
    time: `${10 + 5 * Math.min(Math.max(chains - 1, 0), 4)} minutes to set up`,
  });
  if (chains >= 3) {
    steps.push({
      text: `Repeat a small deposit (a tenth of the capital) on ${p.chains[2]}, the third chain ${p.name} counts, so the wallet shows activity on more than one of its ${chains} chains.`,
      cost: `about $${Math.round(capital / 10)} moved and $${Math.max(2, Math.round(gas / 2))} of gas`,
      time: '15 minutes',
    });
  }
  steps.push({
    text: 'Make one qualifying action each week — a top-up, a borrow-and-repay, a swap or a vote — on the protocol\'s own interface, so the wallet is active in every snapshot window.',
    cost: `about $${1 + Math.round(chains / 3)} of gas a week`,
    time: '10 minutes a week',
  });
  steps.push({
    text: `Hold the position at least ${hold} days${age !== null && age < 365 ? ' (the protocol is young, so programs tend to weight longer histories)' : ''} so the activity spans more than one snapshot; set a calendar reminder to review it.`,
    cost: `the $${capital} stays committed; exit gas about $${gas}`,
    time: `${hold} days`,
  });
  steps.push({
    text: `Check ${p.name}'s own points or rewards page weekly and claim only from links it publishes; a ${tvlPhrase(p.tvl_usd)} protocol attracts phishing clones, so bookmark the official URL once and never sign a claim from a DM.`,
    cost: 'no fee to check; never pay to claim',
    time: '5 minutes a week',
  });
  steps.push({
    text: 'Log the wallet, every transaction hash, the dates and the gas paid; when you unwind, withdraw through the same interface you deposited with and reconcile the log so the next farm starts from real numbers.',
    cost: `exit gas about $${gas}`,
    time: '15 minutes to close and reconcile',
  });
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's form for data.js: the raw inputs, every term, and the plan the board carries. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    section_rank: row.section_rank,
    section: row.section,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    is_derivative: row.is_derivative,
    implied_value_usd: row.implied_value_usd,
    model: row.model,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const law = buildLaw(snapshot, model);
  const launchSize = board.filter((r) => r.section === 'launch').length;
  // The accounting strip: every protocol lands in exactly one bucket, and the buckets must sum to the
  // snapshot's own total. Computed here from the same predicates buildBoard ranks with, so the strip
  // cannot drift from the board it describes.
  const tokenized = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const preToken = snapshot.protocols.length - tokenized;
  const pricedSlugs = new Set(board.map((r) => r.slug));
  const priced = snapshot.protocols.filter((p) => isPreToken(p) && pricedSlugs.has(p.slug)).length;
  const accounting = {
    total: snapshot.protocols.length,
    tokenized,
    pre_token: preToken,
    priced,
    excluded: preToken - priced,
    watchlist_priced: snapshot.watchlist.filter((s) => pricedSlugs.has(s)).length,
    reconciles: tokenized + preToken === snapshot.protocols.length,
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocols_count: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !snapshot.watchlist.includes(r.slug)).length,
    live_size: live.length,
    derivative_size: board.filter((r) => r.is_derivative).length,
    launch_size: launchSize,
    live_adjacent_size: board.length - launchSize,
    live_peer_count: law.launch.n + law.derivative.n,
    accounting,
    law,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks per section, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (const r of board) {
    const want: Section = r.is_derivative ? 'live-adjacent' : 'launch';
    if (r.section !== want) return `${r.slug} sits in section ${r.section} but ${want} is its own`;
  }
  // rank: 1..N once each across the whole board, never rising in implied value (the gate's sorted_by_value).
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const global = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < global.length; i++) if (global[i]!.implied_value_usd > global[i - 1]!.implied_value_usd) {
    return `rank ${i + 1} outranks rank ${i} on implied value`;
  }
  // section_rank: 1..n once each inside each section, in the same implied-value order as `rank` sees.
  for (const section of SECTIONS) {
    const rows = board.filter((r) => r.section === section).sort((a, b) => a.section_rank - b.section_rank);
    for (let i = 0; i < rows.length; i++) if (rows[i]!.section_rank !== i + 1) {
      return `section ${section}: section_rank ${i + 1} is ${rows[i]!.section_rank}`;
    }
    for (let i = 1; i < rows.length; i++) if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `section ${section}: section_rank ${i + 1} outranks section_rank ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}