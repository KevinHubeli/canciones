import { notFound } from "next/navigation";
import { getSong } from "@/lib/songs";
import SongViewer from "@/components/SongViewer";

export default async function SongPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ set?: string; i?: string; t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const song = await getSong(id).catch(() => null);
  if (!song) notFound();

  const setIds = sp.set ? sp.set.split(",").filter(Boolean) : undefined;
  const index = sp.i ? Number(sp.i) : undefined;
  const setSemitones = sp.t ? sp.t.split(",").map((n) => Number(n) || 0) : undefined;
  const initialSemitones =
    setSemitones && index !== undefined ? setSemitones[index] : undefined;

  return (
    <SongViewer
      song={song}
      setIds={setIds}
      setSemitones={setSemitones}
      index={index}
      initialSemitones={initialSemitones}
    />
  );
}
