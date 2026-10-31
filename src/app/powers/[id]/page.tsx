import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Download, Eye, Play } from "lucide-react";
import { getSetlist } from "@/lib/setlists";
import { displayChord } from "@/lib/chords";
import { mergeEntries } from "@/lib/dividers";
import {
  buildPowerPrecacheUrls,
  formatServiceDate,
  powerDescription,
  songHref,
  type SongLinkContext,
} from "@/lib/powerView";
import PrecachePower from "@/components/PrecachePower";

// generateMetadata y la página piden el mismo power: con cache() se lee una sola vez por pedido.
const loadSetlist = cache((id: string) => getSetlist(id).catch(() => null));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const setlist = await loadSetlist(id);
  if (!setlist) return { title: "Power no encontrado" };
  const description = powerDescription(setlist.songs.length, setlist.serviceDate);
  return {
    title: setlist.title,
    description,
    openGraph: { title: setlist.title, description },
  };
}

export default async function PublicPowerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const setlist = await loadSetlist(id);
  if (!setlist) notFound();

  const entries = mergeEntries(setlist.songs, setlist.dividers);
  let songIndex = -1;
  // Los divisores viajan en la URL para que el visor muestre "ALABANZA", "OFRENDA"... entre canciones.
  const linkCtx: SongLinkContext = {
    ids: setlist.songs.map((s) => s.id),
    semitones: setlist.songs.map((s) => s.semitones),
    dividers: setlist.dividers,
  };
  const serviceDate = formatServiceDate(setlist.serviceDate);

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 flex items-center justify-between px-5">
        <div>
          <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Power</span>
          <h1 className="font-display text-2xl text-mist">{setlist.title}</h1>
          {serviceDate && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-lilac-light">
              <CalendarDays size={14} aria-hidden />
              <time dateTime={setlist.serviceDate ?? undefined}>{serviceDate}</time>
            </p>
          )}
        </div>
        {setlist.songs.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/powers/${setlist.id}/vista-previa`}
              aria-label="Vista previa del PowerPoint"
              className="flex h-10 items-center gap-1.5 rounded-full bg-plum px-3.5 text-sm text-mist"
            >
              <Eye size={16} />
              Vista previa
            </Link>
            <a
              href={`/api/setlists/${setlist.id}/export-pptx`}
              aria-label="Exportar a PowerPoint"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-plum text-mist"
            >
              <Download size={18} />
            </a>
          </div>
        )}
      </div>

      {setlist.notes && (
        <p className="mx-5 mb-5 whitespace-pre-wrap rounded-2xl border border-plum/60 bg-night/40 px-4 py-3 text-sm text-lilac-light">
          {setlist.notes}
        </p>
      )}

      {setlist.songs.length === 0 ? (
        <p className="px-5 text-sm text-lilac-light">Este power no tiene canciones todavía.</p>
      ) : (
        <>
          <div className="px-5 pb-4">
            <Link
              href={songHref(linkCtx, 0, true) ?? "/canciones"}
              className="flex items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-night"
            >
              <Play size={16} />
              Presentar desde el principio
            </Link>
            <PrecachePower urls={buildPowerPrecacheUrls(linkCtx)} />
          </div>
          <ul className="flex flex-col gap-2 px-5 pb-10">
          {entries.map((entry, n) => {
            if (entry.kind === "divider") {
              return (
                <li
                  key={`divider-${n}`}
                  className="px-1 pt-3 text-xs font-semibold tracking-[0.3em] text-accent"
                >
                  {entry.name}
                </li>
              );
            }
            const song = entry.song;
            const i = ++songIndex;
            return (
            <li key={song.id}>
              <Link
                href={songHref(linkCtx, i) ?? "/canciones"}
                className="flex items-center gap-3 rounded-2xl border border-plum/60 bg-night/40 px-4 py-3 active:bg-night/70"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-plum/60 text-xs text-lilac-light">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-mist">{song.title}</span>
                  <span className="block truncate text-sm text-lilac-light">{song.artist}</span>
                </span>
                <span className="shrink-0 font-mono text-sm text-chord-gold">
                  {displayChord(song.originalKey, song.semitones, "en", song.originalKey)}
                </span>
              </Link>
            </li>
            );
          })}
          </ul>
        </>
      )}
    </main>
  );
}
