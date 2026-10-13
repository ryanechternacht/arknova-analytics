import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyze, normalizeInput } from './lib/parse';
import type { GameAnalysis } from './lib/types';
import { BgaBridge, parseTableId, type BridgeHello, type RecentGame } from './bridge/client';
import { bookmarkletHref } from './bridge/bookmarklet';
import { formatDate, turnCountLabel } from './lib/derive';
import { GameView } from './components/GameView';
import { getCachedGame, listCachedGames, putCachedGame, slimRaw, type CachedGame } from './lib/cache';
import { ErrorBoundary } from './components/ErrorBoundary';

type BridgeState =
  | { status: 'none' }
  | { status: 'connecting' }
  | { status: 'connected'; bridge: BgaBridge; hello: BridgeHello }
  | { status: 'failed' };

export default function App() {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'none' });
  const [recent, setRecent] = useState<RecentGame[] | null>(null);
  const [game, setGame] = useState<GameAnalysis | null>(null);
  const [rawGame, setRawGame] = useState<unknown>(null);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoLoaded = useRef(false);
  const [saved, setSaved] = useState<Omit<CachedGame, 'raw'>[]>([]);



  const loadJson = useCallback((json: unknown) => {
    const g = analyze(normalizeInput(json));
    if (!g.turns.length) throw new Error('No turns found in this log. Is it an Ark Nova game?');
    setGame(g);
    setRawGame(json);
    setError(null);
    if (g.table) window.history.replaceState(null, '', `#table=${g.table}`);
  }, []);

  useEffect(() => {
    void listCachedGames().then(setSaved);
    // A #table=… link opens a saved game straight away, no BGA connection needed.
    const id = parseTableId(window.location.hash);
    if (id) {
      void getCachedGame(id).then((cached) => {
        if (!cached) return;
        try {
          loadJson(cached.raw);
          autoLoaded.current = true;
        } catch {
          // Leave it to the bridge to refetch.
        }
      });
    }
  }, [loadJson]);

  const saveToCache = useCallback(async (table: string, raw: unknown) => {
    const g = analyze(normalizeInput(raw));
    await putCachedGame({ table, savedAt: Date.now(), players: g.players.map((p) => p.name).join(' vs '), raw });
    setSaved(await listCachedGames());
  }, []);

  const loadTable = useCallback(
    async (input: string) => {
      const id = parseTableId(input);
      if (!id) {
        setError('That doesn’t look like a BGA table link or ID.');
        return;
      }
      // Every BGA fetch counts against the daily replay limit, so reuse saved games.
      const cached = await getCachedGame(id);
      if (cached) {
        try {
          loadJson(cached.raw);
          return;
        } catch {
          // Fall through and refetch.
        }
      }
      if (bridge.status !== 'connected' || !bridge.bridge.alive) {
        setError(
          'To load games by link, open boardgamearena.com (logged in) and click the “Ark Nova Analytics” bookmarklet. It opens this page connected to BGA.',
        );
        return;
      }
      setLoading(`Loading table ${id} from BGA…`);
      setError(null);
      try {
        const raw = slimRaw((await bridge.bridge.fetchGame(id)) as Record<string, unknown>);
        loadJson(raw);
        await saveToCache(id, raw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /reached a limit/i.test(msg)
            ? 'BGA says you’ve reached your replay limit for now, so it won’t send new game logs. Games you’ve already loaded are saved below and still work.'
            : msg,
        );
      } finally {
        setLoading(null);
      }
    },
    [bridge, loadJson, saveToCache],
  );

  // Connect to the BGA tab that opened us (via the bookmarklet).
  useEffect(() => {
    if (!window.opener) return;
    setBridge({ status: 'connecting' });
    BgaBridge.connect(window.opener as Window)
      .then(({ bridge, hello }) => setBridge({ status: 'connected', bridge, hello }))
      .catch(() => setBridge({ status: 'failed' }));
  }, []);

  // Dev-only hook for regression-testing the parser against real games from the console.
  useEffect(() => {
    if (!import.meta.env.DEV || bridge.status !== 'connected') return;
    (window as unknown as Record<string, unknown>).__arkDev = { analyze, normalizeInput, bridge: bridge.bridge };
  }, [bridge]);

  useEffect(() => {
    if (bridge.status !== 'connected') return;
    bridge.bridge
      .listGames(1)
      .then(setRecent)
      .catch(() => setRecent(null));
    const fromUrl = bridge.hello.tableFromUrl ?? parseTableId(window.location.hash);
    if (fromUrl && !autoLoaded.current) {
      autoLoaded.current = true;
      void loadTable(fromUrl);
    }
  }, [bridge, loadTable]);

  const onFile = async (file: File) => {
    setLoading(`Reading ${file.name}…`);
    try {
      const raw = slimRaw(JSON.parse(await file.text()));
      loadJson(raw);
      const table = analyze(normalizeInput(raw)).table;
      if (table) await saveToCache(String(table), raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  };

  const downloadRaw = () => {
    if (!rawGame || !game) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(rawGame)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `arknova_${game.table ?? 'game'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <a href="#" onClick={(e) => { e.preventDefault(); setGame(null); }} style={{ color: 'inherit', textDecoration: 'none' }}>
            Ark Nova Analytics
          </a>
        </div>
        <form
          className="load-row"
          onSubmit={(e) => {
            e.preventDefault();
            void loadTable(link);
          }}
        >
          <input
            className="input"
            placeholder="Paste a BGA table link or table ID"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            aria-label="BGA table link or ID"
          />
          <button className="btn primary" type="submit" disabled={!!loading}>
            Load
          </button>
        </form>
        <BridgePill state={bridge} />
      </header>

      <main className="main">
        {loading && <div className="notice">{loading}</div>}
        {error && <div className="error">{error}</div>}

        {game ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20 }}>{game.players.map((p) => p.name).join(' vs ')}</h1>
              {game.table && (
                <a
                  href={`https://boardgamearena.com/gamereview?table=${game.table}`}
                  target="_blank"
                  rel="noreferrer"
                  className="secondary"
                >
                  Table {game.table} on BGA ↗
                </a>
              )}
              <span className="muted">
                {turnCountLabel(game)} · {game.breaks.length} breaks
              </span>
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={downloadRaw}>
                Download game data
              </button>
            </div>
            {game.concededBy && (
              <div className="notice">
                {game.players.find((p) => p.id === game.concededBy)?.name ?? 'A player'} conceded, so there was no
                final scoring. Stats run through the last turn played.
              </div>
            )}
            <ErrorBoundary key={game.table ?? 'game'}>
              <GameView game={game} />
            </ErrorBoundary>
          </>
        ) : (
          <Home bridge={bridge} recent={recent} saved={saved} onPick={(t) => void loadTable(t)} onFile={onFile} />
        )}
      </main>
    </>
  );
}

function BridgePill({ state }: { state: BridgeState }) {
  if (state.status === 'connected')
    return (
      <span className="pill">
        <span className="dot" style={{ background: 'var(--good)' }} />
        Connected to BGA
      </span>
    );
  if (state.status === 'connecting') return <span className="pill">Connecting to BGA…</span>;
  if (state.status === 'failed')
    return (
      <span className="pill">
        <span className="dot" style={{ background: 'var(--bad)' }} />
        BGA tab not responding
      </span>
    );
  return <span className="pill">Not connected to BGA</span>;
}

function Home({
  bridge,
  recent,
  saved,
  onPick,
  onFile,
}: {
  bridge: BridgeState;
  recent: RecentGame[] | null;
  saved: Omit<CachedGame, 'raw'>[];
  onPick: (table: string) => void;
  onFile: (f: File) => void;
}) {
  const [over, setOver] = useState(false);
  const appUrl = window.location.origin + window.location.pathname;
  const href = useMemo(() => bookmarkletHref(appUrl), [appUrl]);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);

  // React refuses javascript: URLs in href, so set it directly on the element.
  useEffect(() => {
    bookmarkRef.current?.setAttribute('href', href);
  }, [href]);

  const me = bridge.status === 'connected' ? bridge.hello.me : null;

  return (
    <>
      {bridge.status === 'connected' && (
        <div className="card">
          <div className="card-head">
            <h2>Your recent Ark Nova games</h2>
            <span className="muted">Click one to analyze it</span>
          </div>
          {recent === null ? (
            <div className="muted">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="muted">No games found.</div>
          ) : (
            <div className="table-wrap">
              <table className="games-list">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Players</th>
                    <th className="n">Scores</th>
                    <th>Result</th>
                    <th>Table</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((g) => {
                    const ids = g.playerIds.split(',');
                    const ranks = g.ranks.split(',');
                    const myRank = me ? ranks[ids.indexOf(me)] : undefined;
                    const conceded = g.scores === '1,0' || g.scores === '0,1';
                    return (
                      <tr key={g.table} className="clickable" onClick={() => onPick(g.table)}>
                        <td>{formatDate(g.end || g.start)}</td>
                        <td>{g.players.split(',').join(' vs ')}</td>
                        <td className="n">{conceded ? 'conceded' : g.scores.split(',').join(' – ')}</td>
                        <td className={myRank === '1' ? 'win' : 'loss'}>{myRank === '1' ? 'Win' : myRank ? 'Loss' : ''}</td>
                        <td className="muted">
                          {g.table}
                          {saved.some((x) => x.table === g.table) ? ' · saved' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {bridge.status !== 'connected' && (
        <div className="card">
          <div className="card-head">
            <h2>Analyze an Ark Nova game from Board Game Arena</h2>
          </div>
          <div className="steps">
            <div>
              <div className="step-num">1</div>
              <div>
                Drag this button to your bookmarks bar:
                <br />
                <a ref={bookmarkRef} className="bookmarklet" onClick={(e) => e.preventDefault()}>
                  Ark Nova Analytics
                </a>
              </div>
            </div>
            <div>
              <div className="step-num">2</div>
              <div>
                Open <a href="https://boardgamearena.com" target="_blank" rel="noreferrer">boardgamearena.com</a> while
                logged in, then click the bookmark. If you’re on a game’s replay or review page, that game loads
                right away.
              </div>
            </div>
            <div>
              <div className="step-num">3</div>
              <div>
                This page reopens connected to BGA. Pick one of your recent games, or paste any table link in the box
                above.
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            BGA game logs need your BGA login, so the bookmark fetches them from your BGA tab and passes them to this
            page. Nothing is sent anywhere else.
          </p>
        </div>
      )}

      {saved.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Saved games</h2>
            <span className="muted">Already downloaded, so opening these doesn’t use a BGA replay</span>
          </div>
          <div className="table-wrap">
            <table className="games-list">
              <tbody>
                {saved.map((g) => (
                  <tr key={g.table} className="clickable" onClick={() => onPick(g.table)}>
                    <td>{g.players}</td>
                    <td className="muted">Table {g.table}</td>
                    <td className="muted">saved {formatDate(g.savedAt / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <label
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        Or drop a downloaded game file (.json) here, or{' '}
        <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>choose a file</span>
        <input
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
    </>
  );
}
