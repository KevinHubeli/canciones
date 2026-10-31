import { UUID_RE } from "@/lib/validation";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getSong } from "@/lib/songs";
import SongVersions from "@/components/SongVersions";


export default async function HistorialCancionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requireAdmin())) redirect("/admin/login");

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  // Si la canción ya no existe (o está en la papelera) igual se pueden ver sus versiones guardadas.
  const song = await getSong(id).catch(() => null);

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">
          Versiones anteriores
        </span>
        <h1 className="font-display text-2xl text-mist">
          {song ? song.title : "Canción que ya no está"}
        </h1>
      </div>
      <SongVersions
        songId={id}
        current={
          song
            ? {
                title: song.title,
                artist: song.artist,
                originalKey: song.originalKey,
                body: song.body,
              }
            : null
        }
      />
    </main>
  );
}
