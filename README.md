# RipOrSkip

Pick a Pokémon set and a sealed product, and see the odds of pulling hits and turning a profit.

Live site: https://courtlandl.github.io/RipOrSkip/

Hosted on GitHub Pages from the `main` branch. Every push to `main` redeploys the site.

## Structure

- `index.html` — page layout
- `style.css` — styling
- `js/data.js` — sets, rarities, pull rates, card values and products (**sample data for now**)
- `js/odds.js` — odds math: chance of each hit, expected value, chance of profit
- `js/app.js` — set/product pickers and results rendering

The selected set and product are kept in the URL (`#set=...&product=...`), so results can be shared by link.
