# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xbang828/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xbang828/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it ranks the protocols in the sealed snapshot that have no token yet by the value
their token would carry on launch, and sets them apart from products of a token that already trades.

The value model is derived from the snapshot itself, not from a hand-picked constant. For the protocols
that do have a token, the snapshot records a market-cap-to-TVL ratio; a pre-token protocol of the same
category is worth about the median of its peers, winsorized to the 10th-90th percentile so one outlier
cannot set the bar, shrunk toward the global median while a category has few peers, and capped at the
90th percentile of the whole distribution. Implied value then scales that multiple by 7-day growth,
protocol age and a small-base rarity term:

```
implied = tvl_usd × category_multiple × growth × maturity × launch × rarity
```

Two ranked sections come out of one snapshot: `launch` (no token, and not a wrapped, staked, bridged or
exchange product of one) and `live-adjacent` (those products, which the watchlist still requires on the
board). Every row carries the terms of its own score, so the dashboard can show what produced it, and a
costed farm plan in steps of real actions with time and gas bands.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

It writes `out/board.json`, `out/data.js`, `out/dashboard/` and `out/dossier.json`, and prints the counts
it scored. Node 22.18 or later, standard library only, no network at run time.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d7zcjnpk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
