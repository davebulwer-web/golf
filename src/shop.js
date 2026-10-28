// The pro shop: kit bought with your winnings. Each piece adds a little to one
// or two skills while it's in your bag, and wears out after a set number of
// rounds, so money keeps mattering. You carry one piece for each slot; better
// kit unlocks as you climb the tiers.

export const TIERS = ['club', 'county', 'challenge', 'tour', 'majors'];
export const TIER_NAMES = { club: 'CLUB', county: 'COUNTY', challenge: 'CHALLENGE TOUR', tour: 'TOUR', majors: 'MAJORS' };

export const SLOTS = [
  { key: 'driver', name: 'DRIVER' },
  { key: 'irons', name: 'IRONS' },
  { key: 'wedge', name: 'WEDGE' },
  { key: 'putter', name: 'PUTTER' },
  { key: 'balls', name: 'BALLS' },
];

// One piece per slot per tier. `boost` is added to the skills; `rounds` is how
// long it lasts.
export const KIT = [
  { id: 'driver-1', slot: 'driver', tier: 'club', name: 'THE THUMPER', price: 40, rounds: 10, boost: { power: 2 } },
  { id: 'irons-1', slot: 'irons', tier: 'club', name: 'TRUSTY BLADES', price: 45, rounds: 10, boost: { accuracy: 2 } },
  { id: 'wedge-1', slot: 'wedge', tier: 'club', name: 'SANDY WEDGE', price: 30, rounds: 10, boost: { shortGame: 1, recovery: 2 } },
  { id: 'putter-1', slot: 'putter', tier: 'club', name: 'OLD FAITHFUL', price: 35, rounds: 10, boost: { putting: 2 } },
  { id: 'balls-1', slot: 'balls', tier: 'club', name: 'SLEEVE OF NEW BALLS', price: 12, rounds: 3, boost: { power: 1, shortGame: 1 } },

  { id: 'driver-2', slot: 'driver', tier: 'county', name: 'BOOMSTICK 460', price: 120, rounds: 12, boost: { power: 4 } },
  { id: 'irons-2', slot: 'irons', tier: 'county', name: 'LASER IRONS', price: 140, rounds: 12, boost: { accuracy: 4 } },
  { id: 'wedge-2', slot: 'wedge', tier: 'county', name: 'BUNKER BUSTER', price: 90, rounds: 12, boost: { shortGame: 2, recovery: 3 } },
  { id: 'putter-2', slot: 'putter', tier: 'county', name: 'THE SNAKE CHARMER', price: 110, rounds: 12, boost: { putting: 4 } },
  { id: 'balls-2', slot: 'balls', tier: 'county', name: 'TOUR SPIN BALLS', price: 35, rounds: 3, boost: { power: 2, shortGame: 1 } },

  { id: 'driver-3', slot: 'driver', tier: 'challenge', name: 'SKY SPLITTER', price: 350, rounds: 12, boost: { power: 6 } },
  { id: 'irons-3', slot: 'irons', tier: 'challenge', name: 'FORGED PINSEEKERS', price: 400, rounds: 12, boost: { accuracy: 6 } },
  { id: 'wedge-3', slot: 'wedge', tier: 'challenge', name: 'SPIN DOCTOR', price: 260, rounds: 12, boost: { shortGame: 4, recovery: 4 } },
  { id: 'putter-3', slot: 'putter', tier: 'challenge', name: 'MALLET OF DOOM', price: 320, rounds: 12, boost: { putting: 6 } },
  { id: 'balls-3', slot: 'balls', tier: 'challenge', name: 'PRO V-NINE', price: 90, rounds: 3, boost: { power: 2, accuracy: 1, shortGame: 2 } },

  { id: 'driver-4', slot: 'driver', tier: 'tour', name: 'THE THUNDERCLAP', price: 1000, rounds: 15, boost: { power: 8 } },
  { id: 'irons-4', slot: 'irons', tier: 'tour', name: 'TOUR BLADES', price: 1200, rounds: 15, boost: { accuracy: 8 } },
  { id: 'wedge-4', slot: 'wedge', tier: 'tour', name: 'THE MAGICIAN', price: 800, rounds: 15, boost: { shortGame: 5, recovery: 6 } },
  { id: 'putter-4', slot: 'putter', tier: 'tour', name: 'GOLDEN GLIDE', price: 950, rounds: 15, boost: { putting: 8 } },
  { id: 'balls-4', slot: 'balls', tier: 'tour', name: 'MAJOR MARKS', price: 250, rounds: 3, boost: { power: 3, accuracy: 2, shortGame: 2 } },
];
export const kitItem = (id) => KIT.find((k) => k.id === id);

const tierAt = (tier) => Math.max(0, TIERS.indexOf(tier));
// The best piece for a slot you can buy at your tier, and the next one up (locked).
export const shopItem = (slot, tier) => KIT.filter((k) => k.slot === slot && tierAt(k.tier) <= tierAt(tier)).at(-1);
export const nextItem = (slot, tier) => KIT.find((k) => k.slot === slot && tierAt(k.tier) > tierAt(tier));

// What the kit in a bag ({ slot: { id, left } }) adds to each skill.
export function kitBoost(kit = {}) {
  const boost = { power: 0, accuracy: 0, shortGame: 0, recovery: 0, putting: 0 };
  for (const { id } of Object.values(kit)) for (const [k, v] of Object.entries(kitItem(id)?.boost ?? {})) boost[k] += v;
  return boost;
}

// A boost as words: "POWER +2, SHORT GAME +1".
export const boostWords = (boost, names) => Object.entries(boost).map(([k, v]) => `${names[k]} +${v}`).join(', ');
