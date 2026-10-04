"use client";

import { normalizePlainChordLines } from "@/lib/chords";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Song } from "@/lib/types";
import ChordLine from "@/components/ChordLine";
import { SONG_TAGS } from "@/lib/tags";

const inputClass =
  "rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent";

export default function SongForm({ initial }: { initial?: Song }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [artist, setArtist] = useState(initial?.artist ?? "");
  const [originalKey, setOriginalKey] = useState(initial?.originalKey ?? "C");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [body, setBody] = useState(initial?.body ?? "");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  // Ya hay otra canción con este título: se avisa y se deja guardar igual si es a propósito.
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null);

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos importar esa canción.");
        return;
      }
      setTitle(data.title ?? "");
      setArtist(data.artist ?? "");
      setOriginalKey(data.originalKey ?? "C");
      setBody(data.body ?? "");
      setShowImport(false);
    } catch {
      setError("No pudimos importar esa canción.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent, force = false) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setDuplicate(null);
    try {
      const res = await fetch(initial ? `/api/songs/${initial.id}` : "/api/songs", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist, originalKey, category, tags, body, force }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicateOf) {
        setDuplicate(data.duplicateOf);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar la canción.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("No se pudo guardar la canción.");
    } finally {
      setSaving(false);
    }
  }

  const previewLines = normalizePlainChordLines(body).slice(0, 6);

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 px-5 pb-10">
      <div className="rounded-2xl border border-plum/60 bg-night/40 p-3">
        {!showImport ? (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="text-sm text-chord-gold underline"
          >
            Importar acordes desde una URL (Cifra Club o LaCuerda)
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {title.trim() && (
              <a
                href={`https://www.cifraclub.com/search/?q=${encodeURIComponent(title.trim())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-lilac-light underline"
              >
                Buscar &quot;{title.trim()}&quot; en Cifra Club ↗
              </a>
            )}
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://www.cifraclub.com/artista/cancion/"
              className="rounded-xl border border-plum bg-night/50 px-3 py-2 text-sm text-mist placeholder:text-lilac-light/70"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-night disabled:opacity-60"
              >
                {importing ? "Importando..." : "Importar"}
              </button>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="text-sm text-lilac-light"
              >
                Cancelar
              </button>
            </div>
            <p className="text-xs text-lilac-light">
              Se reemplaza el título, artista, tono y letra con lo que traiga esa página:
              revisá todo antes de guardar.
            </p>
          </div>
        )}
      </div>

      <Field label="Título">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          required
        />
      </Field>
      <Field label="Artista">
        <input value={artist} onChange={(e) => setArtist(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex gap-3">
        <Field label="Tono original" className="flex-1">
          <input
            value={originalKey}
            onChange={(e) => setOriginalKey(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Categoría" className="flex-1">
          <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Tags">
        <div className="flex flex-wrap gap-2">
          {SONG_TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                  )
                }
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-accent bg-accent text-night"
                    : "border-plum bg-night/50 text-lilac-light"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Letra con acordes (ej: [Dm]Cantare a [Gm]Jehová)">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className={`${inputClass} font-mono text-sm`}
          required
        />
      </Field>

      {body.trim() && (
        <div>
          <span className="mb-2 block text-xs uppercase tracking-wide text-lilac-light">
            Vista previa
          </span>
          <div className="overflow-x-auto rounded-2xl border border-plum/60 bg-night/40 p-4">
            {previewLines.map((line, i) => (
              <ChordLine
                key={i}
                raw={line}
                semitones={0}
                notation="en"
                textSizeClass="text-sm"
                interactive={false}
              />
            ))}
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">{error}</p>}

      {duplicate && (
        <div className="rounded-xl bg-accent/20 px-3 py-3 text-sm text-mist">
          <p>
            Ya existe una canción llamada &quot;{duplicate.title}&quot;. ¿Querés cargarla igual?
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a href={`/admin/${duplicate.id}/editar`} className="underline">
              Abrir la que ya existe
            </a>
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              className="font-semibold underline"
            >
              Guardar igual
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-accent py-3 text-sm font-semibold text-night disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Guardar canción"}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm text-lilac-light ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}
