// Odds math. Pure functions - no page code in here.
//
// A product is opened as a list of components: { set, packs, bonus } where
// `bonus` is optional guaranteed cards ([{ rarity, count }], e.g. a special
// Classic Collection pack). Most products are one component: N packs of one set.
//
// Each rarity's perPack is the chance a single pack contains one. Rarities that
// share a pack slot (rarity.slot) are mutually exclusive: the slot is rolled once
// and holds at most one of them. Rarities without a slot roll independently.
//
// Valuation options ({ fees, bulk }) change what a card is worth to you:
//   fees  value cards at what you'd net selling them on TCGplayer, not market price
//   bulk  count the set's commons, uncommons, reverse holos and regular rares

window.RipOdds = (function () {
  // TCGplayer standard seller fees (2026): 10.75% commission (capped at $75) plus
  // 2.5% + $0.30 payment processing, plus shipping: a plain envelope under $50,
  // tracked above. A card worth less than the cost of selling it nets nothing.
  const COMMISSION = 0.1075;
  const COMMISSION_CAP = 75;
  const PROCESSING = 0.025;
  const PROCESSING_FLAT = 0.3;
  const SHIP_ENVELOPE = 1;
  const SHIP_TRACKED = 5;
  const TRACKED_OVER = 50;

  function netAfterFees(price) {
    const fees =
      Math.min(price * COMMISSION, COMMISSION_CAP) +
      price * PROCESSING +
      PROCESSING_FLAT +
      (price >= TRACKED_OVER ? SHIP_TRACKED : SHIP_ENVELOPE);
    return Math.max(0, price - fees);
  }

  const cardValue = (price, opts) => (opts.fees ? netAfterFees(price) : price);

  // Per-set, per-options cache of each rarity's average card value.
  const avgCache = new WeakMap();
  function avgValue(rarity, opts) {
    let byOpts = avgCache.get(rarity);
    if (!byOpts) avgCache.set(rarity, (byOpts = {}));
    const key = opts.fees ? "net" : "gross";
    return (byOpts[key] ??=
      rarity.cards.reduce((sum, c) => sum + cardValue(c.price, opts), 0) / rarity.cards.length);
  }

  // Rarities grouped into slot draws (one roll each) and independent rolls.
  const drawCache = new WeakMap();
  function draws(set) {
    let d = drawCache.get(set);
    if (!d) {
      const slots = {};
      const solo = [];
      for (const r of set.rarities) {
        if (r.slot) (slots[r.slot] ??= []).push(r);
        else solo.push(r);
      }
      d = { slots: Object.values(slots), solo };
      drawCache.set(set, d);
    }
    return d;
  }

  const bulkValue = (set, opts) => (opts.bulk ? set.bulkValuePerPack || 0 : 0);

  // Chance of at least one hit at `perDraw` odds across `draws` tries.
  function atLeastOne(perDraw, tries) {
    return 1 - Math.pow(1 - perDraw, tries);
  }

  function expectedValuePerPack(set, opts) {
    return set.rarities.reduce((sum, r) => sum + r.perPack * avgValue(r, opts), bulkValue(set, opts));
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

  // Value of one simulated pack: one roll per slot, one per independent rarity,
  // and a hit is a random card of that rarity.
  function simulatePack(set, opts) {
    const { slots, solo } = draws(set);
    let value = bulkValue(set, opts);
    for (const slot of slots) {
      let roll = Math.random();
      for (const r of slot) {
        if (roll < r.perPack) {
          value += cardValue(randomCard(r).price, opts);
          break;
        }
        roll -= r.perPack;
      }
    }
    for (const r of solo) {
      if (Math.random() < r.perPack) value += cardValue(randomCard(r).price, opts);
    }
    return value;
  }

  function simulateProduct(components, opts) {
    let value = 0;
    for (const c of components) {
      for (let p = 0; p < c.packs; p++) value += simulatePack(c.set, opts);
      for (const b of bonusRarities(c)) {
        for (let i = 0; i < b.count; i++) value += cardValue(randomCard(b.rarity).price, opts);
      }
    }
    return value;
  }

  // Monte Carlo estimate of how often opening the product beats `price`.
  function profitChance(components, price, runs, opts) {
    let wins = 0;
    for (let i = 0; i < runs; i++) {
      if (simulateProduct(components, opts) > price) wins++;
    }
    return wins / runs;
  }

  // Chance a pack has no hit. Guaranteed cards (Pikachu Rares) don't count as hits.
  function noHitPerPack(set) {
    const { slots, solo } = draws(set);
    const slotMiss = slots.reduce(
      (q, slot) => q * (1 - slot.filter((r) => r.perPack < 1).reduce((s, r) => s + r.perPack, 0)),
      1
    );
    return solo.filter((r) => r.perPack < 1).reduce((q, r) => q * (1 - r.perPack), slotMiss);
  }

  // `runs` is the simulation size for the chance of profit.
  function analyze(components, price, runs = 20000, opts = {}) {
    const multiSet = components.length > 1;
    const packs = components.reduce((sum, c) => sum + c.packs, 0);

    const ev = components.reduce(
      (sum, c) =>
        sum +
        expectedValuePerPack(c.set, opts) * c.packs +
        bonusRarities(c).reduce((s, b) => s + b.count * avgValue(b.rarity, opts), 0),
      0
    );

    const noHit = components.reduce((q, c) => q * Math.pow(noHitPerPack(c.set), c.packs), 1);

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
          avgValue: avgValue(r, opts),
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
      profitChance: profitChance(components, price, runs, opts),
      anyHitChance: 1 - noHit,
      rarities,
    };
  }

  // Chance of pulling one specific card: its rarity's rate split evenly across the tier.
  function cardChancePerPack(rarity) {
    return rarity.perPack / rarity.cards.length;
  }

  // Chance of a specific card across a product's packs and bonus cards.
  function cardChanceIn(components, set, rarity) {
    const miss = components
      .filter((c) => c.set === set)
      .reduce((q, c) => {
        const bonusDraws = bonusRarities(c).find((b) => b.rarity === rarity)?.count || 0;
        return q * Math.pow(1 - cardChancePerPack(rarity), c.packs) * Math.pow(1 - 1 / rarity.cards.length, bonusDraws);
      }, 1);
    return 1 - miss;
  }

  // Most valuable cards across the product, with the chance of pulling each one.
  function chaseCards(components, limit = 5) {
    const seen = new Set();
    return components
      .flatMap((c) =>
        c.set.rarities.flatMap((r) =>
          r.cards.map((card) => ({ ...card, rarity: r.name, set: c.set, rarityRef: r }))
        )
      )
      .filter((card) => !seen.has(card.productId) && seen.add(card.productId))
      .map((card) => ({ ...card, chance: cardChanceIn(components, card.set, card.rarityRef) }))
      .sort((a, b) => b.price - a.price)
      .slice(0, limit);
  }

  // Rip for a card or buy it? Ripping `packsToPull` packs (on average) at `packPrice`
  // also returns the value of everything else you pull along the way.
  function ripOrBuy(set, rarity, card, packPrice, opts = {}) {
    const perPack = cardChancePerPack(rarity);
    const packsToPull = 1 / perPack;
    const otherValuePerPack = expectedValuePerPack(set, opts) - perPack * cardValue(card.price, opts);
    const spend = packsToPull * packPrice;
    const netCost = spend - packsToPull * otherValuePerPack;
    const packsForPrice = Math.floor(card.price / packPrice);
    return {
      perPack,
      packsToPull,
      spend,
      otherValue: packsToPull * otherValuePerPack,
      netCost,
      packsForPrice,
      chanceForPrice: atLeastOne(perPack, packsForPrice),
      verdict: card.price <= netCost ? "buy" : "rip",
    };
  }

  return { analyze, chaseCards, cardChanceIn, cardChancePerPack, ripOrBuy, netAfterFees };
})();
