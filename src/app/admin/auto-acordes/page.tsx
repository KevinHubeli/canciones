import AutoMatchChords from "@/components/AutoMatchChords";

export default function AutoAcordesPage() {
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
