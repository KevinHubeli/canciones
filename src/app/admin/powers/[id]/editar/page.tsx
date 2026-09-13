import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getSetlist } from "@/lib/setlists";
import SetlistBuilder from "@/components/SetlistBuilder";

export default async function EditPowerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const authorized = await requireAdmin();
  if (!authorized) redirect("/admin/login");

  const { id } = await params;
  const setlist = await getSetlist(id).catch(() => null);
  if (!setlist) notFound();

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Editar</span>
        <h1 className="font-display text-2xl text-mist">{setlist.title}</h1>
      </div>
      <SetlistBuilder initial={setlist} />
    </main>
  );
}
