// Page wiring: pickers, URL state, and rendering results.

(function () {
  const { sets, updatedAt } = window.RIP_DATA;

  const setSelect = document.getElementById("set-select");
  const productList = document.getElementById("product-list");
  const results = document.getElementById("results");
  const updated = document.getElementById("updated");
  const priceInput = document.getElementById("price-input");
  const priceReset = document.getElementById("price-reset");

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

  function renderSetOptions() {
    setSelect.innerHTML = sets
      .map((s) => `<option value="${s.id}">${s.name} (${s.year})</option>`)
      .join("");
    setSelect.value = state.set.id;
  }

  function renderProducts() {
    productList.innerHTML = state.set.products
      .map(
        (p) => `
        <button type="button" class="product${p.id === state.product.id ? " is-active" : ""}"
                data-id="${p.id}" aria-pressed="${p.id === state.product.id}">
          <span class="product-name">${p.name}</span>
          <span class="product-meta">${p.packs} pack${p.packs > 1 ? "s" : ""} · ${money.format(p.price)}</span>
        </button>`
      )
      .join("");
  }

  function renderResults() {
    const a = window.RipOdds.analyze(state.set, state.product, currentPrice());
    const verdict = a.expectedProfit >= 0 ? "rip" : "skip";

    results.innerHTML = `
      <div class="verdict verdict-${verdict}">
        <span class="verdict-label">${verdict === "rip" ? "Rip it" : "Skip it"}</span>
        <span class="verdict-detail">${state.set.name} · ${state.product.name}</span>
      </div>

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
            <th>At least one in ${a.packs} pack${a.packs > 1 ? "s" : ""}</th>
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
              <td>1 in ${Math.round(r.oneIn)}</td>
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
        ${window.RipOdds.chaseCards(state.set, state.product)
          .map(
            (c) => `
          <li>
            <a href="${tcgplayerUrl(c.productId)}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a>
            <span class="chase-meta">${c.rarity} · ${pct(c.chance)} chance in this ${state.product.name}</span>
            <span class="chase-price">${money.format(c.price)}</span>
          </li>`
          )
          .join("")}
      </ol>

      <p class="source">
        ${state.product.name} price from
        <a href="${tcgplayerUrl(state.product.productId)}" target="_blank" rel="noopener">TCGplayer</a>.
      </p>
    `;
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

  updated.textContent = new Date(updatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  renderSetOptions();
  update();
})();
