import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "@/lib/session";
import AccountForm from "@/components/AccountForm";

export default async function CuentaPage() {
  const session = await getAuthenticatedSession();
  if (!session) redirect("/admin/login");

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Panel de admin</span>
        <h1 className="font-display text-2xl text-mist">Mi cuenta</h1>
        <p className="mt-1 text-sm text-lilac-light">
          Sesión iniciada como <span className="text-mist">{session.username}</span>
          {session.kind === "owner" ? " (dueño)" : ""}.
        </p>
      </div>
      <AccountForm isOwner={session.kind === "owner"} />
      <div className="px-5 pb-10 pt-2">
        <Link href="/admin" className="text-sm text-lilac-light underline">
          Volver al panel
        </Link>
      </div>
    </main>
  );
}
