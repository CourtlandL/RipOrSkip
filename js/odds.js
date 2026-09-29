// Odds math. Pure functions — no page code in here.

window.RipOdds = (function () {
  // Chance that a single pack contains no hit at all.
  function missChance(set) {
    const hitChance = set.rarities.reduce((sum, r) => sum + r.perPack, 0);
    return Math.max(0, 1 - hitChance);
  }

  // Chance of at least one of this rarity across `packs` packs.
  function atLeastOne(perPack, packs) {
    return 1 - Math.pow(1 - perPack, packs);
  }

  function expectedValuePerPack(set) {
    return set.rarities.reduce(
      (sum, r) => sum + r.perPack * r.avgValue,
      set.bulkValuePerPack
    );
  }

  // Value of one simulated pack. Sampling happens here so card-level
  // values can replace rarity averages later without touching anything else.
  function simulatePack(set) {
    let roll = Math.random();
    for (const r of set.rarities) {
      if (roll < r.perPack) return set.bulkValuePerPack + r.avgValue;
      roll -= r.perPack;
    }
    return set.bulkValuePerPack;
  }

  // Monte Carlo estimate of how often opening the product beats its price.
  function profitChance(set, product, runs = 20000) {
    let wins = 0;
    for (let i = 0; i < runs; i++) {
      let value = 0;
      for (let p = 0; p < product.packs; p++) value += simulatePack(set);
      if (value > product.price) wins++;
    }
    return wins / runs;
  }

  function analyze(set, product) {
    const packs = product.packs;
    const ev = expectedValuePerPack(set) * packs;
    return {
      packs,
      price: product.price,
      expectedValue: ev,
      expectedProfit: ev - product.price,
      profitChance: profitChance(set, product),
      anyHitChance: 1 - Math.pow(missChance(set), packs),
      rarities: set.rarities.map((r) => ({
        name: r.name,
        oneIn: 1 / r.perPack,
        chance: atLeastOne(r.perPack, packs),
        expectedCount: r.perPack * packs,
        avgValue: r.avgValue,
      })),
    };
  }

  return { analyze };
})();
