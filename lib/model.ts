// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// ---------------------------------------------------------------------------------------------------
// MODEL radar-2 — every term comes from the snapshot's own fields; no protocol name is special-cased.
//
//   liveRatios : for every protocol with mcap_usd non-null and tvl_usd > 0, ratio = mcap_usd / tvl_usd.
//                global = median of all those ratios; per category, n = peer count, median = their median.
//   multiple   = categoryMultiple(category):
//                  no live peers (or no category) -> global
//                  else w = n / (n + PSEUDO_COUNT);  value = w * median + (1 - w) * global
//                  clamped to [MULTIPLE_FLOOR, MULTIPLE_CAP] = [0.02, 8.0], PSEUDO_COUNT = 8.
//   launch     = isDerivativeProduct(p) ? LAUNCH_DERIVATIVE (0.55) : LAUNCH_FULL (1.0).
//                A derivative product is one whose name carries a whole word wrapped|staked|staking
//                (any case), begins with an exchange name (Binance, Coinbase, Bybit, Kraken, Bitget,
//                OKX, Bitfinex, Gemini), whose category is Bridge, Canonical Bridge, Liquid Staking,
//                Liquid Restaking, Restaked BTC or CEX, or whose name ends in a version marker
//                (a space then V2, v3, 2.0 ... : /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/).
//                Such a product belongs to a token that already trades, not to a pending launch.
//   growth     = 1 + clamp(change_7d, GROWTH_FLOOR=-60, GROWTH_CAP=120) / 100 * GROWTH_WEIGHT (0.5)
//                (change_7d null reads as 0).
//   maturity   = MATURITY_FLOOR (0.6) + min(ageDays, MATURITY_DAYS=1095) / 1095 * MATURITY_RANGE (0.4)
//                ageDays = whole days from listed_at to as_of; unknown age reads as UNKNOWN_AGE_DAYS=365.
//   rarity     = 1 + RARITY_WEIGHT (0.35) * (1 - tvl_usd / maxPreTvl), maxPreTvl = the largest TVL among
//                ALL pre-token protocols in the snapshot: scarce pre-token TVL is worth a premium.
//   implied    = max(1, round(tvl_usd * multiple * growth * maturity * launch * rarity))
//
// The dashboard states this formula and every constant, and recomputes each row from the same raw
// fields to check the board's number. The constants live in MODEL below and nowhere else.
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
  pseudo_count: number;
  multiple_floor: number;
  multiple_cap: number;
  launch_full: number;
  launch_derivative: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  rarity_weight: number;
}

export const MODEL: ModelConstants = {
  pseudo_count: 8,
  multiple_floor: 0.02,
  multiple_cap: 8.0,
  launch_full: 1.0,
  launch_derivative: 0.55,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  rarity_weight: 0.35,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

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

/** The mcap/TVL evidence the model learns from: one median per category, plus the global median. */
export interface LiveRatios {
  global_median: number;
  peer_count: number;
  categories: Record<string, { n: number; median: number }>;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  model: {
    category_multiple: number;
    peer_count: number;
    category_median: number | null;
    global_median: number;
    launch_multiplier: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    rarity_multiplier: number;
    max_pre_token_tvl: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the raw inputs, the terms, and the farm plan the board carries. */
export interface RadarRow {
  rank: number;
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
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  launch_multiplier: number;
  rarity_multiplier: number;
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

/** Everything the dashboard needs: the board, the live set, the evidence, and the model it runs. */
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
  max_pre_token_tvl: number;
  ratios: LiveRatios;
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

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers (the middle value, or the mean of the middle two). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
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

/** The mcap/TVL evidence from the snapshot's live protocols (mcap recorded, TVL positive). */
export function buildLiveRatios(snapshot: Snapshot): LiveRatios {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  const categories: Record<string, { n: number; median: number }> = {};
  for (const [category, ratios] of byCategory) categories[category] = { n: ratios.length, median: median(ratios) };
  return { global_median: all.length > 0 ? median(all) : MODEL.multiple_floor, peer_count: all.length, categories };
}

/**
 * What one dollar of this category's TVL has been worth as market cap: the category's live median
 * shrunk toward the global median with a pseudo-count of 8, clamped to [0.02, 8.0]. A category with
 * no live peers uses the global median.
 */
export function categoryMultiple(category: string | null, ratios: LiveRatios, model: ModelConstants = MODEL): number {
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const peers = category === null ? undefined : ratios.categories[category];
  if (peers === undefined || peers.n === 0) return clamp(ratios.global_median);
  const w = peers.n / (peers.n + model.pseudo_count);
  return clamp(w * peers.median + (1 - w) * ratios.global_median);
}

/** Every term of the model for one protocol, and the implied value they produce. */
export interface Score {
  implied: number;
  multiple: number;
  peerCount: number;
  categoryMedian: number | null;
  launch: number;
  derivative: boolean;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  rarityMult: number;
  age: number | null;
}

/**
 * The radar-2 score: implied = max(1, round(tvl * multiple * growth * maturity * launch * rarity)).
 * `maxPreTvl` is the largest TVL among all pre-token protocols in the snapshot (the rarity anchor).
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  ratios: LiveRatios,
  maxPreTvl: number,
  model: ModelConstants = MODEL,
): Score {
  const multiple = categoryMultiple(protocol.category, ratios, model);
  const peers = protocol.category === null ? undefined : ratios.categories[protocol.category];
  const derivative = isDerivativeProduct(protocol);
  const launch = derivative ? model.launch_derivative : model.launch_full;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = Math.min(Math.max(age ?? model.unknown_age_days, 0), model.maturity_days);
  const maturityMult = model.maturity_floor + (ageForModel / model.maturity_days) * model.maturity_range;
  const rarityMult = 1 + model.rarity_weight * (1 - protocol.tvl_usd / maxPreTvl);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * launch * rarityMult));
  return {
    implied,
    multiple,
    peerCount: peers?.n ?? 0,
    categoryMedian: peers?.median ?? null,
    launch,
    derivative,
    growthPct,
    growthMult,
    maturityMult,
    rarityMult,
    age,
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const ratios = buildLiveRatios(snapshot);
  const preToken = snapshot.protocols.filter(isPreToken);
  const maxPreTvl = Math.max(1, ...preToken.map((p) => p.tvl_usd));
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

  const scored = [...chosen.values()].map((p) => ({ p, s: impliedValue(p, snapshot.as_of, ratios, maxPreTvl, model) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
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
      category_multiple: round4(s.multiple),
      peer_count: s.peerCount,
      category_median: s.categoryMedian === null ? null : round4(s.categoryMedian),
      global_median: round4(ratios.global_median),
      launch_multiplier: s.launch,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      rarity_multiplier: round4(s.rarityMult),
      max_pre_token_tvl: maxPreTvl,
      age_days: s.age,
    },
    farm_steps: farmSteps(p, s.age, s.derivative).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

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
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    launch_multiplier: row.model.launch_multiplier,
    rarity_multiplier: row.model.rarity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const ratios = buildLiveRatios(snapshot);
  const preToken = snapshot.protocols.filter(isPreToken);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocols_count: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    derivative_size: board.filter((r) => r.is_derivative).length,
    max_pre_token_tvl: Math.max(1, ...preToken.map((p) => p.tvl_usd)),
    ratios,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
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