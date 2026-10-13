// Games fetched from BGA are cached in IndexedDB: every BGA log fetch counts against the user's
// daily replay limit, so a game should only ever be fetched once.

import type { BgaPacket } from './types';

const DB_NAME = 'arknova-analytics';
const STORE = 'games';

export interface CachedGame {
  table: string;
  savedAt: number;
  // Display info for the saved-games list.
  players: string;
  raw: unknown;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'table' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedGame(table: string): Promise<CachedGame | undefined> {
  try {
    return await tx('readonly', (s) => s.get(table) as IDBRequest<CachedGame | undefined>);
  } catch {
    return undefined;
  }
}

export async function putCachedGame(game: CachedGame): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(game));
  } catch {
    // Storage full or unavailable: the game still works, it just won't be cached.
  }
}

export async function listCachedGames(): Promise<Omit<CachedGame, 'raw'>[]> {
  try {
    const all = await tx('readonly', (s) => s.getAll() as IDBRequest<CachedGame[]>);
    return all.map(({ table, savedAt, players }) => ({ table, savedAt, players })).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

// Drops what the analysis never reads (state-machine UI args, timers), shrinking a ~3MB log to a
// fraction of that.
export function slimRaw(raw: { gamelogs?: BgaPacket[] } & Record<string, unknown>): unknown {
  if (!Array.isArray(raw.gamelogs)) return raw;
  const gamelogs = raw.gamelogs.map((p) => ({
    ...p,
    data: p.data
      .filter((n) => n.type !== 'updateReflexionTime')
      .map((n) =>
        n.type === 'gameStateChange'
          ? { ...n, args: { id: n.args?.id, type: n.args?.type, name: n.args?.name, active_player: n.args?.active_player } }
          : n,
      ),
  }));
  return { ...raw, gamelogs };
}
