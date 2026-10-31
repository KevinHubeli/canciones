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
  restore: "restauró",
  purge: "vació la papelera de",
  revert: "volvió a una versión anterior de",
  backup: "hizo un respaldo de",
};
// Para el filtro por tipo (en el mismo orden en que se muestran).
const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Creó",
  update: "Editó",
  delete: "Eliminó",
  duplicate: "Copió",
  chords: "Buscó acordes",
  restore: "Restauró",
  purge: "Vació la papelera",
  revert: "Volvió a una versión",
  backup: "Respaldo",
};
const ENTITY_TEXT: Record<AuditEntity, string> = {
  song: "la canción",
  setlist: "el power",
  user: "el usuario",
};
const ENTITY_LABEL: Record<AuditEntity, string> = {
  song: "Canciones",
  setlist: "Powers",
  user: "Usuarios",
};

// Los horarios se muestran en hora de Argentina sin importar dónde corra el servidor.
const dateFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type SearchParams = { limit?: string; user?: string; action?: string; entity?: string };

function isKey<T extends string>(map: Record<T, unknown>, value: string | undefined): value is T {
  return value !== undefined && Object.prototype.hasOwnProperty.call(map, value);
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!(await requireAdmin())) redirect("/admin/login");

  const params = await searchParams;
  const limit = Math.min(MAX, Math.max(PAGE, Number(params.limit) || PAGE));
  const action = isKey(ACTION_LABEL, params.action) ? params.action : undefined;
  const entity = isKey(ENTITY_LABEL, params.entity) ? params.entity : undefined;
  const user = params.user?.trim() || undefined;

  // Se traen las últimas MAX entradas y se filtra acá: así "Ver más" y la lista de
  // usuarios funcionan igual con o sin filtros.
  const all = await listAudit(MAX);
  const users = [...new Set(all.map((e) => e.username))].sort((a, b) => a.localeCompare(b, "es"));
  const filtered = all.filter(
    (e) =>
      (!user || e.username === user) &&
      (!action || e.action === action) &&
      (!entity || e.entity === entity)
  );
  const shown = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const filtering = Boolean(user || action || entity);

  // Los filtros se conservan al pedir más.
  const moreQuery = new URLSearchParams();
  if (user) moreQuery.set("user", user);
  if (action) moreQuery.set("action", action);
  if (entity) moreQuery.set("entity", entity);
  moreQuery.set("limit", String(limit + PAGE));

  const selectClass =
    "w-full rounded-full border border-plum bg-night/50 px-3 py-2 text-sm text-mist";

  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-4 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Panel de admin</span>
        <h1 className="font-display text-2xl text-mist">Historial</h1>
      </div>

      <form action="/admin/historial" className="mb-4 flex flex-col gap-2 px-5 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Persona</span>
          <select name="user" defaultValue={user ?? ""} className={selectClass}>
            <option value="">Todas las personas</option>
            {/* Si el usuario filtrado ya no tiene entradas recientes, igual se muestra elegido. */}
            {user && !users.includes(user) && <option value={user}>{user}</option>}
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="sr-only">Tipo de cambio</span>
          <select name="action" defaultValue={action ?? ""} className={selectClass}>
            <option value="">Todos los cambios</option>
            {(Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span className="sr-only">Sobre qué</span>
          <select name="entity" defaultValue={entity ?? ""} className={selectClass}>
            <option value="">Canciones, powers y usuarios</option>
            {(Object.keys(ENTITY_LABEL) as AuditEntity[]).map((en) => (
              <option key={en} value={en}>
                {ENTITY_LABEL[en]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-night"
          >
            Filtrar
          </button>
          {filtering && (
            <Link
              href="/admin/historial"
              className="rounded-full bg-plum px-4 py-2 text-sm text-mist"
            >
              Limpiar
            </Link>
          )}
        </div>
      </form>

      {shown.length === 0 ? (
        <p className="px-5 text-sm text-lilac-light">
          {filtering
            ? "No hay cambios que coincidan con ese filtro."
            : "Todavía no hay cambios anotados."}
        </p>
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
                href={`/admin/historial?${moreQuery}`}
                className="text-sm text-lilac-light underline"
              >
                Ver más
              </Link>
            </li>
          )}
          {all.length >= MAX && !hasMore && (
            <li className="pt-2 text-center text-xs text-lilac-light">
              Se muestran los últimos {MAX} cambios.
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
