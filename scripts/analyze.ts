// Prints a text summary of a BGA Ark Nova game export.
// Usage: npx tsx scripts/analyze.ts path/to/arknova_<table>.json [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { analyze, normalizeInput } from '../src/lib/parse';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/analyze.ts <file.json> [--json out.json]');
  process.exit(1);
}
const game = analyze(normalizeInput(JSON.parse(readFileSync(file, 'utf8'))));

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag !== -1) {
  writeFileSync(process.argv[jsonFlag + 1], JSON.stringify(game, null, 2));
  process.exit(0);
}

const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
console.log(`Table ${game.table}: ${game.players.map((p) => p.name).join(' vs ')}`);
console.log(`Turns: ${game.turns.length}, breaks: ${game.breaks.length}, private info: ${game.hasPrivateInfo}`);

console.log('\nPer turn:');
for (const t of game.turns) {
  const b = t.before[t.playerId];
  const a = t.after[t.playerId];
  const st = t.stats[t.playerId];
  const acts = t.actions.map((x) => `${x.action}${x.level === 2 ? 'II' : 'I'}/${x.strength}`).join('+');
  const animals = st.animals.map((x) => x.name).join(', ');
  console.log(
    `R${t.round} #${String(t.index).padStart(2)} ${name(t.playerId).padEnd(16)} ${acts.padEnd(22)} score ${String(b.score).padStart(4)}→${String(a.score).padEnd(4)} (${a.score - b.score >= 0 ? '+' : ''}${a.score - b.score}) $${String(b.money).padStart(3)}→${String(a.money).padEnd(3)} +${st.moneyGained.total}/-${st.moneySpent.total} hand ${a.handSize}${animals ? '  animals: ' + animals : ''}`,
  );
}

console.log('\nRounds (break to break):');
for (const r of game.rounds) {
  for (const p of game.players) {
    const pp = r.perPlayer[p.id];
    if (!pp) continue;
    console.log(
      `R${r.round} ${p.name.padEnd(16)} turns ${pp.turnsTaken} score ${pp.start?.score}→${pp.end?.score} money in ${pp.start?.money} into break ${pp.moneyIntoBreak ?? '-'} income ${pp.breakIncome?.total ?? '-'} ${JSON.stringify(pp.breakIncome?.bySource ?? {})} spent ${pp.stats.moneySpent.total} drawn ${pp.stats.cardsDrawnDeck} snapped ${pp.stats.cardsSnapped} range ${pp.stats.cardsTakenInRange} discarded ${pp.stats.cardsDiscarded} sold ${pp.stats.cardsSold} animals ${pp.stats.animals.length}`,
    );
  }
}

console.log('\nTotals:');
for (const p of game.players) {
  const t = game.totals[p.id];
  console.log(
    `${p.name}: spent ${JSON.stringify(t.moneySpent)} gained ${JSON.stringify(t.moneyGained)}`,
  );
}
console.log('\nFinal:', JSON.stringify(game.final));
console.log('Hands:', JSON.stringify(game.hands));
console.log('Setup:', JSON.stringify(game.setup));
console.log('Warnings:', game.warnings);
console.log('Unhandled:', game.unhandledTypes);
