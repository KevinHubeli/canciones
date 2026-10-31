import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSong } from "@/lib/songs";
import SongViewer from "@/components/SongViewer";
import { decodeDividers } from "@/lib/dividers";

// generateMetadata y la página piden la misma canción: con cache() se lee una sola vez por pedido.
const loadSong = cache((id: string) => getSong(id).catch(() => null));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const song = await loadSong(id);
  if (!song) return { title: "Canción no encontrada" };
  const description = `${song.artist} · Tono ${song.originalKey}`;
  return {
    title: `${song.title} — ${song.artist}`,
    description,
    openGraph: { title: song.title, description },
  };
}

export default async function SongPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ set?: string; i?: string; t?: string; d?: string; s?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const song = await loadSong(id);
  if (!song) notFound();

  const setIds = sp.set ? sp.set.split(",").filter(Boolean) : undefined;
  const index = sp.i ? Number(sp.i) : undefined;
  const setSemitones = sp.t ? sp.t.split(",").map((n) => Number(n) || 0) : undefined;
  const initialSemitones =
    setSemitones && index !== undefined ? setSemitones[index] : undefined;

  const setDividers = decodeDividers(sp.d, setIds?.length ?? 0);

  return (
    <SongViewer
      song={song}
      setIds={setIds}
      setSemitones={setSemitones}
      index={index}
      setDividers={setDividers}
      showDividerIntro={sp.s === "1"}
      initialSemitones={initialSemitones}
    />
  );
}
