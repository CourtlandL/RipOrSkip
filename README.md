# RipOrSkip

Pick a Pokémon set and a sealed product, and see the odds of pulling hits and turning a profit.

Live site: https://courtlandl.github.io/RipOrSkip/

Hosted on GitHub Pages, deployed by the `Update prices and deploy` GitHub Action:

- every push to `main` redeploys the site
- once a day (21:00 UTC) it pulls fresh prices, commits `js/data.js`, and redeploys
- it can also be run by hand from the repo's **Actions** tab

## Data

Prices are TCGplayer market prices from [TCGCSV](https://tcgcsv.com), which republishes TCGplayer's catalog daily.

- `data/sets.json` — **hand-maintained**: which sets to show, their TCGplayer group IDs, pull rates
  (percent of packs containing each rarity) with their source, and the sealed products with pack
  counts and TCGplayer product IDs
- `scripts/update-prices.ps1` — reads `data/sets.json`, fetches card and sealed prices, writes `js/data.js`
- `js/data.js` — **generated**, don't edit by hand

Each product can carry a `retail` MSRP, used when the site's price switch is set to Retail. Era defaults and
product-specific MSRPs are set in `data/sets.json`; products without one fall back to market price in the
calculator and are left out of the retail leaderboard.

Premium collections (SPCs, UPCs, Premium Collections) are products with `"kind": "collection"`; only their
booster packs are valued. A product whose packs aren't just N packs of its own set lists them in `contents`
(e.g. the 30th Celebration UPC's bonus Classic Collection pack). Collections mixing several sets live under
`collections` in `data/sets.json`; ones whose pack mix varies by copy (e.g. Charizard ex SPC) are left out.

To add a set: find its group ID at https://tcgcsv.com/tcgplayer/3/groups, list its sealed products with
`./scripts/update-prices.ps1 -ListSealed <groupId>`, add an entry to `data/sets.json`, then run
`./scripts/update-prices.ps1`.

Pull rates come from the TCGplayer Authentication Center's published pack-opening studies
(one article per set, linked in `pullRateSource`), except Shrouded Fable, which uses a community study.
Rarities with no measured rate (Black White Rare, RGB Rare) are left out and noted on the site.

## Odds model

- Rarities sharing a pack slot (`slot` in `js/data.js`, assigned by the update script) are rolled as one
  draw, so e.g. an Illustration Rare and a Special Illustration Rare can't come from the same slot.
- **After selling fees** values every card at what you'd net on TCGplayer: 10.75% commission (capped at
  $75), 2.5% + $0.30 processing, and ~$1 envelope / ~$5 tracked shipping (over $50). Constants are at the
  top of `js/odds.js`.
- **Count bulk** (off by default) adds each set's bulk value per pack: typical common, uncommon and reverse
  holo prices, plus a regular rare when the Rare slot isn't a hit.
- Each card's "rip or buy" view compares its price with the expected net cost of ripping for it
  (packs needed at the cheapest per-pack price, minus the value of everything else pulled).

## Structure

- `index.html` — page layout
- `style.css` — styling
- `js/odds.js` — odds math: chance of each hit, expected value, chance of profit, chase cards
- `js/app.js` — set/product pickers and results rendering

The selected set and product are kept in the URL (`#set=...&product=...`), so results can be shared by link.
