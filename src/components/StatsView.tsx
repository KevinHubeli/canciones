"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import type { CountItem, Stats } from "@/lib/statsCalc";

const STALE_OPTIONS = [
  { days: 30, label: "1 mes" },
  { days: 60, label: "2 meses" },
  { days: 90, label: "3 meses" },
  { days: 180, label: "6 meses" },
] as const;

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-31" -> "31/10/2026" */
function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-plum/60 bg-night/40 p-4">
      <h2 className="font-display text-lg text-mist">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-lilac-light">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-plum/60 bg-night/40 px-3 py-3 text-center">
      <p className="font-display text-2xl text-chord-gold">{value}</p>
      <p className="text-xs text-lilac-light">{label}</p>
    </div>
  );
}

/** Barras horizontales: el número siempre está escrito, la barra es refuerzo visual. */
function BarList({
  rows,
  empty,
}: {
  rows: { key: string; label: React.ReactNode; value: number; valueText?: string; sub?: string }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-lilac-light">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-mist">{row.label}</span>
            <span className="shrink-0 tabular-nums text-lilac-light">{row.valueText ?? row.value}</span>
          </div>
          <div aria-hidden className="mt-1 h-2 overflow-hidden rounded-full bg-plum">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
          {row.sub && <p className="mt-0.5 text-xs text-lilac-light">{row.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

function countRows(items: CountItem[]) {
  return items.map((i) => ({ key: i.label, label: i.label, value: i.count }));
}

/** Powers por mes: gráfico de columnas en SVG, con una tabla equivalente para lectores de pantalla. */
function MonthsChart({ data }: { data: Stats["setlistsByMonth"] }) {
  const W = 360;
  const H = 150;
  const top = 18;
  const bottom = 26;
  const plotH = H - top - bottom;
  const max = Math.max(...data.map((d) => d.count), 1);
  const slot = W / data.length;
  const barW = slot * 0.62;
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Powers armados por mes en el último año: ${total} en total. El detalle está en la tabla.`}
        className="w-full"
      >
        <line
          x1={0}
          x2={W}
          y1={top + plotH}
          y2={top + plotH}
          className="stroke-plum"
          strokeWidth={1}
        />
        {data.map((d, i) => {
          const h = d.count === 0 ? 0 : Math.max(3, (d.count / max) * plotH);
          const x = i * slot + (slot - barW) / 2;
          return (
            <g key={d.month}>
              <title>{`${monthLabel(d.month)}: ${plural(d.count, "power", "powers")}`}</title>
              <rect
                x={x}
                y={top + plotH - h}
                width={barW}
                height={h}
                rx={3}
                className="fill-accent"
              />
              {d.count > 0 && (
                <text
                  x={x + barW / 2}
                  y={top + plotH - h - 4}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-mist"
                >
                  {d.count}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                className="fill-lilac-light"
              >
                {MONTH_NAMES[Number(d.month.slice(5, 7)) - 1]}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Powers armados por mes</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Powers</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{monthLabel(d.month)}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function StatsView() {
  const [days, setDays] = useState<number>(60);
  const [loaded, setLoaded] = useState<{ days: number; stats: Stats } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/stats?days=${days}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (cancelled) return;
        setError(null);
        setLoaded({ days, stats: data.stats });
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos calcular las estadísticas.");
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const stats = loaded?.stats ?? null;
  if (!stats) {
    if (error) {
      return (
        <p role="alert" className="mx-5 rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          {error}
        </p>
      );
    }
    return <Spinner label="Calculando estadísticas..." />;
  }

  const refreshing = loaded!.days !== days;
  const staleLabel = STALE_OPTIONS.find((o) => o.days === days)?.label ?? `${days} días`;
  const withChords = stats.totals.songs - stats.totals.withoutChords;

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      {error && (
        <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Tile value={stats.totals.songs} label="canciones" />
        <Tile value={stats.totals.setlists} label="powers" />
        <Tile value={stats.totals.withoutChords} label="sin acordes" />
      </div>
      <p className="-mt-2 text-xs text-lilac-light">
        {plural(withChords, "canción tiene", "canciones tienen")} acordes cargados. La fecha de uso de
        un power es la del culto, o la de su última edición si no tiene.
      </p>

      <Card title="Las más usadas" hint="Canciones que más veces estuvieron en un power.">
        <BarList
          empty="Todavía no hay powers con canciones."
          rows={stats.topUsed.map((s) => ({
            key: s.id,
            label: (
              <Link href={`/canciones/${s.id}`} className="hover:underline">
                {s.title}
              </Link>
            ),
            value: s.uses,
            valueText: plural(s.uses, "uso", "usos"),
            sub: `Último uso: ${formatDay(s.lastUsed)}`,
          }))}
        />
      </Card>

      <Card
        title="Hace mucho que no se usan"
        hint="Canciones que no aparecen en ningún power desde hace más de:"
      >
        <div role="group" aria-label="Tiempo sin uso" className="mb-3 flex flex-wrap gap-1.5">
          {STALE_OPTIONS.map((o) => (
            <button
              key={o.days}
              onClick={() => setDays(o.days)}
              aria-pressed={days === o.days}
              className={`rounded-full px-3 py-1 text-xs ${
                days === o.days ? "bg-accent font-semibold text-night" : "bg-plum text-mist"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div aria-busy={refreshing} className={refreshing ? "opacity-50" : ""}>
          <p className="mb-2 text-sm text-lilac-light">
            {stats.staleTotal === 0
              ? `Todas las canciones se usaron en los últimos ${staleLabel}.`
              : `${plural(stats.staleTotal, "canción", "canciones")} sin usar hace más de ${staleLabel}${
                  stats.neverUsed > 0
                    ? ` (${stats.neverUsed === 1 ? "1 nunca se usó" : `${stats.neverUsed} nunca se usaron`})`
                    : ""
                }.`}
          </p>
          {stats.stale.length > 0 && (
            <ul className="flex flex-col gap-1">
              {stats.stale.map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline justify-between gap-3 rounded-xl bg-night/60 px-3 py-1.5 text-sm"
                >
                  <Link href={`/canciones/${s.id}`} className="min-w-0 truncate text-mist hover:underline">
                    {s.title}
                  </Link>
                  <span className="shrink-0 text-xs text-lilac-light">
                    {s.lastUsed === null ? "Nunca se usó" : `Último uso: ${formatDay(s.lastUsed)}`}
                  </span>
                </li>
              ))}
              {stats.staleTotal > stats.stale.length && (
                <li className="pt-1 text-center text-xs text-lilac-light">
                  Mostramos {stats.stale.length} de {stats.staleTotal}.
                </li>
              )}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Powers por mes" hint="Últimos 12 meses.">
        <MonthsChart data={stats.setlistsByMonth} />
      </Card>

      <Card title="Tonos originales" hint="En qué tono está cargada cada canción.">
        <BarList empty="No hay canciones." rows={countRows(stats.keys)} />
      </Card>

      <Card title="Canciones por etiqueta" hint="Una canción puede tener más de una etiqueta.">
        <BarList empty="No hay canciones." rows={countRows(stats.tags)} />
      </Card>
    </div>
  );
}
