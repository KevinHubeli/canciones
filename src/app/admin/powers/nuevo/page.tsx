import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import SetlistBuilder from "@/components/SetlistBuilder";

export default async function NewPowerPage() {
  const authorized = await requireAdmin();
  if (!authorized) redirect("/admin/login");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Nuevo</span>
        <h1 className="font-display text-2xl text-mist">Armar power</h1>
      </div>
      <SetlistBuilder />
    </main>
  );
}
