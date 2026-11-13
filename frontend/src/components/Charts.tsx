import { useState } from 'react';
import { rupiah } from '../lib/api';

/** Palet kategorikal tetap (urutan tidak berputar). Teks tetap memakai warna tinta, bukan warna seri. */
export const SERIES = ['#2a78d6', '#eb6834'] as const;

const short = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return v.toLocaleString('id-ID');
};
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const periodeLabel = (p: string) => `${BULAN[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;

/** Batas atas sumbu yang "rapi" (1, 2, 2.5, 5 × 10^n). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Grafik batang berkelompok per bulan (2 seri) dengan tooltip saat hover. */
export function GroupedBars({ data, series }: {
  data: { label: string; values: number[] }[];
  series: { label: string; color: string }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 220, L = 52, B = 24, T = 8;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => d.values)));
  const band = (W - L) / data.length;
  const gap = 2;
  const bw = Math.min(18, (band * 0.7 - gap * (series.length - 1)) / series.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((f) => f * max);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.label).join(' dan ') + ' per bulan'}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">{short(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = L + band * i + (band - (bw * series.length + gap * (series.length - 1))) / 2;
          return (
            <g key={d.label}>
              {hover === i && <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="#f1f5f9" />}
              {d.values.map((v, s) => {
                const h = Math.max(0, H - B - y(v));
                const x = x0 + s * (bw + gap);
                const r = Math.min(4, bw / 2, h);
                return h > 0 ? (
                  <path key={s} fill={series[s].color}
                    d={`M${x},${H - B} V${H - B - h + r} Q${x},${H - B - h} ${x + r},${H - B - h} H${x + bw - r} Q${x + bw},${H - B - h} ${x + bw},${H - B - h + r} V${H - B} Z`} />
                ) : null;
              })}
              <text x={L + band * i + band / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#64748b">{d.label}</text>
              <rect x={L + band * i} y={0} width={band} height={H} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={hover < data.length / 2
            ? { left: `${((L + band * (hover + 1)) / W) * 100}%` }
            : { right: `${100 - ((L + band * hover) / W) * 100}%` }}>
          <div className="mb-1 font-semibold text-slate-800">{data[hover].label}</div>
          {series.map((s, k) => (
            <div key={s.label} className="flex items-center gap-2 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.label}: <b className="text-slate-800">{rupiah(data[hover].values[k])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Daftar batang horizontal satu seri (peringkat). */
export function RankBars({ items, color = SERIES[0], format = rupiah }: {
  items: { label: string; sub?: string; value: number }[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="py-6 text-center text-sm text-slate-400">Belum ada data</div>;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label} title={`${i.label}: ${format(i.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-slate-700">{i.label}{i.sub && <span className="ml-1 font-normal text-slate-400">{i.sub}</span>}</span>
            <span className="shrink-0 font-semibold text-slate-800">{format(i.value)}</span>
          </div>
          <div className="h-2 rounded bg-slate-100">
            <div className="h-2 rounded" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Rasio dua bagian (mis. dibayar vs outstanding) sebagai satu batang bertumpuk. */
export function RatioBar({ parts }: { parts: { label: string; value: number; color: string; count?: number }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-4 gap-[2px] overflow-hidden rounded bg-slate-100">
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} title={`${p.label}: ${rupiah(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {parts.map((p) => (
          <div key={p.label}>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              {p.label}
            </div>
            <div className="text-lg font-bold text-slate-800">{total > 0 ? Math.round((p.value / total) * 100) : 0}%</div>
            <div className="text-xs text-slate-500">{rupiah(p.value)}{p.count !== undefined && ` · ${p.count} item`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
