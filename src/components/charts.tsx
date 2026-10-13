import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { Player } from '../lib/types';
import { seriesVar, turnActionsLabel, type RoundBar, type TurnPoint } from '../lib/derive';

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 12 };

export function Legend({ players, kind }: { players: Player[]; kind: 'line' | 'bar' }) {
  return (
    <div className="legend">
      {players.map((p) => (
        <span key={p.id}>
          {kind === 'line' ? (
            <span className="swatch-line" style={{ background: seriesVar(p) }} />
          ) : (
            <span className="dot" style={{ background: seriesVar(p), borderRadius: 2 }} />
          )}
          {p.name}
        </span>
      ))}
    </div>
  );
}

function TurnTooltip({
  active,
  payload,
  players,
  unit,
}: TooltipProps<number, string> & { players: Player[]; unit?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as TurnPoint;
  const t = point.turn;
  const actor = t ? players.find((p) => p.id === t.playerId) : null;
  return (
    <div className="tt">
      <div className="tt-title">
        {point.label}
        {t ? ` · round ${t.round}` : ''}
      </div>
      {players.map((p) => (
        <div className="tt-row" key={p.id}>
          <span className="swatch-line" style={{ background: seriesVar(p) }} />
          <strong>
            {unit === '$' ? '$' : ''}
            {String(point[p.id] ?? '–')}
          </strong>
          <span className="secondary">{p.name}</span>
        </div>
      ))}
      {t && actor && (
        <div className="tt-note">
          {actor.name}: {turnActionsLabel(t)}
        </div>
      )}
    </div>
  );
}

// Whole turns every 5 (or every turn for very short games), on the per-player turn axis.
function turnTicks(data: TurnPoint[]): number[] {
  const min = Math.min(...data.map((d) => d.x));
  const max = Math.floor(Math.max(0, ...data.map((d) => d.x)));
  const step = max <= 12 ? 1 : 5;
  const ticks: number[] = [];
  for (let x = 0; x <= max; x += step) if (x >= min) ticks.push(x);
  if (min > 0 && ticks[0] !== Math.ceil(min)) ticks.unshift(Math.ceil(min));
  return ticks;
}

export function TurnLineChart({
  data,
  players,
  breaks,
  unit,
  height = 280,
}: {
  data: TurnPoint[];
  players: Player[];
  breaks: { x: number; label: string }[];
  unit?: string;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            allowDecimals={false}
            ticks={turnTicks(data)}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
          {breaks.map((b) => (
            <ReferenceLine
              key={b.label}
              x={b.x + 0.25}
              stroke="var(--axis)"
              label={{ value: b.label, position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 11 }}
            />
          ))}
          <Tooltip
            content={<TurnTooltip players={players} unit={unit} />}
            cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
          />
          {players.map((p) => (
            <Line
              key={p.id}
              type="linear"
              dataKey={p.id}
              name={p.name}
              stroke={seriesVar(p)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarTooltip({
  active,
  payload,
  label,
  players,
  unit,
}: TooltipProps<number, string> & { players: Player[]; unit?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as RoundBar;
  return (
    <div className="tt">
      <div className="tt-title">{label}</div>
      {players.map((p) => (
        <div className="tt-row" key={p.id}>
          <span className="dot" style={{ background: seriesVar(p), borderRadius: 2 }} />
          <strong>
            {row[p.id] == null ? '–' : `${unit === '$' ? '$' : ''}${row[p.id]}`}
          </strong>
          <span className="secondary">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function RoundBarChart({
  data,
  players,
  unit,
  height = 240,
}: {
  data: RoundBar[];
  players: Player[];
  unit?: string;
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="round" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--axis)' }} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip content={<BarTooltip players={players} unit={unit} />} cursor={{ fill: 'var(--surface-2)' }} />
          {players.map((p) => (
            <Bar
              key={p.id}
              dataKey={p.id}
              name={p.name}
              fill={seriesVar(p)}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarList({ rows, color, unit = '$' }: { rows: [string, number][]; color: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <div className="muted">None</div>;
  return (
    <div className="barlist">
      {rows.map(([label, v]) => (
        <div className="barlist-row" key={label}>
          <span className="secondary" title={label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <div className="barlist-track">
            <div className="barlist-fill" style={{ width: `${(v / max) * 100}%`, background: color }} />
          </div>
          <span className="num" style={{ textAlign: 'right' }}>
            {unit}
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}
