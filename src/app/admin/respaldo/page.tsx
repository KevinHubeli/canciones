import { redirect } from "next/navigation";
import { isOwner, requireAdmin } from "@/lib/session";
import BackupAdmin from "@/components/BackupAdmin";

export default async function RespaldoPage() {
  if (!(await requireAdmin())) redirect("/admin/login");
  if (!(await isOwner())) redirect("/admin");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Panel de admin</span>
        <h1 className="font-display text-2xl text-mist">Respaldo</h1>
      </div>
      <BackupAdmin />
    </main>
  );
}
