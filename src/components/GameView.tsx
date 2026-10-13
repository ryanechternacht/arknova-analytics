import { Fragment, useMemo, useState } from 'react';
import type { GameAnalysis, Player, Turn, TurnStats } from '../lib/types';
import {
  actionUsage,
  breakMarkers,
  cardsGained,
  playerById,
  pointsDelta,
  pointsPerRoundBars,
  BIG_TURN,
  upgradeEvents,
  upgradeLabel,
  mapLabel,
  enclosureLabel,
  STANDARD_BUILDINGS,
  buildingName,
  NON_SCORING_MAX,
  playerTurns,
  tempoSummary,
  finalScoringPoints,
  roundBars,
  scoreSeries,
  seriesVar,
  sortedFlow,
  turnActionsLabel,
} from '../lib/derive';
import { BarList, Legend, RoundBarChart, TurnLineChart } from './charts';
import { TimelineCard } from './Timeline';
import { ActionsByRoundCard, BreaksCard, EnclosuresCard, TempoCard } from './TempoViews';

type Mode = 'rounds' | 'turns';

function Delta({ v }: { v: number }) {
  if (!v) return <span className="muted">0</span>;
  return <span className={v > 0 ? 'delta-pos' : 'delta-neg'}>{v > 0 ? `+${v}` : v}</span>;
}

function Names({ items, end }: { items: { name: string }[]; end?: boolean }) {
  if (!items.length) return <span className="muted">–</span>;
  return (
    <div className="chips" style={end ? { justifyContent: 'flex-end' } : undefined}>
      {items.map((x, i) => (
        <span className="chip" key={i}>
          {x.name}
        </span>
      ))}
    </div>
  );
}

function PlayerHeader({ game, p }: { game: GameAnalysis; p: Player }) {
  const f = game.final?.[p.id];
  const last = game.turns[game.turns.length - 1]?.after[p.id];
  const tot = game.totals[p.id];
  const winner =
    game.final && Object.values(game.final).every((o) => (f?.points ?? 0) >= o.points) ? true : false;
  return (
    <div className="card player-card">
      <div className="player-name">
        <span className="dot" style={{ background: seriesVar(p), width: 10, height: 10 }} />
        {p.name}
        {winner && <span className="pill">Winner</span>}
        {game.endTriggeredBy === p.id && <span className="pill">Triggered end</span>}
      </div>
      {mapLabel(game.maps[p.id]) && (
        <div className="secondary" style={{ fontSize: 12, marginTop: -6 }}>
          {mapLabel(game.maps[p.id])}
        </div>
      )}
      <div className="tiles">
        <div className="tile">
          <div className="label">Points</div>
          <div className="value">{f?.points ?? last?.points ?? '–'}</div>
          <div className="sub">BGA score {f?.score ?? last?.score ?? '–'}</div>
        </div>
        <div className="tile">
          <div className="label">Appeal</div>
          <div className="value">{f?.appeal ?? last?.appeal ?? '–'}</div>
        </div>
        <div className="tile">
          <div className="label">Conservation</div>
          <div className="value">{f?.conservation ?? last?.conservation ?? '–'}</div>
          <div className="sub">×3 = {3 * (f?.conservation ?? last?.conservation ?? 0)}</div>
        </div>
        <div className="tile">
          <div className="label">Animals</div>
          <div className="value">{tot.animals.length}</div>
          <div className="sub">{tot.sponsors.length} sponsors</div>
        </div>
        <div className="tile">
          <div className="label">Upgrades</div>
          <div className="value">{upgradeEvents(game, p.id).length}</div>
          <div className="sub">{upgradeEvents(game, p.id).map(upgradeLabel).join(' · ') || 'none'}</div>
        </div>
        <div className="tile">
          <div className="label">Money earned</div>
          <div className="value">${tot.moneyGained.total}</div>
          <div className="sub">spent ${tot.moneySpent.total}</div>
        </div>
      </div>
      {f?.scoringCards.length ? (
        <div className="secondary" style={{ fontSize: 12 }}>
          Final scoring: {f.scoringCards.map((c) => c.name).join(', ')}
        </div>
      ) : null}
    </div>
  );
}

// Rows of the per-round table: label + how to read the value for one player in one round.
type RoundPP = GameAnalysis['rounds'][number]['perPlayer'][string];
interface RoundCtx {
  game: GameAnalysis;
  round: number;
  playerId: string;
}
const roundTempo = (c: RoundCtx) => tempoSummary(playerTurns(c.game, c.playerId, c.round));
const ROUND_ROWS: { label: string; get: (pp: RoundPP, c: RoundCtx) => React.ReactNode; section?: string }[] = [
  { section: 'Score', label: 'Turns taken', get: (pp) => pp.turnsTaken },
  { label: 'Points gained', get: (pp) => <Delta v={pointsDelta(pp)} /> },
  { label: 'Appeal gained', get: (pp) => <Delta v={(pp.end?.appeal ?? 0) - (pp.start?.appeal ?? 0)} /> },
  { label: 'Conservation gained', get: (pp) => <Delta v={(pp.end?.conservation ?? 0) - (pp.start?.conservation ?? 0)} /> },
  { label: 'Points at end', get: (pp) => pp.end?.points ?? '–' },
  { label: 'Points per turn', get: (_pp, c) => roundTempo(c).perTurn.toFixed(1) },
  { label: `Big turns (${BIG_TURN}+ pts)`, get: (_pp, c) => roundTempo(c).big },
  { label: `Non-scoring turns (≤${NON_SCORING_MAX} pt)`, get: (_pp, c) => roundTempo(c).dead },
  { section: 'Actions', label: 'Animals', get: (_pp, c) => roundTempo(c).actionCounts.Animals ?? 0 },
  { label: 'Build', get: (_pp, c) => roundTempo(c).actionCounts.Build ?? 0 },
  { label: 'Cards', get: (_pp, c) => roundTempo(c).actionCounts.Cards ?? 0 },
  { label: 'Association', get: (_pp, c) => roundTempo(c).actionCounts.Association ?? 0 },
  { label: 'Sponsors', get: (_pp, c) => roundTempo(c).actionCounts.Sponsors ?? 0 },
  { label: 'X-token instead of action', get: (_pp, c) => roundTempo(c).xTokens },
  { label: 'Turns with Cards or Build', get: (_pp, c) => roundTempo(c).cardsOrBuild },
  { label: 'Upgrades', get: (pp) => <Names items={pp.stats.upgrades.map((n) => ({ name: n }))} end /> },
  { label: 'Break spaces advanced', get: (pp) => pp.stats.breakSpaces },
  { label: 'Breaks triggered', get: (pp) => pp.stats.breaksTriggered },
  { section: 'Money', label: 'Money at start', get: (pp) => `$${pp.start?.money ?? '–'}` },
  { label: 'Spent', get: (pp) => `$${pp.stats.moneySpent.total}` },
  { label: 'Earned during turns', get: (pp) => `$${pp.stats.moneyGained.total}` },
  { label: 'Carried into break', get: (pp) => (pp.moneyIntoBreak == null ? '–' : `$${pp.moneyIntoBreak}`) },
  { label: 'Break income', get: (pp) => (pp.breakIncome ? `$${pp.breakIncome.total}` : '–') },
  { section: 'Cards', label: 'Drawn from deck', get: (pp) => pp.stats.cardsDrawnDeck },
  { label: 'Snapped', get: (pp) => pp.stats.cardsSnapped },
  { label: 'Taken from display (in range)', get: (pp) => pp.stats.cardsTakenInRange },
  { label: 'From effects', get: (pp) => pp.stats.cardsFromEffects },
  { label: 'Discarded', get: (pp) => pp.stats.cardsDiscarded },
  { label: 'Sold', get: (pp) => pp.stats.cardsSold },
  { label: 'Pouched', get: (pp) => pp.stats.cardsPouched },
  { label: 'Hand at end', get: (pp) => pp.end?.handSize ?? '–' },
  {
    section: 'Zoo',
    label: 'Open enclosures at start',
    get: (_pp, c) => {
      const snap = c.game.enclosuresAtRoundStart[c.round]?.[c.playerId];
      if (!snap) return '–';
      const parts = [
        ...snap.open.map((x) => `Size ${x}`),
        ...snap.special.filter((x) => x.capacity > x.used).map((x) => `${enclosureLabel(x.type)} ${x.capacity - x.used}`),
      ];
      return parts.length ? <Names items={parts.map((name) => ({ name }))} end /> : 'none';
    },
  },
  { label: 'Animals played', get: (pp) => <Names items={pp.stats.animals} end /> },
  { label: 'Sponsors played', get: (pp) => <Names items={pp.stats.sponsors} end /> },
  {
    label: 'Buildings',
    get: (pp) => (
      <Names items={pp.stats.buildings.filter((b) => STANDARD_BUILDINGS.test(b.type)).map((b) => ({ name: buildingName(b.type) }))} end />
    ),
  },
  { label: 'Projects supported', get: (pp) => <Names items={pp.stats.projectsSupported.map((n) => ({ name: n }))} end /> },
  { label: 'X-tokens +/-', get: (pp) => `+${pp.stats.xtokensGained} / -${pp.stats.xtokensSpent}` },
];

function RoundTable({ game, player }: { game: GameAnalysis; player: Player }) {
  const finalPts = finalScoringPoints(game, player.id);
  const f = game.final?.[player.id];
  const lastTurn = game.turns[game.turns.length - 1]?.after[player.id];
  // Only the score rows have a meaningful "final scoring" value.
  const finalCell = (label: string): React.ReactNode => {
    if (finalPts == null || !f || !lastTurn) return '';
    if (label === 'Points gained') return <Delta v={finalPts} />;
    if (label === 'Appeal gained') return <Delta v={f.appeal - lastTurn.appeal} />;
    if (label === 'Conservation gained') return <Delta v={f.conservation - lastTurn.conservation} />;
    if (label === 'Points at end') return f.points;
    return '';
  };
  return (
    <div className="table-wrap">
      <table style={{ tableLayout: 'fixed', minWidth: 160 + 110 * (game.rounds.length + 1) }}>
        <colgroup>
          <col style={{ width: 170 }} />
        </colgroup>
        <thead>
          <tr>
            <th />
            {game.rounds.map((r) => (
              <th key={r.round} className="n">
                Round {r.round}
              </th>
            ))}
            {game.final && <th className="n">Final scoring</th>}
          </tr>
        </thead>
        <tbody>
          {ROUND_ROWS.map((row) => (
            <Fragment key={row.label}>
              {row.section && (
                <tr className="section">
                  <td colSpan={game.rounds.length + 2}>{row.section}</td>
                </tr>
              )}
              <tr>
                <td className="secondary">{row.label}</td>
                {game.rounds.map((r) => {
                  const pp = r.perPlayer[player.id];
                  return (
                    <td key={r.round} className="n" style={{ whiteSpace: 'normal' }}>
                      {pp ? row.get(pp, { game, round: r.round, playerId: player.id }) : '–'}
                    </td>
                  );
                })}
                {game.final && <td className="n">{finalCell(row.label)}</td>}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function turnSummary(st: TurnStats | undefined): React.ReactNode {
  if (!st) return null;
  const bits: string[] = [];
  const gained = cardsGained(st);
  if (st.cardsSnapped) bits.push(`snapped ${st.cardsSnapped}`);
  if (st.cardsTakenInRange) bits.push(`took ${st.cardsTakenInRange} in range`);
  if (st.cardsDrawnDeck) bits.push(`drew ${st.cardsDrawnDeck}`);
  if (gained - st.cardsSnapped - st.cardsTakenInRange - st.cardsDrawnDeck > 0)
    bits.push(`+${gained - st.cardsSnapped - st.cardsTakenInRange - st.cardsDrawnDeck} from effects`);
  if (st.cardsDiscarded) bits.push(`discarded ${st.cardsDiscarded}`);
  if (st.cardsSold) bits.push(`sold ${st.cardsSold}`);
  // Sponsor-specific buildings (Zoo School etc.) already show as the sponsor card.
  const built = st.buildings.filter((b) => STANDARD_BUILDINGS.test(b.type));
  if (built.length) bits.push(built.map((b) => buildingName(b.type)).join(', '));
  if (st.projectsSupported.length) bits.push(`project: ${st.projectsSupported.join(', ')}`);
  if (st.partnerZoos) bits.push('partner zoo');
  if (st.universities) bits.push('university');
  if (st.upgrades.length) bits.push(`upgraded ${st.upgrades.join(', ')}`);
  const cards = [...st.animals, ...st.sponsors];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {cards.length > 0 && <Names items={cards} />}
      {bits.length > 0 && <span className="secondary">{bits.join(' · ')}</span>}
    </div>
  );
}

function TurnTable({ game, filter }: { game: GameAnalysis; filter: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const turns = game.turns.filter((t) => filter === 'all' || t.playerId === filter);
  let lastRound = 0;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="n">Turn</th>
            <th>Player</th>
            <th>Action</th>
            <th className="n">Points</th>
            <th className="n">Money</th>
            <th className="n">Spent</th>
            <th className="n">Earned</th>
            <th>What happened</th>
          </tr>
        </thead>
        <tbody>
          {turns.map((t: Turn) => {
            const p = playerById(game, t.playerId)!;
            const b = t.before[t.playerId];
            const a = t.after[t.playerId];
            const st = t.stats[t.playerId];
            const brk = t.round !== lastRound;
            lastRound = t.round;
            return (
              <Fragment key={t.index}>
                {brk && (
                  <tr className="section">
                    <td colSpan={8}>Round {t.round}</td>
                  </tr>
                )}
                <tr className="clickable" onClick={() => setOpen(open === t.index ? null : t.index)}>
                  <td className="n muted">{t.playerTurnNumber}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                      <span className="dot" style={{ background: seriesVar(p) }} />
                      {p.name}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{turnActionsLabel(t)}</td>
                  <td className="n">
                    {a.points}
                    {a.points !== b.points && (
                      <>
                        {' '}
                        <Delta v={a.points - b.points} />
                      </>
                    )}
                  </td>
                  <td className="n">
                    ${b.money}→${a.money}
                  </td>
                  <td className="n">{st?.moneySpent.total ? `$${st.moneySpent.total}` : ''}</td>
                  <td className="n">{st?.moneyGained.total ? `$${st.moneyGained.total}` : ''}</td>
                  <td>{turnSummary(st)}</td>
                </tr>
                {open === t.index && (
                  <tr>
                    <td />
                    <td colSpan={7}>
                      <ul className="log">
                        {t.log.map((l, i) => (
                          <li key={i}>{l.text}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PointsPerTurnChart({ game }: { game: GameAnalysis }) {
  // Each player's own turns side by side: x = that player's turn number.
  const maxTurns = Math.max(...game.players.map((p) => game.turns.filter((t) => t.playerId === p.id).length));
  const data = Array.from({ length: maxTurns }, (_, i) => {
    const row: Record<string, number | string | null> = { round: `${i + 1}` };
    for (const p of game.players) {
      const t = game.turns.filter((x) => x.playerId === p.id)[i];
      row[p.id] = t ? t.after[p.id].points - t.before[p.id].points : null;
    }
    return row;
  });
  return <RoundBarChart data={data as never} players={game.players} height={240} />;
}

export function GameView({ game }: { game: GameAnalysis }) {
  const [mode, setMode] = useState<Mode>('rounds');
  const [tablePlayer, setTablePlayer] = useState(game.players[0]?.id ?? '');
  const [turnFilter, setTurnFilter] = useState('all');
  const [line, setLine] = useState<'points' | 'money'>('points');

  const pointsLine = useMemo(() => scoreSeries(game, 'points'), [game]);
  const moneyLine = useMemo(() => scoreSeries(game, 'money'), [game]);
  const breaks = useMemo(() => breakMarkers(game), [game]);
  const pointsPerRound = useMemo(() => pointsPerRoundBars(game), [game]);
  const carried = useMemo(() => roundBars(game, (pp) => pp.moneyIntoBreak), [game]);
  const income = useMemo(() => roundBars(game, (pp) => pp.breakIncome?.total ?? null), [game]);
  const spent = useMemo(() => roundBars(game, (pp) => pp.stats.moneySpent.total), [game]);

  return (
    <>
      <div className="players">
        {game.players.map((p) => (
          <PlayerHeader key={p.id} game={game} p={p} />
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{line === 'points' ? 'Points over the game' : 'Money on hand after each turn'}</h2>
            <div className="muted" style={{ fontSize: 12 }}>
              {line === 'points'
                ? 'Points = appeal + 3 × conservation. Vertical rules mark breaks; the last point is final scoring.'
                : 'Vertical rules mark breaks, where income is paid.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Legend players={game.players} kind="line" />
            <div className="segmented">
              <button aria-pressed={line === 'points'} onClick={() => setLine('points')}>
                Points
              </button>
              <button aria-pressed={line === 'money'} onClick={() => setLine('money')}>
                Money
              </button>
            </div>
          </div>
        </div>
        <TurnLineChart
          data={line === 'points' ? pointsLine : moneyLine}
          players={game.players}
          breaks={breaks}
          unit={line === 'money' ? '$' : undefined}
        />
      </div>

      <TempoCard game={game} />

      <TimelineCard game={game} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="segmented">
          <button aria-pressed={mode === 'rounds'} onClick={() => setMode('rounds')}>
            By round
          </button>
          <button aria-pressed={mode === 'turns'} onClick={() => setMode('turns')}>
            By turn
          </button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {mode === 'rounds'
            ? 'A round runs from one break to the next. Ark Nova has no fixed rounds, so this is the closest natural unit.'
            : 'Every individual turn, in order.'}
        </span>
      </div>

      {mode === 'rounds' ? (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-head">
                <h2>Points per round</h2>
                <Legend players={game.players} kind="bar" />
              </div>
              <RoundBarChart data={pointsPerRound} players={game.players} />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Money carried into each break</h2>
                <Legend players={game.players} kind="bar" />
              </div>
              <RoundBarChart data={carried.filter((_r, i) => game.rounds[i].breakIndex != null)} players={game.players} unit="$" />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Money spent per round</h2>
                <Legend players={game.players} kind="bar" />
              </div>
              <RoundBarChart data={spent} players={game.players} unit="$" />
            </div>
            <div className="card">
              <div className="card-head">
                <h2>Break income</h2>
                <Legend players={game.players} kind="bar" />
              </div>
              <RoundBarChart data={income.filter((_r, i) => game.rounds[i].breakIndex != null)} players={game.players} unit="$" />
            </div>
          </div>

          <ActionsByRoundCard game={game} />
          <BreaksCard game={game} />
          <EnclosuresCard game={game} />

          <div className="card">
            <div className="card-head">
              <h2>Round by round</h2>
              <div className="segmented">
                {game.players.map((p) => (
                  <button key={p.id} aria-pressed={tablePlayer === p.id} onClick={() => setTablePlayer(p.id)}>
                    <span className="dot" style={{ background: seriesVar(p), marginRight: 6 }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <RoundTable game={game} player={playerById(game, tablePlayer) ?? game.players[0]} />
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Points per turn</h2>
                <div className="muted" style={{ fontSize: 12 }}>
                  X axis is each player&apos;s own turn number. Points earned on an opponent&apos;s turn (e.g. Polar Bear Exhibit) aren&apos;t counted here.
                </div>
              </div>
              <Legend players={game.players} kind="bar" />
            </div>
            <PointsPerTurnChart game={game} />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Turn by turn</h2>
              <div className="segmented">
                <button aria-pressed={turnFilter === 'all'} onClick={() => setTurnFilter('all')}>
                  Everyone
                </button>
                {game.players.map((p) => (
                  <button key={p.id} aria-pressed={turnFilter === p.id} onClick={() => setTurnFilter(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Click a turn to see its full log.
            </div>
            <TurnTable game={game} filter={turnFilter} />
          </div>
        </>
      )}

      <div className="grid-2">
        {game.players.map((p) => (
          <MoneyCard key={p.id} game={game} p={p} />
        ))}
      </div>

      <div className="grid-2">
        {game.players.map((p) => (
          <ZooCard key={p.id} game={game} p={p} />
        ))}
      </div>

      {(game.warnings.length > 0 || Object.keys(game.unhandledTypes).length > 0) && (
        <details className="card">
          <summary>Data checks ({game.warnings.length + Object.keys(game.unhandledTypes).length})</summary>
          <ul className="log">
            {game.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {Object.entries(game.unhandledTypes).map(([k, v]) => (
              <li key={k}>
                Unrecognized BGA event “{k}” ×{v}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function MoneyCard({ game, p }: { game: GameAnalysis; p: Player }) {
  const t = game.totals[p.id];
  // Break income is part of moneyGained in totals; it's labelled by its source (appeal income, etc).
  return (
    <div className="card">
      <div className="card-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" style={{ background: seriesVar(p) }} />
          {p.name}: money
        </h2>
        <span className="secondary num">
          earned ${t.moneyGained.total} · spent ${t.moneySpent.total}
        </span>
      </div>
      <h3 className="secondary" style={{ marginBottom: 6 }}>
        Spent on
      </h3>
      <BarList rows={sortedFlow(t.moneySpent)} color={seriesVar(p)} />
      <h3 className="secondary" style={{ margin: '14px 0 6px' }}>
        Earned from
      </h3>
      <BarList rows={sortedFlow(t.moneyGained)} color={seriesVar(p)} />
    </div>
  );
}

function ZooCard({ game, p }: { game: GameAnalysis; p: Player }) {
  const t = game.totals[p.id];
  const usage = actionUsage(game, p.id);
  return (
    <div className="card">
      <div className="card-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" style={{ background: seriesVar(p) }} />
          {p.name}: zoo &amp; actions
        </h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Animal</th>
              <th className="n">Cost</th>
              <th className="n">Appeal</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {t.animals.map((a, i) => (
              <tr key={i}>
                <td>
                  {a.name}
                  {a.fromDisplay && <span className="muted"> (display)</span>}
                </td>
                <td className="n">${a.cost}</td>
                <td className="n">{a.appeal ?? '–'}</td>
                <td className="secondary">{[...(a.categories ?? []), ...(a.continents ?? [])].join(', ')}</td>
              </tr>
            ))}
            {!t.animals.length && (
              <tr>
                <td colSpan={4} className="muted">
                  No animals played
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="secondary" style={{ margin: '12px 0 4px', fontSize: 13 }}>
        Sponsors: {t.sponsors.map((s) => s.name).join(', ') || 'none'}
      </div>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th className="n">Uses</th>
              <th className="n">Avg strength</th>
              <th className="n">At level II</th>
              <th className="n">For X-token</th>
              <th className="n">Upgraded</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.action}>
                <td>{u.action}</td>
                <td className="n">{u.uses}</td>
                <td className="n">{u.uses ? (u.strengthSum / u.uses).toFixed(1) : '–'}</td>
                <td className="n">{u.lvl2}</td>
                <td className="n">{u.xTokens || ''}</td>
                <td className="n">
                  {(() => {
                    const e = upgradeEvents(game, p.id).find((x) => x.action === u.action);
                    return e ? (e.turn != null ? `turn ${e.turn}` : `round ${e.round}`) : '–';
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {game.hands[p.id] && (
        <div className="secondary" style={{ marginTop: 10, fontSize: 13 }}>
          Hand at end: {game.hands[p.id].map((c) => c.name).join(', ') || 'empty'}
        </div>
      )}
    </div>
  );
}
