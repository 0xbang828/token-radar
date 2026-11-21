// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// ---------------------------------------------------------------------------------------------------
// MODEL radar-4 — one power law, fitted at run time on the snapshot's own live protocols.
//
//   population : the 128 protocols that record a token and a positive TVL (mcap_usd > 0, tvl_usd > 0)
//                split by isDerivativeProduct: non-derivative (the launch section's comparable set) and
//                derivative (the live-adjacent section's). Each population is priced by its own peers,
//                because a wrapped/staked/bridged product sits at a different point of the same curve.
//   fit        : on each population, the least-squares line log(mcap_usd) = a + b * log(tvl_usd) with a
//                ridge penalty RIDGE_LAMBDA (3.0) on b and none on a, solved in closed form from the
//                2x2 normal equations. `fitPowerLaw` returns { a, b, n }. Nothing is hardcoded: the
//                coefficients are what this snapshot's live protocols say, and the board records them.
//                  today's snapshot: non-derivative n=92, a=9.193, b=0.389;
//                                    derivative     n=36, a=5.077, b=0.635.
//   implied    : implied = exp(a + b * log(tvl_usd)) for the row's own population,
//                clamped to [1, 1e13] and rounded. A protocol with no TVL reads 1.
//                b < 1, so the multiple is not a constant: it falls as TVL rises. At $1M/$10M/$100M/$1B
//                TVL the non-derivative fit implies 2.13x / 0.52x / 0.13x / 0.031x, and the derivative
//                fit 1.04x / 0.45x / 0.19x / 0.084x. A row is worth what a protocol of its own size has
//                actually been worth, not TVL times one number.
//   dropped    : 7-day growth, age and chain count each made held-out error worse when added
//                (1.6000 -> 1.6294 growth, -> 1.6162 age, -> 1.6429 all three), and category effects
//                beyond TVL were noise (1.4705 -> 1.4651 on 92 rows). None of them is in the score.
//                The category-median multiple radar-3 shipped scored worse out of sample than a flat
//                0.25 (1.8219 vs 1.7672 mean absolute error in log space); the fitted law scores 1.6379.
//   sections   : every row is ranked inside its own section, 1..n, launch candidates first:
//                  'launch'         rows with isDerivativeProduct(p) === false
//                  'live-adjacent'  rows with isDerivativeProduct(p) === true
//                No row is dropped: the watchlist coverage gate sees every slug either way, and a
//                derivative product's $7-13B TVL can no longer outrank a pre-token protocol 100x smaller.
//                `rank` is the whole-board place (1..N once each, never rising on implied value: what the
//                gate's sorted_by_value row reads), and `section_rank` is the same row's place inside its
//                own section (1..n). The board array is written section by section so it reads as the
//                dashboard draws it; the dashboard and the detail view rank on `section_rank` where a
//                section is shown alone, and never compare a section rank across sections.
//                A derivative product is one whose name carries a whole word wrapped|staked|staking
//                (any case), begins with an exchange name (Binance, Coinbase, Bybit, Kraken, Bitget,
//                OKX, Bitfinex, Gemini), whose category is Bridge, Canonical Bridge, Liquid Staking,
//                Liquid Restaking, Restaked BTC or CEX, or whose name ends in a version marker
//                (a space then V2, v3, 2.0 ... : /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/).
//
// The dashboard states this formula and the fitted coefficients, and recomputes every row from the
// same fitted a and b to check the board's number. The constants live in MODEL below and nowhere else.
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
export const MODEL_VERSION = 'radar-4';

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
 * A power law fitted on one population of live protocols: mcap = exp(a + b * log(tvl)).
 * `n` is how many live protocols it was fitted on, `r2` how much of the log-variance it explains.
 */
export interface PowerLaw {
  a: number;
  b: number;
  n: number;
  r2: number;
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
  /** The fit this row was priced by: its own population's a, b, n, and the multiple they imply here. */
  model: {
    population: Section;
    a: number;
    b: number;
    n: number;
    /** implied_value_usd / tvl_usd, i.e. the fitted multiple at this row's TVL (1 when it has no TVL). */
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
  model: { population: Section; a: number; b: number; n: number; multiple: number };
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

/**
 * A least-squares power law log(mcap) = a + b * log(tvl) fitted on `rows`, with a ridge penalty
 * `lambda` on the slope b only and none on the intercept a.
 *
 * The normal equations of the ridge objective sum((y - a - b x)^2) + lambda * b^2 are
 *   n a + sx b = sy
 *   sx a + (sxx + lambda) b = sxy
 * so a = (sy (sxx + lambda) - sx sxy) / det and b = (n sxy - sx sy) / det, det = n (sxx + lambda) - sx^2,
 * solved here in closed form: no iteration, no library, and nothing carried in from outside the rows.
 * With no rows at all, or a degenerate spread, the fit is the flat 0.25 multiple every pre-token protocol
 * is worth by default (b = 1, a = log(0.25)) so the board still scores instead of dividing by zero.
 */
export function fitPowerLaw(rows: SnapshotProtocol[], lambda: number): PowerLaw {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const p of rows) {
    if (p.mcap_usd === null || !(p.mcap_usd > 0) || !(p.tvl_usd > 0)) continue;
    const x = Math.log(p.tvl_usd), y = Math.log(p.mcap_usd);
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
  }
  if (n < 2) return { a: Math.log(0.25), b: 1, n, r2: 0 };
  const det = n * (sxx + lambda) - sx * sx;
  if (!(det > 1e-12)) return { a: Math.log(0.25), b: 1, n, r2: 0 };
  const b = (n * sxy - sx * sy) / det;
  const a = (sy - b * sx) / n;
  // R^2 in log space, on the unpenalised line through these two coefficients.
  const mean = sy / n;
  const sst = syy - n * mean * mean;
  const sse = Math.max(0, syy - 2 * a * sy - 2 * b * sxy + n * a * a + 2 * a * b * sx + b * b * sxx);
  return { a, b, n, r2: sst > 0 ? 1 - sse / sst : 0 };
}

/**
 * The two laws the board prices with, each fitted on the snapshot's live protocols of its own kind:
 * every protocol that records a token and a TVL (mcap_usd > 0, tvl_usd > 0), split by
 * isDerivativeProduct. Nothing is hardcoded, so a later snapshot refits itself.
 */
export function buildLaw(snapshot: Snapshot, model: ModelConstants = MODEL): Law {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  return {
    launch: fitPowerLaw(live.filter((p) => !isDerivativeProduct(p)), model.ridge_lambda),
    derivative: fitPowerLaw(live.filter((p) => isDerivativeProduct(p)), model.ridge_lambda),
  };
}

/** The fit a row is priced by: its own population's, never the other section's. */
export function lawOf(derivative: boolean, law: Law): PowerLaw {
  return derivative ? law.derivative : law.launch;
}

/** The multiple a fit implies at `tvl`: exp(a + b log(tvl)) / tvl. The board's implied value over its TVL. */
export function multipleAt(fit: PowerLaw, tvl: number): number {
  if (!(tvl > 0)) return 1;
  return Math.exp(fit.a + fit.b * Math.log(tvl)) / tvl;
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
 * The radar-4 score: implied = clamp(round(exp(a + b * log(tvl))), 1, 1e13), with a and b from the fit
 * for the row's own population. A protocol with no TVL gets the floor, 1: nothing multiplies a zero.
 * Growth, age, chain count and category play no part — see the header for what dropping them measured.
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
  const raw = tvl > 0 ? Math.exp(fit.a + fit.b * Math.log(tvl)) : 0;
  const implied = Math.min(model.value_cap, Math.max(model.value_floor, Math.round(Number.isFinite(raw) ? raw : 0)));
  return {
    implied,
    multiple: multipleAt(fit, tvl),
    population,
    derivative,
    fit,
    age: ageDays(asOf, protocol.listed_at),
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
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
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
          n: s.fit.n,
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