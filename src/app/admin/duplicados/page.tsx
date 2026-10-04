import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import DuplicateSongs from "@/components/DuplicateSongs";

export default async function DuplicadosPage() {
  if (!(await requireAdmin())) redirect("/admin/login");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Panel de admin</span>
        <h1 className="font-display text-2xl text-mist">Canciones duplicadas</h1>
      </div>
      <DuplicateSongs />
    </main>
  );
}
