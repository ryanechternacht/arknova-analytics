import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameAnalysis, Player, Turn } from '../lib/types';
import { tipPosition } from '../lib/tooltip';
import { universityLabel } from '../lib/icons';
import {
  NON_SCORING_MAX,
  STANDARD_BUILDINGS,
  buildingName,
  enclosureLabel,
  ownTurnPoints,
  playerTurns,
  seriesVar,
  tempoBreakMarkers,
  tempoSeries,
  tempoSummary,
  turnAbbr,
  turnActionsLabel,
  turnKind,
  ACTION_ABBR,
} from '../lib/derive';
import { Legend, TurnLineChart } from './charts';

const LATE_GAME_TURNS = 8;

function PlayerLabel({ p }: { p: Player }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span className="dot" style={{ background: seriesVar(p) }} />
      {p.name}
    </span>
  );
}

// What a turn did, for the chip popover.
export function TurnDetails({ t }: { t: Turn }) {
  const st = t.stats[t.playerId];
  const pts = ownTurnPoints(t);
  const brk = st?.breakSpaces ?? 0;
  const sections: [string, string][] = [];
  if (st) {
    const played = [
      ...st.animals.map((a) => `${a.name}${a.fromDisplay ? ' (display)' : ''} $${a.cost}`),
      ...st.sponsors.map((x) => `${x.name}${x.fromDisplay ? ' (display)' : ''}`),
    ];
    if (played.length) sections.push(['Played', played.join(', ')]);
    const built = st.buildings.filter((b) => STANDARD_BUILDINGS.test(b.type));
    if (built.length) sections.push(['Built', built.map((b) => `${buildingName(b.type)}${b.cost ? ` $${b.cost}` : ''}`).join(', ')]);
    const assoc = [
      ...st.projectsSupported.map((x) => `Project: ${x}`),
      ...(st.partnerZoos && !st.partnerZooContinents.length ? [`Partner zoo${st.partnerZoos > 1 ? ` ×${st.partnerZoos}` : ''}`] : []),
      ...(st.universityTypes.length
        ? st.universityTypes.map((u) => universityLabel(u))
        : st.universities
          ? [`University${st.universities > 1 ? ` ×${st.universities}` : ''}`]
          : []),
      ...st.partnerZooContinents.map((c) => `Partner zoo: ${c}`),
    ];
    if (assoc.length) sections.push(['Association', assoc.join(', ')]);
    const cards = [
      ...(st.displayCards.length ? [`took ${st.displayCards.map((c) => c.name).join(', ')}`] : []),
      ...(st.cardsDrawnDeck ? [`drew ${st.cardsDrawnDeck} from deck`] : []),
      ...(st.cardsFromEffects ? [`+${st.cardsFromEffects} from effects`] : []),
      ...(st.cardsDiscarded ? [`discarded ${st.cardsDiscarded}`] : []),
      ...(st.cardsSold ? [`sold ${st.cardsSold}`] : []),
      ...(st.cardsPouched ? [`pouched ${st.cardsPouched}`] : []),
    ];
    if (cards.length) sections.push(['Cards', cards.join(' · ')]);
    if (st.upgrades.length) sections.push(['Upgraded', st.upgrades.join(', ')]);
    const money = [
      ...(st.moneySpent.total ? [`spent $${st.moneySpent.total}`] : []),
      ...(st.moneyGained.total ? [`gained $${st.moneyGained.total}`] : []),
    ];
    if (money.length) sections.push(['Money', money.join(' · ')]);
  }
  return (
    <>
      <div className="tt-title">
        Turn {t.playerTurnNumber} · {turnActionsLabel(t)}
      </div>
      <div className="tt-row">
        <strong>
          {pts > 0 ? '+' : ''}
          {pts} points
        </strong>
        {brk > 0 && <span className="secondary">· break +{brk}</span>}
      </div>
      {sections.map(([label, text]) => (
        <div className="tt-section" key={label}>
          <span className="tt-label">{label}: </span>
          {text}
        </div>
      ))}
    </>
  );
}

// One chip per turn: action abbreviation over points scored. Shade = how much it scored.
export function TurnChip({ t, p }: { t: Turn; p: Player }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pts = ownTurnPoints(t);
  const kind = turnKind(t);
  const brk = t.stats[t.playerId]?.breakSpaces ?? 0;
  const style: React.CSSProperties =
    kind === 'big'
      ? { background: seriesVar(p), color: '#fff' }
      : kind === 'small'
        ? { background: `color-mix(in srgb, ${seriesVar(p)} 22%, var(--surface))` }
        : {};
  const show = (e: React.SyntheticEvent<HTMLElement>) => setAnchor(e.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  return (
    <>
      <span
        className={`turn-chip ${kind}`}
        style={style}
        tabIndex={0}
        aria-label={`Turn ${t.playerTurnNumber}: ${turnActionsLabel(t)}, ${pts} points`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <span className="turn-chip-action">{turnAbbr(t)}</span>
        <span className="turn-chip-pts">{pts > 0 ? `+${pts}` : pts}</span>
        {brk > 0 && <span className="turn-chip-brk">brk {brk}</span>}
        {(t.stats[t.playerId]?.upgrades ?? []).map((u, i) => (
          <span key={i} className="turn-chip-upg">
            ▲{ACTION_ABBR[u] ?? u}
          </span>
        ))}
      </span>
      {anchor &&
        createPortal(
          <div className="tt chip-tip" style={tipPosition(anchor)}>
            <TurnDetails t={t} />
          </div>,
          document.body,
        )}
    </>
  );
}

export function TempoCard({ game }: { game: GameAnalysis }) {
  const data = tempoSeries(game, 3);
  const breaks = tempoBreakMarkers(game);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Tempo</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            Points per turn, averaged over each player&apos;s last 3 turns. Late game, the player whose every
            action scores usually wins.
          </div>
        </div>
        <Legend players={game.players} kind="line" />
      </div>
      <TurnLineChart data={data} players={game.players} breaks={breaks} height={220} />
      <h3 className="secondary" style={{ margin: '14px 0 8px' }}>
        Last {LATE_GAME_TURNS} turns
      </h3>
      <div className="players">
        {game.players.map((p) => {
          const own = playerTurns(game, p.id);
          const s = tempoSummary(own.slice(-LATE_GAME_TURNS));
          return (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PlayerLabel p={p} />
              <div className="tiles">
                <div className="tile">
                  <div className="label">Points / turn</div>
                  <div className="value">{s.perTurn.toFixed(1)}</div>
                </div>
                <div className="tile">
                  <div className="label">Big turns</div>
                  <div className="value">{s.big}</div>
                </div>
                <div className="tile">
                  <div className="label">Non-scoring turns</div>
                  <div className="value">{s.dead}</div>
                </div>
                <div className="tile">
                  <div className="label">Cards + Build</div>
                  <div className="value">{s.cardsOrBuild}</div>
                </div>
              </div>
              <div className="chips">
                {own.slice(-LATE_GAME_TURNS).map((t) => (
                  <TurnChip key={t.index} t={t} p={p} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActionsByRoundCard({ game }: { game: GameAnalysis }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Actions by round</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            Every turn in order, with the points it scored. Darker means more points; gray turns scored{' '}
            {NON_SCORING_MAX} or less. Hover a turn to see what was played.
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Round</th>
              {game.players.map((p) => (
                <th key={p.id}>
                  <PlayerLabel p={p} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {game.rounds.map((r) => (
              <tr key={r.round}>
                <td className="secondary" style={{ whiteSpace: 'nowrap' }}>
                  Round {r.round}
                </td>
                {game.players.map((p) => {
                  const ts = playerTurns(game, p.id, r.round);
                  const s = tempoSummary(ts);
                  return (
                    <td key={p.id}>
                      <div className="chips">
                        {ts.map((t) => (
                          <TurnChip key={t.index} t={t} p={p} />
                        ))}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {s.points} pts · {s.perTurn.toFixed(1)}/turn · {s.big} big · {s.dead} non-scoring ·{' '}
                        {s.cardsOrBuild} Cards/Build
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BreaksCard({ game }: { game: GameAnalysis }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Break track</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            Who moved the break token, and how. Driving breaks brings income sooner and gives your opponent fewer
            turns to set up.
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Break</th>
              <th>Triggered by</th>
              <th>How</th>
              {game.players.map((p) => (
                <th key={p.id} className="n">
                  {p.name} spaces
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {game.rounds.map((r) => {
              const brk = r.breakIndex != null ? game.breaks[r.breakIndex] : null;
              const trig = game.players.find((p) => p.id === brk?.triggeredBy);
              return (
                <tr key={r.round}>
                  <td className="secondary">{brk ? `Break ${brk.index + 1}` : `Round ${r.round} (no break)`}</td>
                  <td>{trig ? <PlayerLabel p={trig} /> : <span className="muted">–</span>}</td>
                  <td className="secondary">{brk?.triggerSource ?? '–'}</td>
                  {game.players.map((p) => {
                    const st = r.perPlayer[p.id]?.stats;
                    const by = Object.entries(st?.breakBySource ?? {}).sort((a, b) => b[1] - a[1]);
                    return (
                      <td key={p.id} className="n" title={by.map(([k, v]) => `${k}: ${v}`).join('\n')}>
                        {st?.breakSpaces ?? 0}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="players" style={{ marginTop: 14 }}>
        {game.players.map((p) => {
          const t = game.totals[p.id];
          const by = Object.entries(t.breakBySource).sort((a, b) => b[1] - a[1]);
          const triggered = game.breaks.filter((b) => b.triggeredBy === p.id).length;
          return (
            <div key={p.id} style={{ fontSize: 13 }}>
              <PlayerLabel p={p} />
              <div className="secondary" style={{ marginTop: 4 }}>
                {t.breakSpaces} spaces · triggered {triggered} of {game.breaks.length} breaks
              </div>
              <div className="muted">{by.map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EnclosuresCard({ game }: { game: GameAnalysis }) {
  const rows: { label: string; snap: GameAnalysis['enclosuresAtEnd'] }[] = [
    ...game.rounds.map((r) => ({ label: `Start of round ${r.round}`, snap: game.enclosuresAtRoundStart[r.round] ?? {} })),
    { label: 'End of game', snap: game.enclosuresAtEnd },
  ];
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Open enclosures</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            Empty standard enclosures (by size) and open spaces in special enclosures at the start of each round. Built-but-empty enclosures are money
            and actions that haven&apos;t scored yet.
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              {game.players.map((p) => (
                <th key={p.id}>
                  <PlayerLabel p={p} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="secondary" style={{ whiteSpace: 'nowrap' }}>
                  {row.label}
                </td>
                {game.players.map((p) => {
                  const s = row.snap[p.id];
                  if (!s) return <td key={p.id} className="muted">–</td>;
                  return (
                    <td key={p.id}>
                      <div className="chips" style={{ alignItems: 'center' }}>
                        {s.open.map((size, i) => (
                          <span key={i} className="chip">
                            Size {size}
                          </span>
                        ))}
                        {s.special
                          .filter((x) => x.capacity > x.used)
                          .map((x) => (
                            <span key={x.type} className="chip">
                              {enclosureLabel(x.type)} · {x.capacity - x.used} open
                            </span>
                          ))}
                        {!s.open.length && !s.special.some((x) => x.capacity > x.used) && (
                          <span className="muted">none open</span>
                        )}
                        <span className="muted" style={{ fontSize: 12 }}>
                          · {s.filled} filled
                          {s.special.some((x) => x.capacity <= x.used)
                            ? ` · ${s.special
                                .filter((x) => x.capacity <= x.used)
                                .map((x) => `${enclosureLabel(x.type)} full`)
                                .join(', ')}`
                            : ''}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
