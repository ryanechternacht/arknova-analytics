// Builds src/data/cards.json from BGA's Ark Nova cardsData.js.
// Usage: node scripts/extract-cards.mjs path/to/cardsData.js
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'utf8');
// The file is `const CARDS_DATA = {...};const MAPS_DATA = {...};` on one line.
const start = src.indexOf('{');
const end = src.indexOf(';const MAPS_DATA');
const all = JSON.parse(src.slice(start, end));

const out = {};
for (const [id, c] of Object.entries(all)) {
  const slim = { name: c.name, type: c.type };
  if (c.cost != null) slim.cost = c.cost;
  if (c.level != null) slim.level = c.level;
  if (c.appeal) slim.appeal = c.appeal;
  if (c.conservation) slim.conservation = c.conservation;
  if (c.reputation) slim.reputation = c.reputation;
  if (c.enclosureSize != null) slim.size = c.enclosureSize;
  if (c.categories?.length) slim.categories = c.categories;
  if (c.continents?.length) slim.continents = c.continents;
  if (c.wave) slim.wave = true;
  // e.g. {"Jumping": 3, "Clever": null} -> ["Jumping 3", "Clever"]
  if (c.ability && typeof c.ability === 'object' && Object.keys(c.ability).length) {
    slim.abilities = Object.entries(c.ability).map(([k, v]) => (v == null || typeof v === 'object' ? k : `${k} ${v}`));
  }
  out[id] = slim;
}
writeFileSync('src/data/cards.json', JSON.stringify(out));
const types = {};
for (const c of Object.values(out)) types[c.type] = (types[c.type] || 0) + 1;
console.log(Object.keys(out).length, 'cards', types);
