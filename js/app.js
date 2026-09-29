// Page wiring: pickers, URL state, and rendering results.

(function () {
  const { sets } = window.RIP_DATA;

  const setSelect = document.getElementById("set-select");
  const productList = document.getElementById("product-list");
  const results = document.getElementById("results");

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const pct = (x) => (x >= 0.995 && x < 1 ? ">99%" : Math.round(x * 100) + "%");
  const signedMoney = (x) => (x >= 0 ? "+" : "−") + money.format(Math.abs(x));

  let state = readHash();

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const set = sets.find((s) => s.id === params.get("set")) || sets[0];
    const product = set.products.find((p) => p.id === params.get("product")) || set.products[0];
    return { set, product };
  }

  function writeHash() {
    history.replaceState(null, "", `#set=${state.set.id}&product=${state.product.id}`);
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
    const a = window.RipOdds.analyze(state.set, state.product);
    const verdict = a.expectedProfit >= 0 ? "rip" : "skip";

    results.innerHTML = `
      <div class="verdict verdict-${verdict}">
        <span class="verdict-label">${verdict === "rip" ? "Rip it" : "Skip it"}</span>
        <span class="verdict-detail">${state.set.name} · ${state.product.name}</span>
      </div>

      <div class="stats">
        ${stat("Price", money.format(a.price))}
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
    `;
  }

  function stat(label, value, tone = "") {
    return `<div class="stat ${tone}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
  }

  function update() {
    writeHash();
    renderProducts();
    renderResults();
  }

  setSelect.addEventListener("change", () => {
    const set = sets.find((s) => s.id === setSelect.value);
    const product = set.products.find((p) => p.id === state.product.id) || set.products[0];
    state = { set, product };
    update();
  });

  productList.addEventListener("click", (e) => {
    const button = e.target.closest(".product");
    if (!button) return;
    state.product = state.set.products.find((p) => p.id === button.dataset.id);
    update();
  });

  renderSetOptions();
  update();
})();
