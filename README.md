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
  (as "one in N packs"), and the sealed products with pack counts and TCGplayer product IDs
- `scripts/update-prices.ps1` — reads `data/sets.json`, fetches card and sealed prices, writes `js/data.js`
- `js/data.js` — **generated**, don't edit by hand

To add a set: find its group ID at https://tcgcsv.com/tcgplayer/3/groups, list its sealed products with
`./scripts/update-prices.ps1 -ListSealed <groupId>`, add an entry to `data/sets.json`, then run
`./scripts/update-prices.ps1`.

Pull rates are estimates and still need verifying.

## Structure

- `index.html` — page layout
- `style.css` — styling
- `js/odds.js` — odds math: chance of each hit, expected value, chance of profit, chase cards
- `js/app.js` — set/product pickers and results rendering

The selected set and product are kept in the URL (`#set=...&product=...`), so results can be shared by link.
