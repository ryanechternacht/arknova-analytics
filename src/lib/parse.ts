import type {
  ActionUse,
  BgaNotification,
  BgaPacket,
  BreakSummary,
  CardRef,
  EnclosureSnapshot,
  FinalScore,
  GameAnalysis,
  LogLine,
  MoneyFlow,
  Player,
  PlayerState,
  RawGame,
  RawPlayerInfo,
  RoundSummary,
  TimelinePoint,
  Turn,
  TurnStats,
} from './types';
import { cardInfo, cardName } from './cards';

const FALLBACK_COLORS = ['#c028d3', '#1863a5', '#e0a800', '#2a9d4b'];
const STARTING_MONEY = 25;
const STARTING_REPUTATION = 1;

// Spaces in each special enclosure (BGA's cubesMap in Players.js).
const SPECIAL_CAPACITY: Record<string, number> = {
  'petting-zoo': 3,
  'reptile-house': 5,
  'large-bird-aviary': 5,
  'small-aquarium': 2,
  'large-aquarium': 5,
  'underwater-tunnel': 2,
};

// Standard enclosures printed on the map at setup (never "built" in the log). Map A is the
// beginner map; 13 is Drawing Board.
const STARTING_ENCLOSURES: Record<string, number[]> = {
  A: [3],
  '13': [2],
};

// Effects that draw several cards, keep some and discard the rest.
const DRAW_THEN_KEEP = /hunter effect|scavenging effect|scuba dive effect|perception effect/;

// BGA state ids from the Ark Nova game. 7 = next player, 98 = final scoring.
const STATE_NEXT_PLAYER = 7;
const STATE_FINAL_SCORING = 98;

// Notification types that never affect the analysis.
const IGNORED_TYPES = new Set([
  'updateReflexionTime',
  'wakeupPlayers',
  'gameStateMultipleActiveUpdate',
  'simpleNote',
  'simpleNode',
  'updateInitialActionCardSelection',
  'updateInitialActionCardsKeep',
  'updateInitialSelection',
  'updateBreakDiscardSelection',
  'fillPool',
  'discardCardsOnDisplay',
  'discardTokens',
  'addMeeples',
  'enableMultiplier',
  'markCard',
  'midmessage',
  'takeBonus',
  'pilfering',
  'pDrawCards',
  'pDiscardCards',
  'hypnosis',
  'wazaSpecial',
  'skipTurnOfPlayer',
  'reconstructionRemove',
  'reconstructionPlaceBack',
  'removeActionCards',
  'newUndoableStep',
  'updateInitialMapSelection',
  'clearTurn',
  'setupPlayer',
]);

// ---------------------------------------------------------------------------
// Input normalization

// Accepts any of: our exported file ({gamelogs, gamedatas|tableinfos}), the raw
// BGA logs.html response ({status, data: {logs}}), {logs: [...]}, or a bare packet array.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeInput(json: any): RawGame {
  let packets: BgaPacket[] | undefined;
  if (Array.isArray(json)) packets = json;
  else if (Array.isArray(json?.gamelogs)) packets = json.gamelogs;
  else if (Array.isArray(json?.data?.logs)) packets = json.data.logs;
  else if (Array.isArray(json?.logs)) packets = json.logs;
  if (!packets) throw new Error('Could not find a BGA game log in this file.');

  const players: RawPlayerInfo[] = [];
  const gdPlayers = json?.gamedatas?.players;
  if (gdPlayers && typeof gdPlayers === 'object') {
    for (const p of Object.values(gdPlayers) as Record<string, unknown>[]) {
      players.push({
        id: String(p.id),
        name: String(p.name ?? p.id),
        color: p.color ? `#${p.color}` : undefined,
      });
    }
  }
  const tiPlayers = json?.tableinfos?.result?.player;
  if (Array.isArray(tiPlayers)) {
    for (const p of tiPlayers) {
      const id = String(p.player_id);
      const existing = players.find((x) => x.id === id);
      const score = p.score != null ? Number(p.score) : undefined;
      if (existing) existing.score = score;
      else players.push({ id, name: p.name, score });
    }
  }

  const firstTable = packets.find((p) => p.table_id != null)?.table_id;
  return {
    table: json?.table != null ? Number(json.table) : firstTable != null ? Number(firstTable) : undefined,
    packets,
    players: players.length ? players : undefined,
  };
}

// ---------------------------------------------------------------------------
// Log formatting

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatLog(log: string, args: any): string {
  if (!log) return '';
  const text = log.replace(/\$\{(\w+)\}/g, (_, key: string) => {
    const v = args?.[key];
    if (v == null) return '';
    if (typeof v === 'object' && 'log' in v) return formatLog(v.log, v.args ?? {});
    return String(v);
  });
  return text
    .replace(/<([A-Z][A-Z_-]*):([^>]*)>/g, (_, icon: string, n: string) => `${n} ${icon.toLowerCase()}`)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Helpers

function emptyFlow(): MoneyFlow {
  return { total: 0, bySource: {} };
}

export function emptyStats(): TurnStats {
  return {
    cardsDrawnDeck: 0,
    cardsSnapped: 0,
    cardsTakenInRange: 0,
    displayCards: [],
    cardsFromEffects: 0,
    cardsDiscarded: 0,
    cardsSold: 0,
    cardsPouched: 0,
    animals: [],
    sponsors: [],
    buildings: [],
    projectsSupported: [],
    projectIds: [],
    partnerZoos: 0,
    partnerZooContinents: [],
    universities: 0,
    universityTypes: [],
    upgrades: [],
    xtokensGained: 0,
    xtokensSpent: 0,
    moneyGained: emptyFlow(),
    moneySpent: emptyFlow(),
    appealGained: 0,
    conservationGained: 0,
    reputationGained: 0,
    breakSpaces: 0,
    breakBySource: {},
    breaksTriggered: 0,
  };
}

function addFlow(into: MoneyFlow, from: MoneyFlow) {
  into.total += from.total;
  for (const [k, v] of Object.entries(from.bySource)) into.bySource[k] = (into.bySource[k] ?? 0) + v;
}

export function mergeStats(into: TurnStats, from: TurnStats) {
  into.cardsDrawnDeck += from.cardsDrawnDeck;
  into.cardsSnapped += from.cardsSnapped;
  into.cardsTakenInRange += from.cardsTakenInRange;
  into.displayCards.push(...from.displayCards);
  into.cardsFromEffects += from.cardsFromEffects;
  into.cardsDiscarded += from.cardsDiscarded;
  into.cardsSold += from.cardsSold;
  into.cardsPouched += from.cardsPouched;
  into.animals.push(...from.animals);
  into.sponsors.push(...from.sponsors);
  into.buildings.push(...from.buildings);
  into.projectsSupported.push(...from.projectsSupported);
  into.projectIds.push(...from.projectIds);
  into.partnerZooContinents.push(...from.partnerZooContinents);
  into.universityTypes.push(...from.universityTypes);
  into.partnerZoos += from.partnerZoos;
  into.universities += from.universities;
  into.upgrades.push(...from.upgrades);
  into.xtokensGained += from.xtokensGained;
  into.xtokensSpent += from.xtokensSpent;
  addFlow(into.moneyGained, from.moneyGained);
  addFlow(into.moneySpent, from.moneySpent);
  into.appealGained += from.appealGained;
  into.conservationGained += from.conservationGained;
  into.reputationGained += from.reputationGained;
  into.breakSpaces += from.breakSpaces;
  for (const [k, v] of Object.entries(from.breakBySource)) into.breakBySource[k] = (into.breakBySource[k] ?? 0) + v;
  into.breaksTriggered += from.breaksTriggered;
}

function cloneStates(states: Record<string, PlayerState>): Record<string, PlayerState> {
  const out: Record<string, PlayerState> = {};
  for (const [k, v] of Object.entries(states)) out[k] = { ...v, points: pointsFromScore(v.score, v.conservation) };
  return out;
}

// Points a player's conservation is worth on BGA's score (2 per CP up to 10, 3 after), offset so
// that score = appeal + conservationPoints(c), matching BGA's displayed score.
export function conservationPoints(c: number): number {
  return (c <= 10 ? 2 * c : 20 + 3 * (c - 10)) - 14;
}

// Our "points": appeal + 3 per conservation point. Derived from BGA's running score (which is
// authoritative) rather than our appeal tally: score = appeal + conservationPoints(c).
export function pointsFromScore(score: number, conservation: number): number {
  return score - conservationPoints(conservation) + 3 * conservation;
}

function moveOf(p: BgaPacket): number {
  return p.move_id != null ? Number(p.move_id) : NaN;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cardsOf(args: any): { id: string }[] {
  const c = args?.cards;
  if (Array.isArray(c)) return c;
  if (c && typeof c === 'object') return Object.values(c);
  return [];
}

function sourceLabel(n: BgaNotification): string {
  const a = n.args ?? {};
  if (a.card_name) return String(a.card_name);
  if (typeof a.source === 'string' && a.source.trim()) return a.source.replace(/^\s*from\s+/i, '').trim();
  return '';
}

// ---------------------------------------------------------------------------
// Main analysis

type Segment =
  | { kind: 'setup'; log: LogLine[] }
  | { kind: 'turn'; turn: Turn }
  | { kind: 'break'; brk: BreakSummary }
  | { kind: 'between'; log: LogLine[]; stats: Record<string, TurnStats> }
  | { kind: 'final'; log: LogLine[]; stats: Record<string, TurnStats> };

export function analyze(raw: RawGame): GameAnalysis {
  const warnings: string[] = [];
  const unhandledTypes: Record<string, number> = {};

  // Discover players in order of first appearance; prefer provided metadata.
  const players: Player[] = [];
  const addPlayer = (id: string, name?: string) => {
    if (!id || id === 'undefined' || id === 'null' || id === '0') return;
    let p = players.find((x) => x.id === id);
    if (!p) {
      const meta = raw.players?.find((x) => x.id === id);
      p = {
        id,
        name: meta?.name ?? name ?? id,
        color: meta?.color ?? FALLBACK_COLORS[players.length % FALLBACK_COLORS.length],
        order: players.length,
      };
      players.push(p);
    } else if (name && p.name === id) {
      p.name = name;
    }
  };
  // Seat order: setupActionCards / drawCards at setup list players in turn order.
  for (const pkt of raw.packets) {
    for (const n of pkt.data) {
      const a = n.args;
      if (a && typeof a === 'object' && !Array.isArray(a) && a.player_id != null && a.player_name) {
        addPlayer(String(a.player_id), String(a.player_name));
      }
    }
  }
  for (const p of raw.players ?? []) addPlayer(p.id, p.name);

  const states: Record<string, PlayerState> = {};
  for (const p of players) {
    states[p.id] = {
      points: 0,
      money: STARTING_MONEY,
      appeal: 0,
      conservation: 0,
      reputation: STARTING_REPUTATION,
      score: conservationPoints(0),
      xtokens: 0,
      income: null,
      handSize: 0,
      openEnclosures: 0,
    };
  }

  // ---- Maps: from setupPlayer when present, else from map-ability log text ("Map 13 quarter bonus").
  const maps: Record<string, string> = {};
  for (const pkt of raw.packets) {
    if (pkt.channel?.startsWith('/player/')) continue;
    for (const n of pkt.data) {
      const a = n.args;
      if (!a || typeof a !== 'object' || a.player_id == null) continue;
      const pid = String(a.player_id);
      if (n.type === 'setupPlayer' && a.mapId != null) maps[pid] = String(a.mapId);
      else if (!maps[pid]) {
        const m = formatLog(n.log ?? '', a).match(/\bMap (\w+)\b/);
        if (m) maps[pid] = m[1];
      }
    }
  }

  // ---- Buildings: track standard enclosures (empty/occupied) and special enclosures' animals.
  // Ids are unique per table. Enclosures that exist at setup are never "built" in the log, so seed
  // any building whose first appearance isn't its construction.
  interface TrackedBuilding {
    owner: string;
    type: string;
    size: number;
    occupied: boolean;
    // Spaces used, from BGA's building state (special enclosures hold several animals).
    used: number;
  }
  const buildings = new Map<string, TrackedBuilding>();
  {
    const built = new Set<string>();
    for (const pkt of raw.packets) {
      if (pkt.channel?.startsWith('/player/')) continue;
      for (const n of pkt.data) {
        const a = n.args;
        if (!a || typeof a !== 'object') continue;
        if (n.type === 'buyBuilding' && a.building?.id != null) built.add(String(a.building.id));
        if (n.type === 'increaseSize' && a.newBuilding?.id != null) built.add(String(a.newBuilding.id));
        if (n.type === 'buyAnimal' || n.type === 'moveAnimal' || n.type === 'releaseAnimal') {
          const refs = [...(Array.isArray(a.buildings) ? a.buildings : []), ...(a.building ? [a.building] : [])];
          for (const b of refs) {
            const id = b?.id != null ? String(b.id) : null;
            if (!id || built.has(id) || buildings.has(id)) continue;
            buildings.set(id, {
              owner: String(b.pId ?? a.player_id),
              type: String(b.type),
              size: Number(b.size ?? 0),
              occupied: false,
              used: 0,
            });
          }
        }
      }
    }
  }
  // Maps that start with an enclosure. If an animal ever moved in, it was seeded above with its
  // real id; otherwise add it here so an unused starting enclosure still shows as open.
  for (const [pid, mapId] of Object.entries(maps)) {
    for (const [i, size] of (STARTING_ENCLOSURES[mapId] ?? []).entries()) {
      const seeded = [...buildings.values()].some((b) => b.owner === pid && b.type === `size-${size}`);
      if (!seeded) {
        buildings.set(`start-${pid}-${i}`, { owner: pid, type: `size-${size}`, size, occupied: false, used: 0 });
      }
    }
  }

  const hands: Record<string, Map<string, string>> = {};
  const privateSeen = new Set<string>();
  const setup: GameAnalysis['setup'] = {
    log: [],
    actionCards: {},
    startingHand: {},
    keptHand: {},
    scoringCards: {},
  };

  const turns: Turn[] = [];
  const breaks: BreakSummary[] = [];
  const timeline: TimelinePoint[] = [];
  const turnCountByPlayer: Record<string, number> = {};
  let final: Record<string, FinalScore> | null = null;
  let endTriggeredBy: string | null = null;
  let concededBy: string | null = null;
  let lastTriggerSource: string | null = null;
  let breaksDone = 0;
  let initialScoresApplied = false;
  let seq = 0;

  // Widened so TS doesn't narrow it; closures below reassign it.
  let seg = { kind: 'setup', log: setup.log } as Segment;
  const finalSeg: Extract<Segment, { kind: 'final' }> = { kind: 'final', log: [], stats: {} };
  const betweenStats: Record<string, TurnStats> = {};

  // Copies every player's state, refreshing derived fields first.
  const snapshot = (): Record<string, PlayerState> => {
    for (const p of players) {
      if (states[p.id]) states[p.id].openEnclosures = enclosureSnapshot(p.id).open.length;
    }
    return cloneStates(states);
  };

  const pushTimeline = (move: number) => {
    timeline.push({
      seq: seq++,
      move,
      turnIndex: seg.kind === 'turn' ? seg.turn.index : null,
      round: breaksDone + 1,
      state: snapshot(),
    });
  };

  const closeSegment = (move: number) => {
    if (seg.kind === 'turn') {
      seg.turn.after = snapshot();
      seg.turn.moveEnd = move;
      pushTimeline(move);
    } else if (seg.kind === 'break') {
      seg.brk.after = snapshot();
      pushTimeline(move);
    }
  };

  const segStats = (pid: string): TurnStats => {
    let bucket: Record<string, TurnStats>;
    if (seg.kind === 'turn') bucket = seg.turn.stats;
    else if (seg.kind === 'break') bucket = seg.brk.stats;
    else if (seg.kind === 'final') bucket = seg.stats;
    else if (seg.kind === 'between') bucket = seg.stats;
    else bucket = betweenStats;
    return (bucket[pid] ??= emptyStats());
  };

  const isStandard = (type: string) => /^size-\d$/.test(type);
  const isSpecialEnclosure = (type: string) => type in SPECIAL_CAPACITY;

  const enclosureSnapshot = (pid: string): EnclosureSnapshot => {
    const snap: EnclosureSnapshot = { open: [], filled: 0, special: [] };
    for (const b of buildings.values()) {
      if (b.owner !== pid) continue;
      if (isStandard(b.type)) {
        if (b.occupied) snap.filled += 1;
        else snap.open.push(b.size);
      } else if (isSpecialEnclosure(b.type)) {
        snap.special.push({ type: b.type, used: b.used, capacity: SPECIAL_CAPACITY[b.type] });
      }
    }
    snap.open.sort((x, y) => x - y);
    return snap;
  };
  const allEnclosures = (): Record<string, EnclosureSnapshot> =>
    Object.fromEntries(players.map((p) => [p.id, enclosureSnapshot(p.id)]));
  const enclosuresAtRoundStart: GameAnalysis['enclosuresAtRoundStart'] = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertBuilding = (b: any, pid: string | null): TrackedBuilding | null => {
    if (!b || b.id == null) return null;
    const id = String(b.id);
    let t = buildings.get(id);
    if (!t) {
      t = { owner: String(b.pId ?? pid), type: String(b.type), size: Number(b.size ?? 0), occupied: false, used: 0 };
      buildings.set(id, t);
    }
    if (b.type) t.type = String(b.type);
    if (b.size != null) t.size = Number(b.size);
    if (b.state != null) {
      t.used = Number(b.state) || 0;
      t.occupied = t.used > 0;
    }
    return t;
  };

  const segLog = (): LogLine[] =>
    seg.kind === 'turn' ? seg.turn.log : seg.kind === 'break' ? seg.brk.log : seg.log;

  const startTurn = (pid: string, move: number) => {
    closeSegment(move);
    if (!turns.length) enclosuresAtRoundStart[1] = allEnclosures();
    addPlayer(pid);
    turnCountByPlayer[pid] = (turnCountByPlayer[pid] ?? 0) + 1;
    const turn: Turn = {
      index: turns.length,
      playerId: pid,
      playerTurnNumber: turnCountByPlayer[pid],
      round: breaksDone + 1,
      moveStart: move,
      moveEnd: move,
      actions: [],
      before: snapshot(),
      after: snapshot(),
      stats: { [pid]: emptyStats() },
      log: [],
      endTriggered: false,
    };
    turns.push(turn);
    seg = { kind: 'turn', turn };
  };

  const currentAction = (): ActionUse | undefined =>
    seg.kind === 'turn' ? seg.turn.actions[seg.turn.actions.length - 1] : undefined;

  // What caused a break-token advance, from the action being taken.
  const breakSource = (pid: string): string => {
    const act = currentAction();
    if (!act || seg.kind !== 'turn') return 'Other';
    if (act.action === 'Cards') return 'Cards action';
    if (act.action === 'Sponsors') return 'Sponsors break';
    if (act.action === 'Animals') {
      // Usually an animal ability like Jumping; take the latest animal with a break ability.
      const animals = segStats(pid).animals;
      for (let i = animals.length - 1; i >= 0; i--) {
        const ability = cardInfo(animals[i].id)?.abilities?.find((x) => /^(Jumping|Sprint)/.test(x));
        if (ability) return `${ability} (${animals[i].name})`;
      }
      return 'Animals';
    }
    return act.action;
  };

  const gainMoney = (pid: string, amount: number, source: string) => {
    if (!states[pid] || !amount) return;
    states[pid].money += amount;
    const st = segStats(pid);
    const flow = amount > 0 ? st.moneyGained : st.moneySpent;
    const v = Math.abs(amount);
    flow.total += v;
    flow.bySource[source] = (flow.bySource[source] ?? 0) + v;
  };

  const checkMoney = (pid: string, total: unknown, move: number) => {
    if (total == null || !states[pid]) return;
    const t = Number(total);
    if (states[pid].money !== t) {
      warnings.push(
        `Move ${move}: money for ${players.find((p) => p.id === pid)?.name ?? pid} computed ${states[pid].money}, BGA says ${t}. Resynced.`,
      );
      states[pid].money = t;
    }
  };

  const handAdd = (pid: string, cards: { id: string }[]) => {
    const h = (hands[pid] ??= new Map());
    for (const c of cards) h.set(c.id, cardName(c.id));
  };
  const handRemove = (pid: string, ids: string[]) => {
    const h = hands[pid];
    if (!h) return;
    for (const id of ids) h.delete(id);
  };
  const handCount = (pid: string, delta: number) => {
    const s = states[pid];
    if (s && s.handSize != null) s.handSize += delta;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyInfos = (infos: any) => {
    if (!infos || typeof infos !== 'object') return;
    for (const [pid, v] of Object.entries(infos.score ?? {})) {
      if (states[pid]) states[pid].score = Number(v);
    }
    for (const [pid, v] of Object.entries(infos.income ?? {})) {
      if (states[pid]) states[pid].income = Number(v);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyBonuses = (pid: string, bonuses: any, source: string) => {
    if (!bonuses || typeof bonuses !== 'object' || !states[pid]) return;
    const s = states[pid];
    const st = segStats(pid);
    for (const [k, raw] of Object.entries(bonuses)) {
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      if (k === 'money') gainMoney(pid, v, source);
      else if (k === 'appeal') {
        s.appeal += v;
        st.appealGained += v;
      } else if (k === 'conservation') {
        s.conservation += v;
        st.conservationGained += v;
      } else if (k === 'reputation') {
        s.reputation += v;
        st.reputationGained += v;
      } else if (k === 'xtoken') {
        s.xtokens += v;
        if (v > 0) st.xtokensGained += v;
        else st.xtokensSpent -= v;
      }
    }
  };

  // Undo: BGA sends clearTurn with the uids of the notifications being taken back. Skip them.
  const undone = new Set<string>();
  let undoCount = 0;
  for (const pkt of raw.packets) {
    for (const n of pkt.data) {
      if (n.type === 'clearTurn' && Array.isArray(n.args?.notifIds)) {
        undoCount += 1;
        for (const id of n.args.notifIds) undone.add(String(id));
      }
    }
  }

  for (const pkt of raw.packets) {
    const move = moveOf(pkt);
    const isPrivate = pkt.channel?.startsWith('/player/');
    const channelPid = isPrivate ? pkt.channel.replace(/^\/player\/p/, '') : null;

    for (const n of pkt.data) {
      if (n.uid && undone.has(n.uid)) continue;
      const a = n.args ?? {};
      const pid = a.player_id != null ? String(a.player_id) : null;
      const tpl = n.log ?? '';

      // ---- Private channel: card names in hand ------------------------------------------
      if (isPrivate) {
        if (n.type === 'pDrawCards' && pid) {
          privateSeen.add(pid);
          const cards = cardsOf(a);
          const toHand = cards.filter((c) => (c as { location?: string }).location !== 'scoringHand');
          const toScoring = cards.filter((c) => (c as { location?: string }).location === 'scoringHand');
          handAdd(pid, toHand);
          if (seg.kind === 'setup') {
            if (toHand.length) setup.startingHand[pid] = toHand.map((c) => ({ id: c.id, name: cardName(c.id) }));
            if (toScoring.length)
              setup.scoringCards[pid] = toScoring.map((c) => ({ id: c.id, name: cardName(c.id) }));
          } else if (toScoring.length) {
            (setup.scoringCards[pid] ??= []).push(...toScoring.map((c) => ({ id: c.id, name: cardName(c.id) })));
          }
        } else if (n.type === 'pDiscardCards' && pid) {
          privateSeen.add(pid);
          handRemove(
            pid,
            cardsOf(a).map((c) => c.id),
          );
          if (/scoring card/.test(tpl) || /adapt effect/.test(tpl)) {
            const gone = new Set(cardsOf(a).map((c) => c.id));
            if (setup.scoringCards[pid]) setup.scoringCards[pid] = setup.scoringCards[pid].filter((c) => !gone.has(c.id));
          }
          if (seg.kind === 'setup' && /initial|^You discard \$\{card_names\}$/.test(tpl) && hands[pid]) {
            setup.keptHand[pid] = [...hands[pid].entries()].map(([id, name]) => ({ id, name }));
          }
        } else if ((n.type === 'pStoreCard' || n.type === 'pUnstoreCard') && channelPid) {
          // Map 11: cards stored under the map leave the hand until taken back.
          const ids = cardsOf(a).map((c) => c.id);
          if (n.type === 'pStoreCard') handRemove(channelPid, ids);
          else handAdd(channelPid, cardsOf(a));
        } else if (n.type === 'refreshHand' && pid && Array.isArray(a.hand)) {
          hands[pid] = new Map(a.hand.map((c: { id: string }) => [c.id, cardName(c.id)]));
        }
        continue;
      }

      // ---- Segment transitions -----------------------------------------------------------
      if (n.type === 'gameStateChange') {
        if (a.id === STATE_NEXT_PLAYER && a.active_player != null && seg.kind !== 'break') {
          startTurn(String(a.active_player), move);
        } else if (a.id === STATE_FINAL_SCORING && seg.kind !== 'final') {
          closeSegment(move);
          seg = finalSeg;
        }
        continue;
      }

      if (n.type === 'chooseActionCard' && pid && (seg.kind !== 'turn' || seg.turn.playerId !== pid)) {
        // Fallback in case state ids differ between game versions.
        startTurn(pid, move);
      }
      if (n.type === 'startBreak') {
        closeSegment(move);
        const brk: BreakSummary = {
          index: breaks.length,
          round: breaksDone + 1,
          moveStart: move,
          triggeredBy: turns.length ? turns[turns.length - 1].playerId : null,
          triggerSource: lastTriggerSource,
          before: snapshot(),
          after: snapshot(),
          stats: {},
          log: [],
        };
        breaks.push(brk);
        seg = { kind: 'break', brk };
      }
      if (n.type === 'finalScoring' && seg.kind !== 'final') {
        closeSegment(move);
        seg = finalSeg;
      }

      // ---- Log line ----------------------------------------------------------------------
      const text = formatLog(tpl, a);

      if (text) segLog().push({ move, playerId: pid, text, type: n.type });

      // ---- Effects -----------------------------------------------------------------------
      if (a.infos) applyInfos(a.infos);

      switch (n.type) {
        case 'midmessage': {
          if (!initialScoresApplied && a.infos?.score) {
            // Initial scores tell us each player's starting appeal (later seats start higher).
            for (const [p, v] of Object.entries(a.infos.score)) {
              if (states[p]) states[p].appeal = Number(v) - conservationPoints(0);
            }
            initialScoresApplied = true;
            pushTimeline(move);
          }
          break;
        }
        case 'refreshUI': {
          // Sent after an undo: authoritative player state, so resync to it.
          const ps = a.datas?.players;
          if (ps && typeof ps === 'object') {
            for (const p of Object.values(ps) as Record<string, unknown>[]) {
              const st = states[String(p.id)];
              if (!st) continue;
              if (p.money != null) st.money = Number(p.money);
              if (p.appeal != null) st.appeal = Number(p.appeal);
              if (p.conservation != null) st.conservation = Number(p.conservation);
              if (p.reputation != null) st.reputation = Number(p.reputation);
              if (p.newScore != null) st.score = Number(p.newScore);
              else if (p.score != null) st.score = Number(p.score);
              if (p.handCount != null && st.handSize != null) st.handSize = Number(p.handCount);
            }
          }
          break;
        }
        case 'setupActionCards': {
          if (pid && Array.isArray(a.action_cards)) {
            setup.actionCards[pid] = a.action_cards.map(
              (c: { name?: string; type?: string }) => c.name ?? c.type ?? '?',
            );
          }
          break;
        }
        case 'chooseActionCard': {
          if (seg.kind === 'turn') {
            seg.turn.actions.push({
              action: a.action_card_type ?? a.action_card_name ?? a.actionCard?.type ?? '?',
              level: a.action_card_level === 'II' || a.actionCard?.level === 2 ? 2 : 1,
              strength: Number(a.strength ?? a.actionCard?.strength ?? 0),
              cardType: a.actionCard?.type ?? '',
            });
          }
          break;
        }
        case 'getBonuses':
        case 'gainMarked':
        case 'cutDown': {
          if (!pid) break;
          let source = sourceLabel(n);
          if (n.type === 'cutDown') {
            source = 'Cut Down';
            if (a.buildingId != null) buildings.delete(String(a.buildingId));
          }
          if (n.type === 'gainMarked') source = 'Mark';
          if (!source) {
            const act = currentAction();
            source = act?.action === 'Sponsors' ? 'Sponsors break' : 'Other bonus';
          }
          if (/^pays/.test(tpl) && /sponsor/i.test(source)) source = 'Sponsors';
          applyBonuses(pid, a.bonuses, source);
          if (a.score != null && states[pid]) states[pid].score = Number(a.score);
          break;
        }
        case 'donation': {
          if (!pid) break;
          applyBonuses(pid, a.bonuses, 'Donation');
          applyBonuses(pid, a.bonuses2, 'Donation');
          if (a.score != null && states[pid]) states[pid].score = Number(a.score);
          break;
        }
        case 'releaseAnimal': {
          // The bonuses here are what the player loses.
          if (!pid) break;
          for (const b of Array.isArray(a.buildings) ? a.buildings : []) upsertBuilding(b, pid);
          const lost: Record<string, number> = {};
          for (const [k, v] of Object.entries(a.bonuses ?? {})) lost[k] = -Number(v);
          applyBonuses(pid, lost, 'Released animal');
          if (a.score != null && states[pid]) states[pid].score = Number(a.score);
          break;
        }
        case 'storeCard':
          if (pid) handCount(pid, -1);
          break;
        case 'unstoreCard':
          if (pid) handCount(pid, 1);
          break;
        case 'pilferingCard': {
          const to = a.player_id2 != null ? String(a.player_id2) : null;
          if (pid) handCount(pid, -1);
          if (to) {
            handCount(to, 1);
            segStats(to).cardsFromEffects += 1;
          }
          break;
        }
        case 'pilferingMoney': {
          const from = pid;
          const to = a.player_id2 != null ? String(a.player_id2) : null;
          const amt = Number(a.bonuses?.money ?? 0);
          if (from && to && amt) {
            gainMoney(from, -amt, 'Pilfered');
            gainMoney(to, amt, 'Pilfering');
          }
          break;
        }
        case 'buyAnimal': {
          if (!pid) break;
          const id = a.card?.id ?? a.card_id;
          const cost = Number(a.amount_money ?? 0);
          for (const b of Array.isArray(a.buildings) ? a.buildings : []) upsertBuilding(b, pid);
          gainMoney(pid, -cost, 'Animals');
          checkMoney(pid, a.total, move);
          const info = cardInfo(id);
          segStats(pid).animals.push({
            id,
            name: a.card_name ?? cardName(id),
            cost,
            fromDisplay: !!a.fromDisplay,
            appeal: info?.appeal,
            categories: info?.categories,
            continents: info?.continents,
            size: info?.size,
          });
          if (!a.fromDisplay) {
            handRemove(pid, [id]);
            handCount(pid, -1);
          }
          break;
        }
        case 'buyBuilding': {
          if (!pid) break;
          const cost = Number(a.amount_money ?? 0);
          gainMoney(pid, -cost, 'Buildings');
          checkMoney(pid, a.total, move);
          const b = a.building ?? {};
          segStats(pid).buildings.push({ type: String(b.type ?? '?'), size: Number(b.size ?? 0), cost });
          upsertBuilding(b, pid);
          break;
        }
        case 'playSponsor': {
          if (!pid) break;
          const id = a.card?.id ?? a.card_id;
          segStats(pid).sponsors.push({ id, name: a.card_name ?? cardName(id), fromDisplay: !!a.fromDisplay });
          if (!a.fromDisplay) {
            handRemove(pid, [id]);
            handCount(pid, -1);
          }
          break;
        }
        case 'moveProjects': {
          if (!pid) break;
          for (const c of cardsOf(a)) {
            if (!a.fromDisplay) {
              handRemove(pid, [c.id]);
              handCount(pid, -1);
            }
          }
          break;
        }
        case 'drawCards': {
          if (!pid) break;
          if (/scoring card/.test(tpl)) break;
          const k = Number(a.n ?? 1);
          if (seg.kind === 'setup') {
            handCount(pid, k);
            break;
          }
          const st = segStats(pid);
          if (/keeps 1 card with Assertion/.test(tpl)) {
            handCount(pid, 1);
            st.cardsFromEffects += 1;
          } else if (/from the deck$/.test(tpl)) {
            // The Cards action (and anything else that just draws from the deck).
            handCount(pid, k);
            st.cardsDrawnDeck += k;
          } else if (DRAW_THEN_KEEP.test(tpl)) {
            // Hunter, Scavenging, Scuba Dive, Perception: kept cards are counted when the rest are discarded.
            handCount(pid, k);
          } else {
            // Sprint, Monkey Gang, university searches, Dominance, Horse Whisperer, ...
            handCount(pid, k);
            st.cardsFromEffects += k;
          }
          break;
        }
        case 'discardCards': {
          if (!pid) break;
          if (/scoring card/.test(tpl)) break;
          const k = Number(a.n ?? (tpl.match(/discards (\d+)/)?.[1] ?? 1));
          handCount(pid, -k);
          if (seg.kind === 'setup') break;
          const st = segStats(pid);
          if (DRAW_THEN_KEEP.test(tpl)) st.cardsFromEffects += Number(a.m ?? 1);
          else if (/^\$\{player_name\} sells/.test(tpl)) {
            st.cardsSold += k;
            applyBonuses(pid, a.bonuses, 'Sold cards');
          } else if (/pouches/.test(tpl)) {
            st.cardsPouched += k;
            applyBonuses(pid, a.bonuses, 'Pouch');
          } else {
            st.cardsDiscarded += k;
            applyBonuses(pid, a.bonuses, 'Card effect');
          }
          break;
        }
        case 'snapCard': {
          if (!pid) break;
          const cards = cardsOf(a);
          handAdd(pid, cards);
          handCount(pid, cards.length);
          const st = segStats(pid);
          if (/snaps/.test(tpl)) st.cardsSnapped += cards.length;
          else st.cardsTakenInRange += cards.length;
          st.displayCards.push(...cards.map((c) => ({ id: c.id, name: cardName(c.id) })));
          break;
        }
        case 'moveAnimal': {
          for (const b of Array.isArray(a.buildings) ? a.buildings : []) upsertBuilding(b, pid);
          upsertBuilding(a.building, pid);
          break;
        }
        case 'increaseSize': {
          const old = a.building?.id != null ? buildings.get(String(a.building.id)) : undefined;
          if (a.building?.id != null) buildings.delete(String(a.building.id));
          const t = upsertBuilding(a.newBuilding, pid);
          if (t && old && a.newBuilding?.state == null) {
            t.used = old.used;
            t.occupied = old.occupied;
          }
          break;
        }
        case 'advanceBreak': {
          if (!pid) break;
          const spaces = Number(a.n ?? 0);
          const src = breakSource(pid);
          const st = segStats(pid);
          st.breakSpaces += spaces;
          st.breakBySource[src] = (st.breakBySource[src] ?? 0) + spaces;
          if (/last space/.test(tpl)) {
            st.breaksTriggered += 1;
            lastTriggerSource = src;
          }
          break;
        }
        case 'playerConcedeGame':
          concededBy = pid;
          break;
        case 'sponsorMagnet':
        case 'markAssign': {
          if (!pid) break;
          const cards = cardsOf(a);
          handAdd(pid, cards);
          handCount(pid, cards.length);
          segStats(pid).cardsFromEffects += cards.length;
          break;
        }
        case 'slideMeeples': {
          // The token taken arrives in a follow-up slideMeeples with no log text or player_id:
          // partner-Africa, fac-science-rep... Its owner is the meeple's pId.
          for (const m of Array.isArray(a.meeples) ? a.meeples : []) {
            const owner = m?.pId != null ? String(m.pId) : null;
            if (!owner || !states[owner]) continue;
            if (/^partner-/.test(String(m.type)) && /^partner_/.test(String(m.location))) {
              segStats(owner).partnerZooContinents.push(String(m.type).replace(/^partner-/, ''));
            } else if (/^fac-/.test(String(m.type)) && /^university_/.test(String(m.location))) {
              segStats(owner).universityTypes.push(String(m.type));
            }
          }
          if (!pid) break;
          const st = segStats(pid);
          if (/supports a conservation project/.test(tpl)) {
            st.projectsSupported.push(String(a.card_name ?? '?'));
            if (a.card_id) st.projectIds.push(String(a.card_id));
          }
          else if (/new Partner zoo/.test(tpl)) st.partnerZoos += 1;
          else if (/new university/.test(tpl)) st.universities += 1;
          break;
        }
        case 'upgradeCard': {
          if (pid) segStats(pid).upgrades.push(String(a.action_card_name ?? a.actionCard?.type ?? '?'));
          break;
        }
        case 'endOfGame': {
          endTriggeredBy = pid;
          if (seg.kind === 'turn') seg.turn.endTriggered = true;
          break;
        }
        case 'finishBreak': {
          closeSegment(move);
          breaksDone += 1;
          enclosuresAtRoundStart[breaksDone + 1] = allEnclosures();
          seg = { kind: 'between', log: [], stats: {} };
          break;
        }
        case 'finalScoring': {
          if (!pid) break;
          final ??= {};
          final[pid] = {
            points: Number(a.appeal) + 3 * Number(a.conservation),
            appeal: Number(a.appeal),
            conservation: Number(a.conservation),
            conservationScore: Number(a.conservationScore),
            score: Number(a.newScore ?? a.score),
            scoringCards: (a.scoringHand ?? []).map((c: { id: string }) => ({ id: c.id, name: cardName(c.id) })),
          };
          if (states[pid]) states[pid].score = final[pid].score;
          break;
        }
        case 'actionCardCleanup': {
          // A turn that finishes without choosing an action used the card for an X-token.
          if (seg.kind === 'turn' && pid === seg.turn.playerId && !seg.turn.actions.length && /finishing action/.test(tpl)) {
            seg.turn.actions.push({
              action: a.action_card_type ?? a.action_card_name ?? '?',
              level: a.actionCard?.level === 2 ? 2 : 1,
              strength: 0,
              cardType: a.actionCard?.type ?? '',
              xToken: true,
            });
          }
          break;
        }
        case 'startBreak':
          break;
        default:
          if (!IGNORED_TYPES.has(n.type)) unhandledTypes[n.type] = (unhandledTypes[n.type] ?? 0) + 1;
      }
      // Most scoring notifications carry the player's new BGA score.
      if (pid && a.score != null && n.type !== 'finalScoring' && states[pid] && Number.isFinite(Number(a.score))) {
        states[pid].score = Number(a.score);
      }
    }
  }
  closeSegment(Number.isFinite(timeline[timeline.length - 1]?.move) ? timeline[timeline.length - 1].move : 0);
  pushTimeline(timeline.length ? timeline[timeline.length - 1].move : 0);

  // Hands: only reliable when we saw the private channel for that player.
  const handOut: Record<string, CardRef[]> = {};
  for (const p of players) {
    if (privateSeen.has(p.id) && hands[p.id]) {
      // Not cross-checked against handSize: BGA replays themselves are sometimes off on hand size.
      handOut[p.id] = [...hands[p.id].entries()].map(([id, name]) => ({ id, name }));
    }
  }

  // Cross-check final scoring against our running totals.
  if (final) {
    for (const p of players) {
      const f = final[p.id];
      const s = states[p.id];
      if (!f || !s) continue;
      if (f.appeal !== s.appeal) warnings.push(`${p.name}: final appeal ${f.appeal}, computed ${s.appeal}.`);
      if (f.conservation !== s.conservation)
        warnings.push(`${p.name}: final conservation ${f.conservation}, computed ${s.conservation}.`);
    }
  }

  // Totals per player across the game (turns + breaks + final).
  const totals: Record<string, TurnStats> = {};
  for (const p of players) totals[p.id] = emptyStats();
  for (const t of turns) for (const [pid, st] of Object.entries(t.stats)) if (totals[pid]) mergeStats(totals[pid], st);
  for (const b of breaks) for (const [pid, st] of Object.entries(b.stats)) if (totals[pid]) mergeStats(totals[pid], st);
  for (const [pid, st] of Object.entries(finalSeg.stats)) if (totals[pid]) mergeStats(totals[pid], st);

  const rounds = buildRounds(players, turns, breaks, timeline);

  return {
    table: raw.table ?? null,
    players,
    turns,
    breaks,
    rounds,
    setup,
    final,
    endTriggeredBy,
    concededBy,
    timeline,
    totals,
    hands: handOut,
    hasPrivateInfo: privateSeen.size > 0,
    maps,
    undoCount,
    enclosuresAtRoundStart,
    enclosuresAtEnd: allEnclosures(),
    warnings,
    unhandledTypes,
  };
}

function buildRounds(
  players: Player[],
  turns: Turn[],
  breaks: BreakSummary[],
  timeline: TimelinePoint[],
): RoundSummary[] {
  const roundCount = Math.max(1, ...turns.map((t) => t.round));
  const rounds: RoundSummary[] = [];
  let prevEnd: Record<string, PlayerState> | null = timeline[0]?.state ?? null;

  for (let r = 1; r <= roundCount; r++) {
    const rTurns = turns.filter((t) => t.round === r);
    const brk = breaks.find((b) => b.round === r) ?? null;
    const startState: Record<string, PlayerState> = prevEnd ?? rTurns[0]?.before ?? {};
    const endState: Record<string, PlayerState> = brk ? brk.after : (rTurns[rTurns.length - 1]?.after ?? startState);
    const perPlayer: RoundSummary['perPlayer'] = {};

    for (const p of players) {
      const stats = emptyStats();
      for (const t of rTurns) if (t.stats[p.id]) mergeStats(stats, t.stats[p.id]);
      let breakIncome: MoneyFlow | null = null;
      if (brk?.stats[p.id]) {
        // Money gained during the break is income; break discards count toward the round.
        const bs = brk.stats[p.id];
        breakIncome = { total: bs.moneyGained.total, bySource: { ...bs.moneyGained.bySource } };
        const rest = { ...bs, moneyGained: emptyFlow() };
        mergeStats(stats, rest);
      }
      perPlayer[p.id] = {
        turnsTaken: rTurns.filter((t) => t.playerId === p.id).length,
        start: startState[p.id],
        end: endState[p.id],
        moneyIntoBreak: brk ? brk.before[p.id]?.money ?? null : null,
        breakIncome,
        stats,
      };
    }
    rounds.push({ round: r, turns: rTurns.map((t) => t.index), breakIndex: brk?.index ?? null, perPlayer });
    prevEnd = endState;
  }
  return rounds;
}
