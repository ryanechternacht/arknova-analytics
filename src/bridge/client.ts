// App side of the BGA bridge: talks to the BGA tab that opened us (see bookmarklet.ts).

export const BGA_ORIGIN = 'https://boardgamearena.com';

export interface RecentGame {
  table: string;
  start: number;
  end: number;
  players: string;
  scores: string;
  ranks: string;
  playerIds: string;
}

export interface BridgeHello {
  me: string | null;
  tableFromUrl: string | null;
}

let nextId = 1;

function request<T>(target: Window, msg: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for the BGA tab.'));
    }, timeoutMs);
    function onMessage(e: MessageEvent) {
      if (e.origin !== BGA_ORIGIN || e.data?.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (e.data.type === 'ark:error') reject(new Error(e.data.error));
      else resolve(e.data.data as T);
    }
    window.addEventListener('message', onMessage);
    target.postMessage({ ...msg, id }, BGA_ORIGIN);
  });
}

export class BgaBridge {
  private target: Window;

  constructor(target: Window) {
    this.target = target;
  }

  // The opener may still be registering its listener, so retry the handshake a few times.
  static async connect(target: Window, attempts = 10): Promise<{ bridge: BgaBridge; hello: BridgeHello }> {
    const bridge = new BgaBridge(target);
    for (let i = 0; i < attempts; i++) {
      try {
        const hello = await request<BridgeHello>(target, { type: 'ark:hello' }, 700);
        return { bridge, hello };
      } catch {
        // retry
      }
    }
    throw new Error('Could not reach the BGA tab.');
  }

  fetchGame(table: string): Promise<unknown> {
    return request(this.target, { type: 'ark:fetchGame', table }, 60_000);
  }

  listGames(page = 1): Promise<RecentGame[]> {
    return request(this.target, { type: 'ark:listGames', page }, 30_000);
  }

  get alive(): boolean {
    return !this.target.closed;
  }
}

// Accepts a bare table id or any BGA URL with ?table= (replay, gamereview, table page).
export function parseTableId(input: string): string | null {
  const s = input.trim();
  if (/^\d{5,}$/.test(s)) return s;
  const m = s.match(/[?&#]table=(\d+)/) ?? s.match(/\/table\/(\d+)/);
  return m ? m[1] : null;
}
