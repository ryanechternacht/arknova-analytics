// Raw BGA notification log shapes (only the fields we read).

export interface BgaNotification {
  uid?: string;
  type: string;
  log: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
}

export interface BgaPacket {
  channel: string;
  table_id?: number | string;
  packet_id?: string;
  move_id?: string | null;
  time?: string;
  data: BgaNotification[];
}

export interface RawPlayerInfo {
  id: string;
  name?: string;
  color?: string;
  score?: number;
}

export interface RawGame {
  table?: number;
  packets: BgaPacket[];
  players?: RawPlayerInfo[];
  startTime?: number;
  endTime?: number;
}

// Analysis output.

export interface PlayerState {
  // Appeal + 3 per conservation point (BGA/the board count the first 10 CP as 2).
  points: number;
  money: number;
  appeal: number;
  conservation: number;
  reputation: number;
  score: number;
  xtokens: number;
  income: number | null;
  handSize: number | null;
  // Empty standard enclosures.
  openEnclosures: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  order: number;
}

export type ActionType = 'Animals' | 'Build' | 'Cards' | 'Association' | 'Sponsors' | string;

export interface ActionUse {
  action: ActionType;
  level: 1 | 2;
  strength: number;
  cardType: string;
  // True when the card was used to take an X-token instead of its action.
  xToken?: boolean;
}

export interface CardRef {
  id: string;
  name: string;
}

export interface AnimalPlayed extends CardRef {
  cost: number;
  fromDisplay: boolean;
  appeal?: number;
  categories?: string[];
  continents?: string[];
  size?: number;
}

export interface BuildingBuilt {
  type: string;
  size: number;
  cost: number;
}

export interface MoneyFlow {
  total: number;
  bySource: Record<string, number>;
}

export interface TurnStats {
  cardsDrawnDeck: number;
  cardsSnapped: number;
  cardsTakenInRange: number;
  // Names of cards snapped or taken from the display.
  displayCards: CardRef[];
  cardsFromEffects: number;
  cardsDiscarded: number;
  cardsSold: number;
  // Cards tucked under an animal with the Pouch ability.
  cardsPouched: number;
  animals: AnimalPlayed[];
  sponsors: (CardRef & { fromDisplay: boolean })[];
  buildings: BuildingBuilt[];
  projectsSupported: string[];
  // Card ids of supported projects (for icons).
  projectIds: string[];
  partnerZoos: number;
  // Continent of each partner zoo taken, e.g. "Americas".
  partnerZooContinents: string[];
  universities: number;
  // BGA university token types, e.g. "fac-science-rep".
  universityTypes: string[];
  upgrades: string[];
  xtokensGained: number;
  xtokensSpent: number;
  moneyGained: MoneyFlow;
  moneySpent: MoneyFlow;
  appealGained: number;
  conservationGained: number;
  reputationGained: number;
  // Break track spaces this player advanced, keyed by what caused it.
  breakSpaces: number;
  breakBySource: Record<string, number>;
  breaksTriggered: number;
}

export interface LogLine {
  move: number;
  playerId: string | null;
  text: string;
  type: string;
}

export interface Turn {
  index: number;
  playerId: string;
  playerTurnNumber: number;
  round: number;
  moveStart: number;
  moveEnd: number;
  actions: ActionUse[];
  // Snapshot of every player at turn start / end, keyed by player id.
  before: Record<string, PlayerState>;
  after: Record<string, PlayerState>;
  // Stats for each player during this turn (the active player and anyone affected).
  stats: Record<string, TurnStats>;
  log: LogLine[];
  endTriggered: boolean;
}

export interface BreakSummary {
  index: number;
  round: number;
  moveStart: number;
  triggeredBy: string | null;
  // What pushed the token onto the last space, e.g. "Sponsors break" or "Jumping 2 (Alpine Ibex)".
  triggerSource: string | null;
  before: Record<string, PlayerState>;
  after: Record<string, PlayerState>;
  stats: Record<string, TurnStats>;
  log: LogLine[];
}

export interface SpecialEnclosure {
  type: string;
  // Spaces (BGA "cubes") used out of capacity; animals take 1–3 spaces each.
  used: number;
  capacity: number;
}

export interface EnclosureSnapshot {
  // Sizes of empty standard enclosures.
  open: number[];
  // Standard enclosures with an animal in them.
  filled: number;
  // Reptile house, aviary, aquariums, petting zoo, underwater tunnel.
  special: SpecialEnclosure[];
}

export interface FinalScore {
  points: number;
  appeal: number;
  conservation: number;
  conservationScore: number;
  score: number;
  scoringCards: CardRef[];
}

export interface RoundSummary {
  round: number;
  // Turn indices in this round.
  turns: number[];
  breakIndex: number | null;
  perPlayer: Record<
    string,
    {
      turnsTaken: number;
      start: PlayerState;
      end: PlayerState;
      // Money in hand when the break started, before income.
      moneyIntoBreak: number | null;
      breakIncome: MoneyFlow | null;
      stats: TurnStats;
    }
  >;
}

export interface TimelinePoint {
  seq: number;
  move: number;
  turnIndex: number | null;
  round: number;
  state: Record<string, PlayerState>;
}

export interface GameAnalysis {
  table: number | null;
  players: Player[];
  turns: Turn[];
  breaks: BreakSummary[];
  rounds: RoundSummary[];
  setup: {
    log: LogLine[];
    actionCards: Record<string, string[]>;
    startingHand: Record<string, CardRef[]>;
    keptHand: Record<string, CardRef[]>;
    scoringCards: Record<string, CardRef[]>;
  };
  final: Record<string, FinalScore> | null;
  endTriggeredBy: string | null;
  concededBy: string | null;
  timeline: TimelinePoint[];
  totals: Record<string, TurnStats>;
  hands: Record<string, CardRef[]>;
  // Keyed by round number (1 = game start), then player id.
  enclosuresAtRoundStart: Record<number, Record<string, EnclosureSnapshot>>;
  enclosuresAtEnd: Record<string, EnclosureSnapshot>;
  hasPrivateInfo: boolean;
  // Zoo map id per player (e.g. "13"), when the log includes setup.
  maps: Record<string, string>;
  // Number of undos (BGA clearTurn) whose notifications were skipped.
  undoCount: number;
  warnings: string[];
  unhandledTypes: Record<string, number>;
}
