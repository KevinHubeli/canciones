import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import AutoMatchChords from "@/components/AutoMatchChords";

export default async function AutoAcordesPage() {
  if (!(await requireAdmin())) redirect("/admin/login");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Automático</span>
        <h1 className="font-display text-2xl text-mist">Buscar acordes</h1>
      </div>
      <AutoMatchChords />
    </main>
  );
}
