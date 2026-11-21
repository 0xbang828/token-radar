# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xbang828/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xbang828/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks the protocols in the sealed snapshot that have no token yet by the value
their token would carry on launch, and sets them apart from products of a token that already trades.

The value model is a power law fitted on the snapshot itself, not a hand-picked constant. The 128
protocols that already record a token and a TVL are split into two populations — non-derivative and
derivative — and each is fitted with `log(mcap) = a + b · log(tvl)` by least squares, with a ridge penalty
of 3.0 on `b` only:

```
implied = clamp(round(exp(a + b · log(tvl_usd))), 1, 1e13)
```

`b` comes out below one (0.389 on today's non-derivative population, 0.635 on the derivative one), so the
market-cap-to-TVL multiple falls with size: about 2.13x at $1M of TVL, 0.52x at $10M, 0.13x at $100M and
0.031x at $1B. Nothing is hardcoded — a later snapshot refits itself — and every row records the `a`, `b`
and `n` that priced it.

Growth, age and chain count were each tested against held-out error and made it worse (1.6000 to 1.6294,
1.6162 and 1.6429 mean absolute error in log space), and category effects beyond TVL were noise, so none
of them is in the score. They stay on the page as context.

Two ranked sections come out of one snapshot: `launch` (no token, and not a wrapped, staked, bridged or
exchange product of one) and `live-adjacent` (those products, which the watchlist still requires on the
board), each priced by its own fit. Every row carries a costed farm plan in steps of real actions with time
and gas bands.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

It writes `out/board.json`, `out/data.js`, `out/dashboard/` and `out/dossier.json`, and prints the counts
it scored. Node 22.18 or later, standard library only, no network at run time.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d7zcjnpk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
