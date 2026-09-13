"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function HolyricsImportForm() {
  const router = useRouter();
  const [json, setJson] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJson(await file.text());
  }

  async function handleImport() {
    if (!json.trim()) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/songs/import-holyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos importar el archivo.");
        return;
      }
      setResult(data);
      router.refresh();
    } catch {
      setError("No pudimos importar el archivo.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pb-10">
      <p className="text-sm text-lilac-light">
        Pegá acá el JSON que exporta Holyrics, o subí el archivo directamente. Se cargan
        todas las canciones con letra (sin acordes): después podés abrir cada una y
        agregarle los acordes editándola.
      </p>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="rounded-2xl border border-dashed border-plum bg-night/40 py-4 text-sm text-lilac-light"
      >
        Elegir archivo .json exportado de Holyrics
      </button>
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFile} className="hidden" />

      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder="...o pegá acá el contenido del JSON"
        rows={10}
        className="rounded-2xl border border-plum bg-night/50 px-4 py-3 font-mono text-xs text-mist placeholder:text-lilac-light/70"
      />

      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}
      {result && (
        <p className="rounded-xl bg-white/10 px-3 py-2 text-sm text-mist">
          Se importaron {result.inserted} canciones.
          {result.skipped > 0 ? ` Se ignoraron ${result.skipped} sin letra o sin título.` : ""}
        </p>
      )}

      <button
        onClick={handleImport}
        disabled={importing || !json.trim()}
        className="rounded-full bg-accent py-3 text-sm font-semibold text-night disabled:opacity-60"
      >
        {importing ? "Importando..." : "Importar todas"}
      </button>
    </div>
  );
}
