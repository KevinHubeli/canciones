import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import SetlistList from "@/components/SetlistList";
import LogoutButton from "@/components/LogoutButton";

export default async function PowersPage() {
  const authorized = await requireAdmin();
  if (!authorized) redirect("/admin/login");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 flex items-center justify-between px-5">
        <div>
          <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">
            Panel de admin
          </span>
          <h1 className="font-display text-2xl text-mist">Powers</h1>
        </div>
        <LogoutButton />
      </div>

      <SetlistList />
    </main>
  );
}
