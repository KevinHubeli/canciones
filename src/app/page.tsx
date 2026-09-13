import Link from "next/link";
import { Search } from "lucide-react";
import { listSongs } from "@/lib/songs";

// Siempre al día: "agregadas últimamente" no debe quedar cacheada del build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { songs: recent } = await listSongs({ limit: 5, offset: 0 }).catch(() => ({
    songs: [],
    hasMore: false,
  }));

  return (
    <main className="flex flex-1 flex-col items-center px-5 pt-14">
      <div className="mb-8 flex flex-col items-center text-center animate-fade-in">
        <span className="mb-3 text-xs uppercase tracking-[0.3em] text-lilac-light">
          Nuestro cancionero
        </span>
        <h1 className="font-display text-3xl text-mist sm:text-4xl">Cancionero</h1>
        <p className="mt-4 max-w-xs text-sm text-lilac-light">
          Letra y acordes de nuestros temas, listos para tocar desde el celular.
        </p>
      </div>

      <Link
        href="/canciones"
        className="mb-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-accent py-3 text-sm font-semibold text-night"
      >
        <Search size={18} />
        Buscar una canción
      </Link>

      {recent.length > 0 && (
        <div className="w-full max-w-sm">
          <span className="mb-3 block text-xs uppercase tracking-[0.3em] text-lilac-light">
            Agregadas últimamente
          </span>
          <ul className="flex flex-col gap-2">
            {recent.map((song) => (
              <li key={song.id}>
                <Link
                  href={`/canciones/${song.id}`}
                  className="flex items-center justify-between rounded-2xl border border-plum/60 bg-night/40 px-4 py-3"
                >
                  <span>
                    <span className="block font-medium text-mist">{song.title}</span>
                    <span className="block text-sm text-lilac-light">{song.artist}</span>
                  </span>
                  <span className="font-mono text-sm text-chord-gold">{song.originalKey}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
