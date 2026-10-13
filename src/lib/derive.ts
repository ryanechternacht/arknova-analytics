import type { ActionUse, GameAnalysis, MoneyFlow, Player, Turn, TurnStats } from './types';

// Categorical series colors (validated palette, fixed order by seat). Light / dark steps.
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500'];

export function seriesVar(p: Player): string {
  return `var(--series-${(p.order % 4) + 1})`;
}

export function actionLabel(a: ActionUse): string {
  const lvl = a.level === 2 ? 'II' : 'I';
  if (a.xToken) return `${a.action} ${lvl} → X-token`;
  return `${a.action} ${lvl} (${a.strength})`;
}

export function turnActionsLabel(t: Turn): string {
  return t.actions.map(actionLabel).join(' + ') || '—';
}

export function prettySource(s: string): string {
  if (!s) return 'Other';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function sortedFlow(f: MoneyFlow): [string, number][] {
  return Object.entries(f.bySource)
    .map(([k, v]) => [prettySource(k), v] as [string, number])
    .sort((a, b) => b[1] - a[1]);
}

export function cardsGained(s: TurnStats): number {
  return s.cardsDrawnDeck + s.cardsSnapped + s.cardsTakenInRange + s.cardsFromEffects;
}

// One row per completed turn for the score / money charts. x counts turns per player (Ark Nova
// convention): with 2 players, x = 12 means both have taken 12 turns; their turns sit at half steps.
export interface TurnPoint {
  x: number;
  label: string;
  turn: Turn | null;
  [playerId: string]: number | string | Turn | null;
}

export function scoreSeries(game: GameAnalysis, field: 'points' | 'score' | 'money' | 'appeal' | 'conservation'): TurnPoint[] {
  const first = game.turns[0];
  const points: TurnPoint[] = [];
  if (first) {
    const p: TurnPoint = { x: 0, label: 'Start', turn: null };
    for (const pl of game.players) p[pl.id] = first.before[pl.id]?.[field] ?? 0;
    points.push(p);
  }
  for (const t of game.turns) {
    const name = playerById(game, t.playerId)?.name ?? '';
    const p: TurnPoint = { x: turnX(game, t.index), label: `${name}'s turn ${t.playerTurnNumber}`, turn: t };
    for (const pl of game.players) p[pl.id] = t.after[pl.id]?.[field] ?? 0;
    points.push(p);
  }
  if (game.final && (field === 'score' || field === 'points')) {
    const p: TurnPoint = { x: turnX(game, game.turns.length), label: 'Final scoring', turn: null };
    for (const pl of game.players) p[pl.id] = game.final[pl.id]?.[field] ?? 0;
    points.push(p);
  }
  return points;
}

// Position on the per-player turn axis after the turn with this global index.
export function turnX(game: GameAnalysis, index: number): number {
  return (index + 1) / Math.max(1, game.players.length);
}

// Per-player turn counts, e.g. "31 turns each" or "31 / 30 turns".
export function turnCountLabel(game: GameAnalysis): string {
  const counts = game.players.map((p) => game.turns.filter((t) => t.playerId === p.id).length);
  return counts.every((c) => c === counts[0]) ? `${counts[0]} turns each` : `${counts.join(' / ')} turns`;
}

// Position (matching scoreSeries x) of the turn after which each break happened.
export function breakMarkers(game: GameAnalysis): { x: number; label: string }[] {
  return game.breaks.map((b) => {
    const lastTurn = game.turns.filter((t) => t.round === b.round).pop();
    return { x: lastTurn ? turnX(game, lastTurn.index) : 0, label: `Break ${b.index + 1}` };
  });
}

export interface RoundBar {
  round: string;
  [playerId: string]: number | string | null;
}

export function roundBars(
  game: GameAnalysis,
  pick: (pp: GameAnalysis['rounds'][number]['perPlayer'][string]) => number | null,
): RoundBar[] {
  return game.rounds.map((r) => {
    const row: RoundBar = { round: `Round ${r.round}` };
    for (const p of game.players) {
      const pp = r.perPlayer[p.id];
      row[p.id] = pp ? pick(pp) : null;
    }
    return row;
  });
}

export function pointsDelta(pp: GameAnalysis['rounds'][number]['perPlayer'][string]): number {
  return (pp.end?.points ?? 0) - (pp.start?.points ?? 0);
}

export function playerById(game: GameAnalysis, id: string | null): Player | undefined {
  return game.players.find((p) => p.id === id);
}

export function actionUsage(game: GameAnalysis, playerId: string) {
  const rows: Record<string, { action: string; uses: number; strengthSum: number; lvl2: number; xTokens: number }> = {};
  for (const t of game.turns) {
    if (t.playerId !== playerId) continue;
    for (const a of t.actions) {
      const r = (rows[a.action] ??= { action: a.action, uses: 0, strengthSum: 0, lvl2: 0, xTokens: 0 });
      if (a.xToken) {
        r.xTokens += 1;
        continue;
      }
      r.uses += 1;
      r.strengthSum += a.strength;
      if (a.level === 2) r.lvl2 += 1;
    }
  }
  return ['Animals', 'Build', 'Cards', 'Association', 'Sponsors']
    .map((k) => rows[k] ?? { action: k, uses: 0, strengthSum: 0, lvl2: 0, xTokens: 0 })
    .concat(Object.values(rows).filter((r) => !['Animals', 'Build', 'Cards', 'Association', 'Sponsors'].includes(r.action)));
}

export function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Points gained during final scoring (end-game cards etc.), after the last turn.
export function finalScoringPoints(game: GameAnalysis, playerId: string): number | null {
  const f = game.final?.[playerId];
  const last = game.turns[game.turns.length - 1]?.after[playerId];
  if (!f || !last) return null;
  return f.points - last.points;
}

export function pointsPerRoundBars(game: GameAnalysis): RoundBar[] {
  const rows = roundBars(game, pointsDelta);
  if (game.final) {
    const row: RoundBar = { round: 'Final scoring' };
    for (const p of game.players) row[p.id] = finalScoringPoints(game, p.id);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Tempo: how many points each of a player's own turns scored.

// A turn scoring at least this many points (appeal + 3 × CP) counts as a "big" turn.
export const BIG_TURN = 8;
// A turn scoring this many or fewer isn't a scoring move (e.g. a Build that adds one pavilion).
export const NON_SCORING_MAX = 1;

export type TurnKind = 'dead' | 'small' | 'big';

export function ownTurnPoints(t: Turn): number {
  return (t.after[t.playerId]?.points ?? 0) - (t.before[t.playerId]?.points ?? 0);
}

export function turnKind(t: Turn): TurnKind {
  const p = ownTurnPoints(t);
  if (p <= NON_SCORING_MAX) return 'dead';
  return p >= BIG_TURN ? 'big' : 'small';
}

export function isCardsOrBuild(t: Turn): boolean {
  return t.actions.some((a) => !a.xToken && (a.action === 'Cards' || a.action === 'Build'));
}

export const ACTIONS = ['Animals', 'Build', 'Cards', 'Association', 'Sponsors'] as const;

export const ACTION_ABBR: Record<string, string> = {
  Animals: 'Ani',
  Build: 'Bld',
  Cards: 'Crd',
  Association: 'Asc',
  Sponsors: 'Spn',
};

export function turnAbbr(t: Turn): string {
  if (!t.actions.length) return '?';
  return t.actions.map((a) => (a.xToken ? 'X' : (ACTION_ABBR[a.action] ?? a.action.slice(0, 3)))).join('+');
}

export interface TempoSummary {
  turns: number;
  points: number;
  perTurn: number;
  big: number;
  dead: number;
  cardsOrBuild: number;
  actionCounts: Record<string, number>;
  xTokens: number;
}

export function tempoSummary(turns: Turn[]): TempoSummary {
  const s: TempoSummary = { turns: turns.length, points: 0, perTurn: 0, big: 0, dead: 0, cardsOrBuild: 0, actionCounts: {}, xTokens: 0 };
  for (const t of turns) {
    s.points += ownTurnPoints(t);
    const k = turnKind(t);
    if (k === 'big') s.big += 1;
    if (k === 'dead') s.dead += 1;
    if (isCardsOrBuild(t)) s.cardsOrBuild += 1;
    for (const a of t.actions) {
      if (a.xToken) s.xTokens += 1;
      else s.actionCounts[a.action] = (s.actionCounts[a.action] ?? 0) + 1;
    }
  }
  s.perTurn = turns.length ? s.points / turns.length : 0;
  return s;
}

export function playerTurns(game: GameAnalysis, playerId: string, round?: number): Turn[] {
  return game.turns.filter((t) => t.playerId === playerId && (round == null || t.round === round));
}

// Rolling average of points per own turn (window of `window` turns), x = per-player turn number.
export function tempoSeries(game: GameAnalysis, window = 3): TurnPoint[] {
  const own = Object.fromEntries(game.players.map((p) => [p.id, playerTurns(game, p.id)]));
  const max = Math.max(0, ...Object.values(own).map((ts) => ts.length));
  const points: TurnPoint[] = [];
  for (let i = 0; i < max; i++) {
    const p: TurnPoint = { x: i + 1, label: `Turn ${i + 1} (avg of last ${window})`, turn: null };
    for (const pl of game.players) {
      const ts = own[pl.id];
      if (i >= ts.length) continue;
      const win = ts.slice(Math.max(0, i - window + 1), i + 1);
      p[pl.id] = Math.round((win.reduce((sum, t) => sum + ownTurnPoints(t), 0) / win.length) * 10) / 10;
    }
    points.push(p);
  }
  return points;
}

// Break markers on the per-player turn axis used by tempoSeries (break after turn n of the
// player who triggered it).
export function tempoBreakMarkers(game: GameAnalysis): { x: number; label: string }[] {
  return game.breaks.map((b) => {
    const last = game.turns.filter((t) => t.round === b.round).pop();
    return { x: last ? last.playerTurnNumber : 0, label: `Break ${b.index + 1}` };
  });
}

export function enclosureLabel(type: string): string {
  return (
    {
      'reptile-house': 'Reptile house',
      'large-bird-aviary': 'Bird aviary',
      'petting-zoo': 'Petting zoo',
      'small-aquarium': 'Small aquarium',
      'large-aquarium': 'Large aquarium',
      'underwater-tunnel': 'Underwater tunnel',
    }[type] ?? type
  );
}

export const STANDARD_BUILDINGS = /^(size-\d|kiosk|pavilion|small-aquarium|large-aquarium|reptile-house|large-bird-aviary|petting-zoo)$/;

export function buildingName(type: string): string {
  const m = type.match(/^size-(\d)$/);
  if (m) return `Enclosure ${m[1]}`;
  return type.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}


// Zoo map names (from BGA's MAPS_DATA). "a" maps are the alternate sides of 1–8.
const MAP_NAMES: Record<string, string> = {
  A: 'Beginner map',
  '0': 'Map 0',
  '1': 'Observation Tower',
  '2': 'Outdoor Areas',
  '3': 'Silver Lake',
  '4': 'Commercial Harbor',
  '5': 'Park Restaurant',
  '6': 'Research Institute',
  '7': 'Ice Cream Parlors',
  '8': 'Hollywood Hills',
  '9': 'Geographical Zoo',
  '10': 'Rescue Station',
  '11': 'Caves',
  '12': 'Artificial Intelligence',
  '13': 'Drawing Board',
  '14': 'Lagoon',
  T1: 'Tournament 1',
};

export function mapLabel(mapId: string | undefined): string | null {
  if (!mapId) return null;
  const base = mapId.replace(/a$/, '');
  const name = MAP_NAMES[mapId] ?? MAP_NAMES[base];
  if (mapId === 'A' || mapId === '0') return name ?? `Map ${mapId}`;
  return name ? `Map ${mapId} · ${name}` : `Map ${mapId}`;
}

// Action-card upgrades in order: which action, and on which of the player's turns (null if it
// happened outside a turn, e.g. a break bonus).
export interface UpgradeEvent {
  action: string;
  turn: number | null;
  round: number;
}

export function upgradeEvents(game: GameAnalysis, playerId: string): UpgradeEvent[] {
  const events: UpgradeEvent[] = [];
  for (const t of game.turns) {
    for (const action of t.stats[playerId]?.upgrades ?? []) {
      events.push({ action, turn: t.playerId === playerId ? t.playerTurnNumber : null, round: t.round });
    }
  }
  for (const b of game.breaks) {
    for (const action of b.stats[playerId]?.upgrades ?? []) events.push({ action, turn: null, round: b.round });
  }
  return events.sort((a, b) => a.round - b.round || (a.turn ?? 0) - (b.turn ?? 0));
}

export function upgradeLabel(e: UpgradeEvent): string {
  return `${ACTION_ABBR[e.action] ?? e.action} ${e.turn != null ? `T${e.turn}` : `R${e.round}`}`;
}
