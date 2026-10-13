import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActionUse, AnimalPlayed, CardRef, GameAnalysis, Player, Turn } from '../lib/types';
import { cardInfo } from '../lib/cards';
import {
  HEX_RATIO,
  SPECIAL_ENCLOSURE_ICON,
  actionIconStyle,
  actionVariantStyle,
  buildingTileStyle,
  hasIcon,
  iconStyle,
  PARTNER_RATIO,
  partnerZooStyle,
  projectIcon,
  UNIVERSITY_RATIO,
  universityLabel,
  universityStyle,
} from '../lib/icons';
import { STANDARD_BUILDINGS, ownTurnPoints, playerTurns, seriesVar, turnKind } from '../lib/derive';
import { tipPosition } from '../lib/tooltip';
import { TurnDetails } from './TempoViews';

const ICON = 22;

function Icon({
  name,
  size = ICON,
  ring,
  ringWidth = 2,
}: {
  name: string;
  size?: number;
  ring?: string;
  ringWidth?: number;
}) {
  const style = iconStyle(name, size);
  if (!style) return null;
  return (
    <span
      className="tl-icon"
      style={{ ...style, width: size, height: size, boxShadow: ring ? `0 0 0 ${ringWidth}px ${ring}` : undefined }}
    />
  );
}

// Two categories in one circle, e.g. predator + bear.
function SplitIcon({ a, b }: { a: string; b: string }) {
  return (
    <span className="tl-icon tl-split" style={{ width: ICON, height: ICON }}>
      <span style={{ width: ICON / 2 }}>
        <Icon name={a} />
      </span>
      <span style={{ width: ICON / 2 }}>
        <span style={{ marginLeft: -ICON / 2, display: 'block' }}>
          <Icon name={b} />
        </span>
      </span>
    </span>
  );
}

function AnimalIcon({ animal }: { animal: AnimalPlayed }) {
  const cats = [...new Set(animal.categories ?? cardInfo(animal.id)?.categories ?? [])].filter(hasIcon);
  if (cats.length >= 2) return <SplitIcon a={cats[0]} b={cats[1]} />;
  if (cats.length === 1) return <Icon name={cats[0]} />;
  return <span className="tl-badge tl-animal">A</span>;
}

function SponsorBadge({ card }: { card: CardRef }) {
  const info = cardInfo(card.id);
  const tag = [...(info?.categories ?? []), ...(info?.continents ?? [])].find(hasIcon);
  return <span className="tl-badge tl-sponsor">{tag ? <Icon name={tag} size={16} /> : 'S'}</span>;
}

// The action card used, drawn like BGA's player panel: blue border (purple at level II) and a
// corner badge for variant cards. X-token turns show the card faded with an X.
function ActionIcon({ a }: { a: ActionUse }) {
  const style = actionIconStyle(a.action);
  if (!style) return <span className="tl-badge">{a.action.slice(0, 1)}</span>;
  const variant = actionVariantStyle(a.action, a.cardType, a.level);
  return (
    <span className={`tl-action${a.level === 2 ? ' lvl2' : ''}${a.xToken ? ' xtoken' : ''}`}>
      <span className="tl-action-img" style={style} />
      {variant && <span className="tl-action-variant" style={variant} />}
      {a.xToken && <span className="tl-action-x">X</span>}
    </span>
  );
}

const HEX_W = 26;

// One hex per building, like the tiles on the zoo map.
function BuildingHex({ type, size }: { type: string; size: number }) {
  const dims = { width: HEX_W, height: HEX_W * HEX_RATIO };
  if (type === 'kiosk' || type === 'pavilion') {
    return <span className="tl-hex" style={{ ...dims, ...buildingTileStyle(type, HEX_W) }} title={type} />;
  }
  if (/^size-\d$/.test(type)) {
    return (
      <span className="tl-hex tl-hex-num" style={{ ...dims, ...buildingTileStyle('enclosure', HEX_W) }} title={`Size ${size} enclosure`}>
        {size}
      </span>
    );
  }
  const icon = SPECIAL_ENCLOSURE_ICON[type];
  return (
    <span className="tl-hex tl-hex-special" style={dims} title={type.replace(/-/g, ' ')}>
      {icon ? <Icon name={icon} size={14} /> : type.slice(0, 1).toUpperCase()}
    </span>
  );
}

// Small purple version of the action card, marking the turn it was upgraded to level II.
function UpgradeMarker({ action }: { action: string }) {
  const style = actionIconStyle(action);
  return (
    <span className="tl-upgrade" title={`Upgraded ${action}`}>
      {style ? <span className="tl-upgrade-img" style={style} /> : action.slice(0, 1)}
      <span className="tl-upgrade-arrow">▲</span>
    </span>
  );
}

// One badge per stack item; bottom of the column is the first item.
function turnItems(t: Turn): React.ReactNode[] {
  const st = t.stats[t.playerId];
  if (!st) return [];
  const items: React.ReactNode[] = t.actions.map((a, i) => <ActionIcon key={`act${i}`} a={a} />);
  st.animals.forEach((a, i) => items.push(<AnimalIcon key={`a${i}`} animal={a} />));
  st.projectIds.forEach((id, i) => {
    const icon = projectIcon(id, st.projectsSupported[i] ?? '');
    items.push(
      icon ? (
        <Icon key={`p${i}`} name={icon} ring="var(--project)" ringWidth={2.5} />
      ) : (
        <span key={`p${i}`} className="tl-badge tl-project">P</span>
      ),
    );
  });
  st.sponsors.forEach((c, i) => items.push(<SponsorBadge key={`s${i}`} card={c} />));
  st.partnerZooContinents.forEach((c, i) => {
    const style = partnerZooStyle(c);
    items.push(
      style ? (
        <span key={`z${i}`} className="tl-partner" style={{ ...style, width: 26, height: 26 * PARTNER_RATIO }} title={`Partner zoo: ${c}`} />
      ) : null,
    );
  });
  st.universityTypes.forEach((u, i) => {
    const style = universityStyle(u);
    items.push(
      style ? (
        <span
          key={`u${i}`}
          className="tl-partner"
          style={{ ...style, width: 28, height: 28 * UNIVERSITY_RATIO }}
          title={universityLabel(u)}
        />
      ) : (
        <span key={`u${i}`} className="tl-badge" title={universityLabel(u)}>
          U
        </span>
      ),
    );
  });
  st.buildings
    .filter((b) => STANDARD_BUILDINGS.test(b.type))
    .forEach((b, i) => items.push(<BuildingHex key={`b${i}`} type={b.type} size={b.size} />));
  const cards = st.cardsDrawnDeck + st.cardsSnapped + st.cardsTakenInRange;
  st.upgrades.forEach((u, i) => items.push(<UpgradeMarker key={`up${i}`} action={u} />));
  if (cards) {
    items.push(
      <span key="c" className="tl-badge tl-cards">
        +{cards}
      </span>,
    );
  }
  return items.filter(Boolean);
}

function TimelineCell({ t, p, breakBefore }: { t: Turn; p: Player; breakBefore: boolean }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const pts = ownTurnPoints(t);
  const kind = turnKind(t);
  const brk = t.stats[t.playerId]?.breakSpaces ?? 0;
  const ptsStyle: React.CSSProperties =
    kind === 'big'
      ? { background: seriesVar(p), color: '#fff' }
      : kind === 'small'
        ? { background: `color-mix(in srgb, ${seriesVar(p)} 22%, var(--surface))` }
        : {};
  const show = (e: React.SyntheticEvent<HTMLElement>) => setAnchor(e.currentTarget.getBoundingClientRect());
  const hide = () => setAnchor(null);
  return (
    <div
      className={`tl-cell${breakBefore ? ' tl-break' : ''}`}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <div className="tl-stack">{turnItems(t)}</div>
      <span className={`tl-pts ${kind}`} style={ptsStyle}>
        {pts > 0 ? `+${pts}` : pts}
      </span>
      <span className="tl-brk">{brk > 0 ? `brk ${brk}` : ''}</span>
      {anchor &&
        createPortal(
          <div className="tt chip-tip" style={tipPosition(anchor)}>
            <TurnDetails t={t} />
          </div>,
          document.body,
        )}
    </div>
  );
}

export function TimelineCard({ game }: { game: GameAnalysis }) {
  const lanes = game.players.map((p) => ({ p, turns: playerTurns(game, p.id) }));
  const maxTurns = Math.max(0, ...lanes.map((l) => l.turns.length));
  return (
    <div className="card">
      <div className="card-head">
        <h2>Timeline</h2>
      </div>
      <div className="table-wrap">
        <div className="tl" style={{ minWidth: 26 + maxTurns * 33 }}>
          <div className="tl-lane tl-header">
            <div className="tl-name" />
            {Array.from({ length: maxTurns }, (_, i) => (
              <div key={i} className="tl-cell tl-num">
                {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}
              </div>
            ))}
          </div>
          {lanes.map(({ p, turns }) => (
            <div key={p.id} className="tl-lane">
              <div className="tl-name" title={p.name}>
                <span className="dot" style={{ background: seriesVar(p) }} />
                <span className="tl-name-text">{p.name}</span>
              </div>
              {turns.map((t, i) => (
                <TimelineCell key={t.index} t={t} p={p} breakBefore={i > 0 && t.round !== turns[i - 1].round} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
