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
  const LB_TOP = 10;

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const pct = (x) =>
    x >= 0.995 && x < 1 ? ">99%" : x > 0 && x < 0.005 ? "<1%" : Math.round(x * 100) + "%";
  const signedMoney = (x) => (x >= 0 ? "+" : "−") + money.format(Math.abs(x));
  const tcgplayerUrl = (productId) => `https://www.tcgplayer.com/product/${productId}`;
  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // customPrice is null when using the market price.
  let state = readHash();

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const set = sets.find((s) => s.id === params.get("set")) || sets[0];
    const product = set.products.find((p) => p.id === params.get("product")) || set.products[0];
    const price = parseFloat(params.get("price"));
    return { set, product, customPrice: price >= 0 ? price : null };
  }

  function writeHash() {
    let hash = `#set=${state.set.id}&product=${state.product.id}`;
    if (state.customPrice !== null) hash += `&price=${state.customPrice}`;
    history.replaceState(null, "", hash);
  }

  function currentPrice() {
    return state.customPrice ?? state.product.price;
  }

  function renderPriceInput() {
    // Don't overwrite what the user is typing.
    if (document.activeElement !== priceInput) {
      priceInput.value = currentPrice().toFixed(2);
    }
    priceReset.hidden = state.customPrice === null;
    priceReset.textContent = `Use market price (${money.format(state.product.price)})`;
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
          <span class="product-meta">${p.packs} pack${p.packs > 1 ? "s" : ""} · ${money.format(p.price)}</span>
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
        ${stat(state.customPrice === null ? "Market price" : "Your price", money.format(a.price))}
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
              <td>${r.oneIn <= 1 ? "Every pack" : `1 in ${Math.round(r.oneIn).toLocaleString("en-US")}`}</td>
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
    return `${withSetName ? `${escapeHtml(set.name)} pull rates` : "Pull rates"} from the
      <a href="${src.url}" target="_blank" rel="noopener">${escapeHtml(src.name)}</a>${packs}.`;
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

  // Leaderboard: every set × product at market price. Computed once, re-sorted on demand.
  let ranking = null;
  let lbShowAll = false;

  const lbSorts = {
    value: (a, b) => b.valueRatio - a.valueRatio,
    chance: (a, b) => b.profitChance - a.profitChance || b.valueRatio - a.valueRatio,
    profit: (a, b) => b.expectedProfit - a.expectedProfit,
  };

  function buildRanking() {
    ranking = sets.flatMap((set) =>
      set.products.map((product) => ({
        set,
        product,
        ...window.RipOdds.analyze(components(product), product.price, 4000),
      }))
    );
  }

  function renderLeaderboard() {
    if (!ranking) buildRanking();
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

  function update() {
    writeHash();
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
      state.customPrice = Math.abs(price - state.product.price) < 0.005 ? null : price;
      update();
    }, 250);
  });

  priceInput.addEventListener("blur", renderPriceInput);

  priceReset.addEventListener("click", () => {
    state.customPrice = null;
    update();
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
