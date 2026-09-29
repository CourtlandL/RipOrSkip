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

  // Monte Carlo estimate of how often opening `packs` packs beats `price`.
  function profitChance(set, packs, price, runs = 20000) {
    let wins = 0;
    for (let i = 0; i < runs; i++) {
      let value = 0;
      for (let p = 0; p < packs; p++) value += simulatePack(set);
      if (value > price) wins++;
    }
    return wins / runs;
  }

  // `price` defaults to the product's market price; pass one to use your own.
  // `runs` is the simulation size for the chance of profit.
  function analyze(set, product, price = product.price, runs = 20000) {
    const packs = product.packs;
    const ev = expectedValuePerPack(set) * packs;
    const noHitPerPack = set.rarities.reduce((prob, r) => prob * (1 - r.perPack), 1);
    return {
      packs,
      price,
      expectedValue: ev,
      expectedProfit: ev - price,
      valueRatio: price > 0 ? ev / price : Infinity,
      profitChance: profitChance(set, packs, price, runs),
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
