import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import StatsView from "@/components/StatsView";

export default async function EstadisticasPage() {
  if (!(await requireAdmin())) redirect("/admin/login");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Panel de admin</span>
        <h1 className="font-display text-2xl text-mist">Estadísticas</h1>
      </div>
      <StatsView />
    </main>
  );
}
