import LoginForm from "@/components/LoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center px-5 pt-20">
      <div className="mb-8 flex flex-col items-center text-center animate-fade-in">
        <span className="mb-2 text-xs uppercase tracking-[0.3em] text-lilac-light">
          Acceso privado
        </span>
        <h1 className="font-display text-3xl text-mist sm:text-4xl">Bienvenida</h1>
        <p className="mt-3 max-w-xs text-sm text-lilac-light">
          Ingresá para cargar y administrar las canciones.
        </p>
      </div>

      <LoginForm next={next && next.startsWith("/admin") ? next : "/admin"} />
    </main>
  );
}
