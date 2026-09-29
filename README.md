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

## Structure

- `index.html` — page layout
- `style.css` — styling
- `js/odds.js` — odds math: chance of each hit, expected value, chance of profit, chase cards
- `js/app.js` — set/product pickers and results rendering

The selected set and product are kept in the URL (`#set=...&product=...`), so results can be shared by link.
