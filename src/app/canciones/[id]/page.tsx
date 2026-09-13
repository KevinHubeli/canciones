import { notFound } from "next/navigation";
import { getSong } from "@/lib/songs";
import SongViewer from "@/components/SongViewer";

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const song = await getSong(id).catch(() => null);
  if (!song) notFound();

  return <SongViewer song={song} />;
}
