import HolyricsImportForm from "@/components/HolyricsImportForm";

export default function ImportarHolyricsPage() {
  return (
    <main className="flex flex-1 flex-col pt-12">
      <div className="mb-6 px-5">
        <span className="text-xs uppercase tracking-[0.3em] text-lilac-light">Importar</span>
        <h1 className="font-display text-2xl text-mist">Desde Holyrics</h1>
      </div>
      <HolyricsImportForm />
    </main>
  );
}
