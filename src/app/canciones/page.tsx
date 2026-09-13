import SongList from "@/components/SongList";

export default function CancionesPage() {
  return (
    <main className="flex flex-1 flex-col pt-14">
      <div className="mb-6 flex flex-col items-center px-5 text-center animate-fade-in">
        <span className="mb-2 text-xs uppercase tracking-[0.3em] text-lilac-light">
          Todas las canciones
        </span>
        <h1 className="font-display text-3xl text-mist sm:text-4xl">Buscar</h1>
      </div>

      <SongList />
    </main>
  );
}
