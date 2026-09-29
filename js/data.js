// SAMPLE DATA — placeholder numbers only, not real pull rates or prices.
// Replace with sourced data later; the rest of the site reads this shape as-is.
//
// Each set:
//   bulkValuePerPack  value of the non-hit cards in one pack (commons, uncommons, regular rare)
//   rarities          "hit" outcomes. `perPack` is the chance a single pack contains that hit.
//                     Hits are treated as mutually exclusive per pack, so perPack values
//                     in a set must add up to 1 or less.
//   products          sealed products for the set, each with its pack count and price.

window.RIP_DATA = {
  sets: [
    {
      id: "sample-set-a",
      name: "Sample Set A",
      year: 2026,
      bulkValuePerPack: 0.6,
      rarities: [
        { name: "Double Rare", perPack: 1 / 5, avgValue: 1.5 },
        { name: "Ultra Rare", perPack: 1 / 15, avgValue: 4 },
        { name: "Illustration Rare", perPack: 1 / 12, avgValue: 6 },
        { name: "Special Illustration Rare", perPack: 1 / 85, avgValue: 45 },
        { name: "Hyper Rare", perPack: 1 / 150, avgValue: 25 },
      ],
      products: [
        { id: "pack", name: "Booster Pack", packs: 1, price: 4.99 },
        { id: "bundle", name: "Booster Bundle", packs: 6, price: 29.99 },
        { id: "etb", name: "Elite Trainer Box", packs: 9, price: 54.99 },
        { id: "box", name: "Booster Box", packs: 36, price: 159.99 },
      ],
    },
    {
      id: "sample-set-b",
      name: "Sample Set B",
      year: 2025,
      bulkValuePerPack: 0.5,
      rarities: [
        { name: "Double Rare", perPack: 1 / 6, avgValue: 2 },
        { name: "Ultra Rare", perPack: 1 / 16, avgValue: 5 },
        { name: "Illustration Rare", perPack: 1 / 13, avgValue: 8 },
        { name: "Special Illustration Rare", perPack: 1 / 90, avgValue: 70 },
        { name: "Hyper Rare", perPack: 1 / 140, avgValue: 20 },
      ],
      products: [
        { id: "pack", name: "Booster Pack", packs: 1, price: 5.49 },
        { id: "bundle", name: "Booster Bundle", packs: 6, price: 34.99 },
        { id: "etb", name: "Elite Trainer Box", packs: 9, price: 64.99 },
        { id: "box", name: "Booster Box", packs: 36, price: 189.99 },
      ],
    },
  ],
};
