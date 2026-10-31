import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import TrashList from "@/components/TrashList";

export default async function PapeleraPage() {
  if (!(await requireAdmin())) redirect("/admin/login");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Panel de admin</span>
        <h1 className="font-display text-2xl text-mist">Papelera</h1>
      </div>
      <TrashList />
    </main>
  );
}
