import { notFound } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { getSetlist } from "@/lib/setlists";
import { displayChord } from "@/lib/chords";

export default async function PublicPowerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const setlist = await getSetlist(id).catch(() => null);
  if (!setlist) notFound();

  const setParam = setlist.songs.map((s) => s.id).join(",");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 flex items-center justify-between px-5">
        <div>
          <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Power</span>
          <h1 className="font-display text-2xl text-mist">{setlist.title}</h1>
        </div>
        {setlist.songs.length > 0 && (
          <a
            href={`/api/setlists/${setlist.id}/export-pptx`}
            aria-label="Exportar a PowerPoint"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-plum/60 text-mist"
          >
            <Download size={18} />
          </a>
        )}
      </div>

      {setlist.songs.length === 0 ? (
        <p className="px-5 text-sm text-lilac-light">Este power no tiene canciones todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2 px-5 pb-10">
          {setlist.songs.map((song, i) => (
            <li key={song.id}>
              <Link
                href={`/canciones/${song.id}?set=${setParam}&i=${i}`}
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
                  {displayChord(song.originalKey, song.semitones, "en")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
