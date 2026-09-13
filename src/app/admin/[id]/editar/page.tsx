import { notFound } from "next/navigation";
import { getSong } from "@/lib/songs";
import SongForm from "@/components/SongForm";

export default async function EditarCancionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const song = await getSong(id).catch(() => null);
  if (!song) notFound();

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Editar</span>
        <h1 className="font-display text-2xl text-mist">{song.title}</h1>
      </div>
      <SongForm initial={song} />
    </main>
  );
}
