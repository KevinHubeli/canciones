"use client";

import { normalizePlainChordLines } from "@/lib/chords";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Song } from "@/lib/types";
import ChordLine from "@/components/ChordLine";
import BatchImport from "@/components/BatchImport";
import { SONG_TAGS } from "@/lib/tags";
import { findJunkLines, removeJunkLines } from "@/lib/junk";
import { hasChords } from "@/lib/text";
import { parseChordPro } from "@/lib/chordpro";
import { guessOriginalKey, KEY_OPTIONS } from "@/lib/importers/key";
import { readStored, useStoredString, writeStored } from "@/lib/useStoredString";

const inputClass =
  "w-full min-w-0 rounded-2xl border border-plum bg-night/50 px-4 py-3 text-mist placeholder:text-lilac-light/70 focus:outline-none focus:ring-2 focus:ring-accent";

const BPM_MIN = 30;
const BPM_MAX = 300;
const NOTES_MAX = 2000;
const MAX_FILE_BYTES = 1_000_000;
const OTHER_KEY = "__other";
const ALL_KEYS: readonly string[] = [...KEY_OPTIONS.major, ...KEY_OPTIONS.minor];

type FormValues = {
  title: string;
  artist: string;
  originalKey: string;
  category: string;
  tags: string[];
  body: string;
  bpm: string;
  notes: string;
};

function valuesFrom(song?: Song): FormValues {
  return {
    title: song?.title ?? "",
    artist: song?.artist ?? "",
    originalKey: song?.originalKey ?? "C",
    category: song?.category ?? "",
    tags: song?.tags ?? [],
    body: song?.body ?? "",
    bpm: song?.bpm != null ? String(song.bpm) : "",
    notes: song?.notes ?? "",
  };
}

const LEAVE_MESSAGE = "Hay cambios sin guardar. ¿Querés salir igual y perderlos?";

export default function SongForm({ initial }: { initial?: Song }) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => valuesFrom(initial));
  const { title, artist, originalKey, category, tags, body, bpm, notes } = values;
  const set = (patch: Partial<FormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  // Tono: lista de 24 o un valor a mano ("Otro...").
  const [keyCustom, setKeyCustom] = useState(() => !ALL_KEYS.includes(valuesFrom(initial).originalKey));

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Líneas que parecen texto de la página de donde se copió (menús, botones, links).
  const junk = useMemo(() => findJunkLines(body), [body]);
  const [junkDismissed, setJunkDismissed] = useState(false);
  // Ya hay otra canción con este título: se avisa y se deja guardar igual si es a propósito.
  const [duplicate, setDuplicate] = useState<{ id: string; title: string } | null>(null);

  // --- Cambios sin guardar ---
  const [baseline] = useState(() => JSON.stringify(valuesFrom(initial)));
  const snapshot = JSON.stringify(values);
  const [saved, setSaved] = useState(false);
  const dirty = !saved && snapshot !== baseline;

  // Borrador local: si falla el guardado o se cierra la pestaña, lo escrito se puede recuperar.
  const draftKey = `songform-draft:${initial?.id ?? "new"}`;
  const storedDraft = useStoredString(draftKey);
  const [draftHandled, setDraftHandled] = useState(false);
  const draft = useMemo(() => {
    if (!storedDraft || storedDraft === baseline) return null;
    try {
      const parsed = JSON.parse(storedDraft) as Partial<FormValues>;
      return typeof parsed.body === "string" ? { ...valuesFrom(initial), ...parsed } : null;
    } catch {
      return null;
    }
  }, [storedDraft, initial, baseline]);

  useEffect(() => {
    if (dirty) writeStored(draftKey, snapshot);
  }, [dirty, draftKey, snapshot]);

  function clearDraft() {
    if (readStored(draftKey)) writeStored(draftKey, "");
  }

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Links internos (Next navega sin recargar, así que beforeunload no alcanza).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(LEAVE_MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  function handleCancel() {
    if (dirty) {
      if (!window.confirm(LEAVE_MESSAGE)) return;
      clearDraft();
    }
    setSaved(true);
    router.push("/admin");
  }

  function applyKey(next: string) {
    set({ originalKey: next });
    setKeyCustom(!ALL_KEYS.includes(next));
  }

  function applyImported(data: {
    title?: string;
    artist?: string;
    originalKey?: string;
    bpm?: number;
    body?: string;
  }) {
    set({
      title: data.title || title,
      artist: data.artist ?? artist,
      originalKey: data.originalKey || originalKey,
      bpm: data.bpm !== undefined ? String(data.bpm) : bpm,
      body: data.body ?? body,
    });
    if (data.originalKey) setKeyCustom(!ALL_KEYS.includes(data.originalKey));
    setJunkDismissed(false);
    setDuplicate(null);
  }

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No pudimos importar esa canción.");
        return;
      }
      // El importador siempre trae título, artista, tono y letra: reemplazan lo actual.
      set({
        title: data.title ?? "",
        artist: data.artist ?? "",
        originalKey: data.originalKey ?? "C",
        body: data.body ?? "",
      });
      setKeyCustom(!ALL_KEYS.includes(data.originalKey ?? "C"));
      setJunkDismissed(false);
      setDuplicate(null);
      setShowImport(false);
    } catch {
      setError("No pudimos conectarnos para importar esa canción. Probá de nuevo.");
    } finally {
      setImporting(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite elegir el mismo archivo otra vez
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("Ese archivo es demasiado grande (máximo 1 MB).");
      return;
    }
    // Se lee en el navegador: el archivo no se sube a ningún lado.
    const reader = new FileReader();
    reader.onerror = () => setError("No pudimos leer ese archivo.");
    reader.onload = () => {
      const parsed = parseChordPro(String(reader.result ?? ""));
      if (!parsed.body.trim()) {
        setError("Ese archivo no tiene letra.");
        return;
      }
      if (body.trim() && !window.confirm("Esto reemplaza la letra que ya escribiste. ¿Seguir?")) return;
      applyImported({
        title: parsed.title || (title.trim() ? undefined : file.name.replace(/\.[^.]+$/, "")),
        artist: parsed.artist,
        originalKey: parsed.key,
        bpm: parsed.bpm,
        body: parsed.body,
      });
    };
    reader.readAsText(file);
  }

  function validate(): string | null {
    if (!title.trim()) return "Falta el título.";
    if (!body.trim()) return "Falta la letra.";
    if (bpm.trim()) {
      const n = Number(bpm);
      if (!Number.isInteger(n) || n < BPM_MIN || n > BPM_MAX) {
        return `El tempo tiene que ser un número entero entre ${BPM_MIN} y ${BPM_MAX}.`;
      }
    }
    if (notes.length > NOTES_MAX) return `Las notas pueden tener hasta ${NOTES_MAX} caracteres.`;
    return null;
  }

  async function save(force = false) {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    setDuplicate(null);
    try {
      const res = await fetch(initial ? `/api/songs/${initial.id}` : "/api/songs", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          artist,
          originalKey,
          category,
          tags,
          body,
          bpm: bpm.trim() ? Number(bpm) : null,
          notes: notes.trim() ? notes : null,
          force,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.duplicateOf) {
        setDuplicate(data.duplicateOf);
        return;
      }
      if (res.status === 401) {
        setError(
          "Se venció la sesión. Volvé a entrar y guardá de nuevo; lo que escribiste queda guardado como borrador en este navegador."
        );
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar la canción. Lo que escribiste sigue acá.");
        return;
      }
      // Guardada: ya no hay nada pendiente ni borrador que recuperar.
      setSaved(true);
      clearDraft();
      router.push("/admin");
      router.refresh();
    } catch {
      setError("No pudimos conectarnos para guardar. Lo que escribiste sigue acá: probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const previewLines = normalizePlainChordLines(body).slice(0, 6);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      className="flex flex-1 flex-col gap-4 px-5 pb-10"
    >
      {draft && !dirty && !draftHandled && (
        <div className="rounded-xl border border-accent/60 bg-accent/10 px-3 py-3 text-sm text-mist">
          <p>Hay un borrador sin guardar de esta canción en este navegador.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setValues(draft);
                setKeyCustom(!ALL_KEYS.includes(draft.originalKey));
                setDraftHandled(true);
              }}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-night"
            >
              Recuperar borrador
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraft();
                setDraftHandled(true);
              }}
              className="text-xs text-lilac-light underline"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-plum/60 bg-night/40 p-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            aria-expanded={showImport}
            className="text-chord-gold underline"
          >
            Importar desde una URL (Cifra Club o LaCuerda)
          </button>
          {!initial && (
            <button
              type="button"
              onClick={() => setShowBatch((v) => !v)}
              aria-expanded={showBatch}
              className="text-chord-gold underline"
            >
              Cargar varias URLs
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-chord-gold underline"
          >
            Importar un archivo (ChordPro / .txt)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".cho,.chordpro,.crd,.pro,.txt,text/plain"
            onChange={handleFile}
            className="hidden"
            tabIndex={-1}
            aria-label="Elegir un archivo ChordPro o de texto"
          />
        </div>

        {showImport && (
          <div className="mt-3 flex flex-col gap-2">
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
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                // Enter acá importa; no tiene que guardar toda la canción.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleImport();
                }
              }}
              aria-label="URL de la canción"
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

        {showBatch && !initial && (
          <div className="mt-3">
            <BatchImport />
          </div>
        )}

        <p className="mt-2 text-xs text-lilac-light">
          El archivo se lee en tu navegador, no se sube a ningún lado. Reconoce {"{title:}"},{" "}
          {"{artist:}"}, {"{key:}"}, {"{tempo:}"} y {"{start_of_chorus}"}.
        </p>
      </div>

      <Field label="Título">
        <input
          value={title}
          onChange={(e) => set({ title: e.target.value })}
          className={inputClass}
          required
        />
      </Field>
      <Field label="Artista">
        <input value={artist} onChange={(e) => set({ artist: e.target.value })} className={inputClass} />
      </Field>
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-lilac-light">
          <label htmlFor="song-key">Tono original</label>
          <select
            id="song-key"
            value={keyCustom ? OTHER_KEY : originalKey}
            onChange={(e) => {
              if (e.target.value === OTHER_KEY) setKeyCustom(true);
              else applyKey(e.target.value);
            }}
            className={inputClass}
          >
            <optgroup label="Mayores">
              {KEY_OPTIONS.major.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </optgroup>
            <optgroup label="Menores">
              {KEY_OPTIONS.minor.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </optgroup>
            <option value={OTHER_KEY}>Otro...</option>
          </select>
          {keyCustom && (
            <input
              value={originalKey}
              onChange={(e) => set({ originalKey: e.target.value })}
              maxLength={12}
              aria-label="Tono original (a mano)"
              placeholder="Ej: C#m"
              className={inputClass}
            />
          )}
          {hasChords(normalizePlainChordLines(body).join("\n")) && (
            <button
              type="button"
              onClick={() => applyKey(guessOriginalKey(normalizePlainChordLines(body).join("\n")))}
              className="self-start text-xs text-lilac-light underline"
            >
              Detectar de los acordes
            </button>
          )}
        </div>
        <Field label="Tempo (BPM)" className="flex-1">
          <input
            type="number"
            inputMode="numeric"
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            value={bpm}
            onChange={(e) => set({ bpm: e.target.value })}
            placeholder="Opcional"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Categoría">
        <input value={category} onChange={(e) => set({ category: e.target.value })} className={inputClass} />
      </Field>
      <Field label="Tags">
        <div className="flex flex-wrap gap-2">
          {SONG_TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  set({ tags: active ? tags.filter((t) => t !== tag) : [...tags, tag] })
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
          onChange={(e) => set({ body: e.target.value })}
          rows={14}
          className={`${inputClass} font-mono text-sm`}
          required
        />
      </Field>

      {junk.length > 0 && !junkDismissed && (
        <div className="rounded-xl border border-accent/60 bg-accent/10 px-3 py-3 text-sm text-mist">
          <p className="font-semibold">
            {junk.length === 1
              ? "Hay 1 línea que parece de la página web, no de la canción:"
              : `Hay ${junk.length} líneas que parecen de la página web, no de la canción:`}
          </p>
          <ul className="mt-1.5 list-inside list-disc text-xs text-lilac-light">
            {junk.slice(0, 6).map((line) => (
              <li key={line.index} className="truncate">
                {line.text}
              </li>
            ))}
            {junk.length > 6 && <li>y {junk.length - 6} más</li>}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => set({ body: removeJunkLines(body) })}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-night"
            >
              Quitar {junk.length === 1 ? "esa línea" : "esas líneas"}
            </button>
            <button
              type="button"
              onClick={() => setJunkDismissed(true)}
              className="text-xs text-lilac-light underline"
            >
              Dejar así
            </button>
          </div>
        </div>
      )}

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

      <Field label="Notas para el equipo (opcional)">
        <textarea
          value={notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={3}
          maxLength={NOTES_MAX}
          placeholder="Ej: entra el bajo en el segundo verso"
          className={`${inputClass} text-sm`}
        />
        <span className="self-end text-xs text-lilac-light/70">
          {notes.length}/{NOTES_MAX}
        </span>
      </Field>

      {error && (
        <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
          {error}
        </p>
      )}

      {duplicate && (
        <div className="rounded-xl bg-accent/20 px-3 py-3 text-sm text-mist">
          <p>
            Ya existe una canción llamada &quot;{duplicate.title}&quot;.{" "}
            {initial ? "¿Querés guardar este cambio igual?" : "¿Querés cargarla igual?"}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a href={`/admin/${duplicate.id}/editar`} className="underline">
              Abrir la que ya existe
            </a>
            <button type="button" onClick={() => void save(true)} className="font-semibold underline">
              Guardar igual
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-accent py-3 text-sm font-semibold text-night disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar canción"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-full py-2 text-sm text-lilac-light"
        >
          Cancelar
        </button>
      </div>
      {dirty && (
        <p className="-mt-2 text-center text-xs text-lilac-light/70">Hay cambios sin guardar.</p>
      )}
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
    <label className={`flex min-w-0 flex-col gap-1.5 text-sm text-lilac-light ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}
