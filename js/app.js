// Page wiring: pickers, URL state, and rendering results.

(function () {
  const { sets, updatedAt } = window.RIP_DATA;
  const setsById = Object.fromEntries(sets.map((s) => [s.id, s]));

  // What opening a product means for the odds engine: packs (and bonus cards) by set.
  const components = (product) =>
    product.contents.map((c) => ({ set: setsById[c.set], packs: c.packs, bonus: c.bonus }));

  const unique = (items) => [...new Set(items.filter(Boolean))];

  const setSelect = document.getElementById("set-select");
  const productList = document.getElementById("product-list");
  const results = document.getElementById("results");
  const updated = document.getElementById("updated");
  const priceInput = document.getElementById("price-input");
  const priceReset = document.getElementById("price-reset");
  const lbList = document.getElementById("lb-list");
  const lbSort = document.getElementById("lb-sort");
  const lbToggle = document.getElementById("lb-toggle");
  const lbSub = document.getElementById("lb-sub");
  const searchInput = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  const modeButtons = document.querySelectorAll(".price-mode button");
  const LB_TOP = 10;
  const MODE_LABEL = { market: "market", retail: "retail (MSRP)" };

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const pct = (x) =>
    x >= 0.995 && x < 1 ? ">99%" : x > 0 && x < 0.005 ? "<1%" : Math.round(x * 100) + "%";
  const signedMoney = (x) => (x >= 0 ? "+" : "−") + money.format(Math.abs(x));
  const tcgplayerUrl = (productId) => `https://www.tcgplayer.com/product/${productId}`;
  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // customPrice is null unless the user typed their own price.
  // priceMode ("market" or "retail") picks which price everything is judged against.
  let state = readHash();
  let priceMode = new URLSearchParams(location.hash.slice(1)).get("prices") === "retail" ? "retail" : "market";

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const set = sets.find((s) => s.id === params.get("set")) || sets[0];
    const product = set.products.find((p) => p.id === params.get("product")) || set.products[0];
    const price = parseFloat(params.get("price"));
    return { set, product, customPrice: price >= 0 ? price : null };
  }

  function writeHash() {
    let hash = `#set=${state.set.id}&product=${state.product.id}`;
    if (priceMode === "retail") hash += "&prices=retail";
    if (state.customPrice !== null) hash += `&price=${state.customPrice}`;
    history.replaceState(null, "", hash);
  }

  // Retail only makes sense for products still realistically on shelves: released in
  // the last RETAIL_YEARS years (the product's own date for later reprint collections,
  // otherwise its set's). Older ones are judged at market price even in retail mode.
  const RETAIL_YEARS = 3;
  const retailCutoff = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - RETAIL_YEARS);
    return d.toISOString().slice(0, 10);
  })();
  const ownerSet = new Map(sets.flatMap((s) => s.products.map((p) => [p, s])));
  const releaseDate = (product) => product.releaseDate ?? ownerSet.get(product)?.releaseDate;
  const atRetail = (product) => Boolean(product.retail) && releaseDate(product) >= retailCutoff;

  // The product's price in the current mode, or undefined when retail doesn't apply to it.
  const modePrice = (product) =>
    priceMode === "retail" ? (atRetail(product) ? product.retail : undefined) : product.price;

  // Why a product has no retail price, for notes and product buttons.
  function retailGap(product) {
    if (!product.retail) return { short: "no MSRP", note: "No retail price (MSRP) on file for this product, so it's shown at market price." };
    const released = new Date(`${releaseDate(product)}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    return {
      short: "not at retail",
      note: `Released ${released}, more than ${RETAIL_YEARS} years ago, so it's rarely on shelves at retail. Shown at market price.`,
    };
  }

  function currentPrice() {
    return state.customPrice ?? modePrice(state.product) ?? state.product.price;
  }

  function priceLabel() {
    if (state.customPrice !== null) return "Your price";
    if (priceMode === "retail" && atRetail(state.product)) return "Retail price";
    return "Market price";
  }

  function renderPriceInput() {
    // Don't overwrite what the user is typing.
    if (document.activeElement !== priceInput) {
      priceInput.value = currentPrice().toFixed(2);
    }
    const base = modePrice(state.product) ?? state.product.price;
    const kind = modePrice(state.product) ? MODE_LABEL[priceMode] : "market";
    priceReset.hidden = state.customPrice === null;
    priceReset.textContent = `Use ${kind} price (${money.format(base)})`;
  }

  function renderModeButtons() {
    modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === priceMode)));
  }

  // Grouped by series, keeping the order sets appear in the data.
  function renderSetOptions() {
    const series = [...new Set(sets.map((s) => s.series))];
    setSelect.innerHTML = series
      .map(
        (name) => `
        <optgroup label="${escapeHtml(name)}">
          ${sets
            .filter((s) => s.series === name)
            .map((s) => `<option value="${s.id}">${escapeHtml(s.name)} (${s.year})</option>`)
            .join("")}
        </optgroup>`
      )
      .join("");
    setSelect.value = state.set.id;
  }

  function renderProducts() {
    productList.innerHTML = state.set.products
      .map(
        (p) => `
        <button type="button" class="product${p.id === state.product.id ? " is-active" : ""}"
                data-id="${p.id}" aria-pressed="${p.id === state.product.id}">
          <span class="product-name">${escapeHtml(p.name)}</span>
          <span class="product-meta">${p.packs} pack${p.packs > 1 ? "s" : ""} · ${modePrice(p) ? money.format(modePrice(p)) : retailGap(p).short}</span>
        </button>`
      )
      .join("");
  }

  function renderResults() {
    const parts = components(state.product);
    const a = window.RipOdds.analyze(parts, currentPrice());
    const verdict = a.expectedProfit >= 0 ? "rip" : "skip";
    const partSets = unique(parts.map((c) => c.set));

    const notes = unique([
      state.product.kind === "collection" &&
        `Only the ${a.packs} booster packs are counted. Promo cards and accessories aren't included in the value.`,
      a.multiSet &&
        `Contains ${parts.map((c) => `${c.packs} ${c.set.name}`).join(", ")} pack${a.packs > 1 ? "s" : ""}.`,
      priceMode === "retail" && !atRetail(state.product) && state.customPrice === null &&
        retailGap(state.product).note,
      ...partSets.map((s) => s.note),
    ]);

    results.innerHTML = `
      <div class="verdict verdict-${verdict}">
        <span class="verdict-label">${verdict === "rip" ? "Rip it" : "Skip it"}</span>
        <span class="verdict-detail">${escapeHtml(state.set.name)} · ${escapeHtml(state.product.name)}</span>
      </div>

      ${notes.map((n) => `<p class="set-note">${escapeHtml(n)}</p>`).join("")}

      ${meter(a.valueRatio)}

      <div class="stats">
        ${stat(priceLabel(), money.format(a.price))}
        ${stat("Expected value", money.format(a.expectedValue))}
        ${stat("Expected profit", signedMoney(a.expectedProfit), a.expectedProfit >= 0 ? "pos" : "neg")}
        ${stat("Chance of profit", pct(a.profitChance))}
        ${stat("Chance of any hit", pct(a.anyHitChance))}
      </div>

      <table class="odds">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Per pack</th>
            <th>${a.multiSet ? "At least one in this product" : `At least one in ${a.packs} pack${a.packs > 1 ? "s" : ""}`}</th>
            <th>Expected pulls</th>
            <th>Avg value</th>
          </tr>
        </thead>
        <tbody>
          ${a.rarities
            .map(
              (r) => `
            <tr>
              <td>${r.name}</td>
              <td>${r.oneIn <= 1 ? "Every pack" : `1 in ${Math.round(r.oneIn).toLocaleString("en-US")}`}${r.estimated ? ` <span class="est" title="Community estimate, not a large measured study">est.</span>` : ""}</td>
              <td>
                <div class="bar"><span style="width:${(r.chance * 100).toFixed(1)}%"></span></div>
                ${pct(r.chance)}
              </td>
              <td>${r.expectedCount.toFixed(2)}</td>
              <td>${money.format(r.avgValue)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <h3 class="subhead">Top chase cards</h3>
      <ol class="chase">
        ${window.RipOdds.chaseCards(parts)
          .map(
            (c) => `
          <li>
            <a href="${tcgplayerUrl(c.productId)}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a>
            <span class="chase-meta">${a.multiSet ? `${escapeHtml(c.set)} · ` : ""}${c.rarity} · ${pct(c.chance)} chance in this ${escapeHtml(state.product.name)}</span>
            <span class="chase-price">${money.format(c.price)}</span>
          </li>`
          )
          .join("")}
      </ol>

      <p class="source">
        ${escapeHtml(state.product.name)} price from
        <a href="${tcgplayerUrl(state.product.productId)}" target="_blank" rel="noopener">TCGplayer</a>.
        ${partSets.map((s) => rateSource(s, a.multiSet)).join(" ")}
      </p>
    `;
  }

  function rateSource(set, withSetName) {
    const src = set.pullRateSource;
    if (!src) return "";
    const packs = src.packs ? ` (${src.packs.toLocaleString("en-US")}+ packs opened)` : "";
    const est = set.estimateSource;
    return `${withSetName ? `${escapeHtml(set.name)} pull rates` : "Pull rates"} from the
      <a href="${src.url}" target="_blank" rel="noopener">${escapeHtml(src.name)}</a>${packs}.
      ${est ? `Estimated rates from <a href="${est.url}" target="_blank" rel="noopener">${escapeHtml(est.name)}</a>.` : ""}`;
  }

  function stat(label, value, tone = "") {
    return `<div class="stat ${tone}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  }

  // Skip-to-Rip bar. Placement is log-scaled on expected value ÷ price:
  // half your money back or worse sits at the Skip end, break-even in the middle,
  // double your money or better at the Rip end.
  function meter(ratio) {
    const position = Math.min(1, Math.max(0, 0.5 + Math.log2(ratio) / 2));
    const caption =
      ratio === Infinity
        ? "It's free — rip it"
        : `Expected value is ${Math.round(ratio * 100)}% of the price`;
    return `
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100"
           aria-valuenow="${Math.round(position * 100)}" aria-label="Skip it to rip it">
        <div class="meter-track">
          <span class="meter-marker" style="left:${(position * 100).toFixed(1)}%"></span>
        </div>
        <div class="meter-labels">
          <span>Skip it</span>
          <span>Break even</span>
          <span>Rip it</span>
        </div>
        <p class="meter-caption">${caption}</p>
      </div>`;
  }

  // Leaderboard: every set × product at the current mode's price. Computed once per mode,
  // re-sorted on demand. In retail mode, products with no MSRP on file are left out.
  const rankings = {};
  let lbShowAll = false;

  const lbSorts = {
    value: (a, b) => b.valueRatio - a.valueRatio,
    chance: (a, b) => b.profitChance - a.profitChance || b.valueRatio - a.valueRatio,
    profit: (a, b) => b.expectedProfit - a.expectedProfit,
  };

  function buildRanking() {
    return sets.flatMap((set) =>
      set.products
        .filter((product) => modePrice(product))
        .map((product) => ({
          set,
          product,
          ...window.RipOdds.analyze(components(product), modePrice(product), 4000),
        }))
    );
  }

  function renderLeaderboard() {
    const ranking = (rankings[priceMode] ??= buildRanking());
    lbSub.textContent =
      priceMode === "retail"
        ? `Products from the last ${RETAIL_YEARS} years, ranked at retail (MSRP) prices. Pick one to open it in the calculator.`
        : "Every set and product, ranked at market prices. Pick one to open it in the calculator.";
    const sorted = [...ranking].sort(lbSorts[lbSort.value]);
    const shown = lbShowAll ? sorted : sorted.slice(0, LB_TOP);

    lbList.innerHTML = shown
      .map(
        (r, i) => `
        <li>
          <button type="button" class="lb-row" data-set="${r.set.id}" data-product="${r.product.id}">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">
              <strong>${escapeHtml(r.set.name)}</strong>
              <span>${escapeHtml(r.product.name)} · ${r.product.packs} pack${r.product.packs > 1 ? "s" : ""}</span>
            </span>
            <span class="lb-metric">
              <span class="lb-label">Value</span>
              <span class="${r.valueRatio >= 1 ? "pos" : "neg"}">${Math.round(r.valueRatio * 100)}%</span>
            </span>
            <span class="lb-metric">
              <span class="lb-label">Profit chance</span>
              <span>${pct(r.profitChance)}</span>
            </span>
            <span class="lb-metric lb-money">
              <span class="lb-label">EV / price</span>
              <span>${money.format(r.expectedValue)} / ${money.format(r.price)}</span>
            </span>
          </button>
        </li>`
      )
      .join("");

    lbToggle.textContent = lbShowAll ? `Show top ${LB_TOP}` : `Show all ${ranking.length}`;
  }

  // Search: sets, products and cards, matched on every word typed (accents ignored).
  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Common shorthand people search with, added to product names.
  const ABBREVIATIONS = [
    [/ultra-premium collection/i, "upc"],
    [/super-premium collection/i, "spc"],
    [/premium collection/i, "pc"],
    [/elite trainer box/i, "etb"],
    [/center etb/i, "pc etb pcetb"],
    [/booster box/i, "bb"],
  ];
  const aliases = (name) => ABBREVIATIONS.filter(([re]) => re.test(name)).map(([, a]) => a).join(" ");

  // Words that match everything, so typing them shouldn't narrow results.
  const FILLER = new Set(["pokemon", "tcg", "the", "of"]);

  const searchIndex = sets.flatMap((set) => [
    { kind: "Set", label: set.name, sub: `${set.series} · ${set.year}`, set, rank: 0 },
    ...set.products.map((product) => ({
      kind: "Product",
      label: `${set.name} ${product.name}`,
      sub: `${product.packs} pack${product.packs > 1 ? "s" : ""}`,
      set,
      product,
      extra: aliases(product.name),
      rank: 1,
    })),
    ...set.rarities.flatMap((r) =>
      r.cards.map((card) => ({
        kind: "Card",
        label: card.name,
        sub: `${set.name} · ${r.name} · ${money.format(card.price)}`,
        set,
        price: card.price,
        rank: 2,
      }))
    ),
  ]).map((entry) => ({
    ...entry,
    haystack: fold(`${entry.label} ${entry.set.name} ${entry.set.series} ${entry.extra ?? ""}`),
  }));

  let searchHits = [];
  let searchActive = -1;

  function runSearch() {
    const words = fold(searchInput.value).split(/\s+/).filter((w) => w && !FILLER.has(w));
    searchHits = words.length
      ? searchIndex
          .filter((e) => words.every((w) => e.haystack.includes(w)))
          .sort((a, b) => a.rank - b.rank || (b.price ?? 0) - (a.price ?? 0))
          .slice(0, 8)
      : [];
    searchActive = searchHits.length ? 0 : -1;
    renderSearch();
  }

  function renderSearch() {
    const open = searchInput.value.trim() !== "";
    searchResults.hidden = !open;
    searchInput.setAttribute("aria-expanded", String(open));
    searchResults.innerHTML = searchHits.length
      ? searchHits
          .map(
            (e, i) => `
          <li role="option" id="search-${i}" data-index="${i}" aria-selected="${i === searchActive}"
              class="${i === searchActive ? "is-active" : ""}">
            <span class="search-kind">${e.kind}</span>
            <span class="search-label">${escapeHtml(e.label)}</span>
            <span class="search-sub">${escapeHtml(e.sub)}</span>
          </li>`
          )
          .join("")
      : `<li class="search-empty">No matches</li>`;
    if (searchActive >= 0) searchInput.setAttribute("aria-activedescendant", `search-${searchActive}`);
    else searchInput.removeAttribute("aria-activedescendant");
  }

  function pickSearchHit(hit) {
    const product =
      hit.product || hit.set.products.find((p) => p.id === state.product.id) || hit.set.products[0];
    state = { set: hit.set, product, customPrice: null };
    setSelect.value = hit.set.id;
    searchInput.value = "";
    searchHits = [];
    renderSearch();
    searchInput.blur();
    update();
    document.getElementById("calculator").scrollIntoView({ behavior: "smooth" });
  }

  function update() {
    writeHash();
    renderModeButtons();
    renderProducts();
    renderPriceInput();
    renderResults();
  }

  setSelect.addEventListener("change", () => {
    const set = sets.find((s) => s.id === setSelect.value);
    const product = set.products.find((p) => p.id === state.product.id) || set.products[0];
    state = { set, product, customPrice: null };
    update();
  });

  productList.addEventListener("click", (e) => {
    const button = e.target.closest(".product");
    if (!button) return;
    state.product = state.set.products.find((p) => p.id === button.dataset.id);
    state.customPrice = null;
    update();
  });

  let priceTimer;
  priceInput.addEventListener("input", () => {
    const price = parseFloat(priceInput.value);
    if (!(price >= 0)) return;
    clearTimeout(priceTimer);
    priceTimer = setTimeout(() => {
      const base = modePrice(state.product) ?? state.product.price;
      state.customPrice = Math.abs(price - base) < 0.005 ? null : price;
      update();
    }, 250);
  });

  priceInput.addEventListener("blur", renderPriceInput);

  priceReset.addEventListener("click", () => {
    state.customPrice = null;
    update();
  });

  modeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.mode === priceMode) return;
      priceMode = button.dataset.mode;
      state.customPrice = null;
      update();
      renderLeaderboard();
    })
  );

  searchInput.addEventListener("input", runSearch);

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!searchHits.length) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      searchActive = (searchActive + step + searchHits.length) % searchHits.length;
      renderSearch();
    } else if (e.key === "Enter" && searchActive >= 0) {
      e.preventDefault();
      pickSearchHit(searchHits[searchActive]);
    } else if (e.key === "Escape") {
      searchInput.value = "";
      runSearch();
    }
  });

  // mousedown (not click) so the pick happens before the input loses focus.
  searchResults.addEventListener("mousedown", (e) => {
    const item = e.target.closest("[data-index]");
    if (!item) return;
    e.preventDefault();
    pickSearchHit(searchHits[Number(item.dataset.index)]);
  });

  searchInput.addEventListener("blur", () => {
    searchResults.hidden = true;
    searchInput.setAttribute("aria-expanded", "false");
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) renderSearch();
  });

  lbSort.addEventListener("change", renderLeaderboard);

  lbToggle.addEventListener("click", () => {
    lbShowAll = !lbShowAll;
    renderLeaderboard();
  });

  lbList.addEventListener("click", (e) => {
    const row = e.target.closest(".lb-row");
    if (!row) return;
    const set = sets.find((s) => s.id === row.dataset.set);
    state = { set, product: set.products.find((p) => p.id === row.dataset.product), customPrice: null };
    setSelect.value = set.id;
    update();
    document.getElementById("calculator").scrollIntoView({ behavior: "smooth" });
  });

  updated.textContent = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  renderSetOptions();
  update();
  // The leaderboard simulates every product, so let the calculator paint first.
  setTimeout(renderLeaderboard, 0);
})();
