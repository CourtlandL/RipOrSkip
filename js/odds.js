// Odds math. Pure functions - no page code in here.
//
// Each rarity's perPack is the chance a single pack contains one, treated
// independently of the other rarities (so a pack can hold more than one hit).

window.RipOdds = (function () {
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

  // Value of one simulated pack: each hit rarity rolls separately, and a hit
  // is a random card of that rarity at its current market price.
  function simulatePack(set) {
    let value = set.bulkValuePerPack;
    for (const r of set.rarities) {
      if (Math.random() < r.perPack) {
        value += r.cards[Math.floor(Math.random() * r.cards.length)].price;
      }
    }
    return value;
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
    const noHitPerPack = set.rarities.reduce((prob, r) => prob * (1 - r.perPack), 1);
    return {
      packs,
      price: product.price,
      expectedValue: ev,
      expectedProfit: ev - product.price,
      profitChance: profitChance(set, product),
      anyHitChance: 1 - Math.pow(noHitPerPack, packs),
      rarities: set.rarities.map((r) => ({
        name: r.name,
        oneIn: 1 / r.perPack,
        chance: atLeastOne(r.perPack, packs),
        expectedCount: r.perPack * packs,
        avgValue: r.avgValue,
      })),
    };
  }

  // Most valuable cards in the set, with the chance of pulling each one.
  function chaseCards(set, product, limit = 5) {
    return set.rarities
      .flatMap((r) =>
        r.cards.map((c) => ({
          ...c,
          rarity: r.name,
          chance: atLeastOne(r.perPack / r.cards.length, product.packs),
        }))
      )
      .sort((a, b) => b.price - a.price)
      .slice(0, limit);
  }

  return { analyze, chaseCards };
})();
