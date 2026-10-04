import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { listAudit, type AuditAction, type AuditEntity } from "@/lib/audit";

const PAGE = 100;
const MAX = 1000;

const ACTION_TEXT: Record<AuditAction, string> = {
  create: "creó",
  update: "editó",
  delete: "eliminó",
  duplicate: "copió",
  chords: "buscó los acordes de",
};
const ENTITY_TEXT: Record<AuditEntity, string> = {
  song: "la canción",
  setlist: "el power",
  user: "el usuario",
};

// Los horarios se muestran en hora de Argentina sin importar dónde corra el servidor.
const dateFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  if (!(await requireAdmin())) redirect("/admin/login");

  const { limit: limitParam } = await searchParams;
  const limit = Math.min(MAX, Math.max(PAGE, Number(limitParam) || PAGE));
  const entries = await listAudit(limit + 1);
  const hasMore = entries.length > limit;
  const shown = entries.slice(0, limit);

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Panel de admin</span>
        <h1 className="font-display text-2xl text-mist">Historial</h1>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 text-sm text-lilac-light">Todavía no hay cambios anotados.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 px-5 pb-10">
          {shown.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-plum/60 bg-night/40 px-3 py-2.5 text-sm text-mist"
            >
              <p>
                <span className="font-semibold">{entry.username}</span>{" "}
                {ACTION_TEXT[entry.action] ?? entry.action} {ENTITY_TEXT[entry.entity] ?? entry.entity}{" "}
                <span className="text-chord-gold">&quot;{entry.entityTitle}&quot;</span>
              </p>
              <p className="mt-0.5 text-xs text-lilac-light">{dateFormat.format(new Date(entry.at))}</p>
            </li>
          ))}
          {hasMore && limit < MAX && (
            <li className="pt-2 text-center">
              <Link
                href={`/admin/historial?limit=${limit + PAGE}`}
                className="text-sm text-lilac-light underline"
              >
                Ver más
              </Link>
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
