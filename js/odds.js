// Odds math. Pure functions - no page code in here.
//
// A product is opened as a list of components: { set, packs, bonus } where
// `bonus` is optional guaranteed cards ([{ rarity, count }], e.g. a special
// Classic Collection pack). Most products are one component: N packs of one set.
//
// Each rarity's perPack is the chance a single pack contains one, treated
// independently of the other rarities (so a pack can hold more than one hit).

window.RipOdds = (function () {
  // Chance of at least one hit at `perDraw` odds across `draws` tries.
  function atLeastOne(perDraw, draws) {
    return 1 - Math.pow(1 - perDraw, draws);
  }

  function expectedValuePerPack(set) {
    return set.rarities.reduce(
      (sum, r) => sum + r.perPack * r.avgValue,
      set.bulkValuePerPack
    );
  }

  function bonusRarities(component) {
    return (component.bonus || []).map((b) => ({
      rarity: component.set.rarities.find((r) => r.name === b.rarity),
      count: b.count,
    }));
  }

  function randomCard(rarity) {
    return rarity.cards[Math.floor(Math.random() * rarity.cards.length)];
  }

  // Value of one simulated pack: each hit rarity rolls separately, and a hit
  // is a random card of that rarity at its current market price.
  function simulatePack(set) {
    let value = set.bulkValuePerPack;
    for (const r of set.rarities) {
      if (Math.random() < r.perPack) value += randomCard(r).price;
    }
    return value;
  }

  function simulateProduct(components) {
    let value = 0;
    for (const c of components) {
      for (let p = 0; p < c.packs; p++) value += simulatePack(c.set);
      for (const b of bonusRarities(c)) {
        for (let i = 0; i < b.count; i++) value += randomCard(b.rarity).price;
      }
    }
    return value;
  }

  // Monte Carlo estimate of how often opening the product beats `price`.
  function profitChance(components, price, runs) {
    let wins = 0;
    for (let i = 0; i < runs; i++) {
      if (simulateProduct(components) > price) wins++;
    }
    return wins / runs;
  }

  // `runs` is the simulation size for the chance of profit.
  function analyze(components, price, runs = 20000) {
    const multiSet = components.length > 1;
    const packs = components.reduce((sum, c) => sum + c.packs, 0);

    const ev = components.reduce(
      (sum, c) =>
        sum +
        expectedValuePerPack(c.set) * c.packs +
        bonusRarities(c).reduce((s, b) => s + b.count * b.rarity.avgValue, 0),
      0
    );

    // Guaranteed cards (bonus cards, 30th Celebration's Pikachu Rare) don't count as a "hit".
    const noHit = components.reduce(
      (prob, c) =>
        prob *
        Math.pow(
          c.set.rarities.filter((r) => r.perPack < 1).reduce((q, r) => q * (1 - r.perPack), 1),
          c.packs
        ),
      1
    );

    const rarities = components.flatMap((c) => {
      const bonus = bonusRarities(c);
      return c.set.rarities.map((r) => {
        const guaranteed = bonus.find((b) => b.rarity === r)?.count || 0;
        return {
          name: multiSet ? `${c.set.name} · ${r.name}` : r.name,
          oneIn: 1 / r.perPack,
          estimated: Boolean(r.estimated),
          packs: c.packs,
          chance: guaranteed ? 1 : atLeastOne(r.perPack, c.packs),
          expectedCount: r.perPack * c.packs + guaranteed,
          avgValue: r.avgValue,
        };
      });
    });

    return {
      packs,
      multiSet,
      price,
      expectedValue: ev,
      expectedProfit: ev - price,
      valueRatio: price > 0 ? ev / price : Infinity,
      profitChance: profitChance(components, price, runs),
      anyHitChance: 1 - noHit,
      rarities,
    };
  }

  // Most valuable cards across the product, with the chance of pulling each one.
  function chaseCards(components, limit = 5) {
    return components
      .flatMap((c) => {
        const bonus = bonusRarities(c);
        return c.set.rarities.flatMap((r) => {
          const bonusDraws = bonus.find((b) => b.rarity === r)?.count || 0;
          return r.cards.map((card) => {
            const miss =
              Math.pow(1 - r.perPack / r.cards.length, c.packs) *
              Math.pow(1 - 1 / r.cards.length, bonusDraws);
            return { ...card, rarity: r.name, set: c.set.name, chance: 1 - miss };
          });
        });
      })
      .sort((a, b) => b.price - a.price)
      .slice(0, limit);
  }

  return { analyze, chaseCards };
})();
