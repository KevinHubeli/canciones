"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { summarizeBackup } from "@/lib/backupFile";
import { daysSince, timeAgo } from "@/lib/timeAgo";
import { useStoredString, writeStored } from "@/lib/useStoredString";

const LAST_BACKUP_KEY = "cancionero_ultimo_respaldo";
/** A partir de cuántos días sin respaldo se avisa con más énfasis. */
const STALE_BACKUP_DAYS = 30;

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Pending = { text: string; fileName: string; songs: number; setlists: number; versions: number };
type RestoreResult = { songs: number; setlists: number; versions: number };

function fileNameFrom(disposition: string | null): string {
  const match = disposition && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return `respaldo-cancionero-${new Date().toISOString().slice(0, 10)}.json`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function BackupAdmin() {
  const lastBackup = useStoredString(LAST_BACKUP_KEY);
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res.headers.get("Content-Disposition"));
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      writeStored(LAST_BACKUP_KEY, new Date().toISOString());
    } catch {
      setDownloadError("No se pudo descargar el respaldo. Probá de nuevo en un rato.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Se limpia para poder elegir de nuevo el mismo archivo.
    e.target.value = "";
    setFileError(null);
    setRestoreError(null);
    setResult(null);
    setPending(null);
    if (!file) return;
    try {
      const text = await file.text();
      const summary = summarizeBackup(text);
      if (!summary.ok) {
        setFileError(summary.error);
        return;
      }
      setPending({
        text,
        fileName: file.name,
        songs: summary.songs,
        setlists: summary.setlists,
        versions: summary.versions,
      });
    } catch {
      setFileError("No pudimos leer ese archivo.");
    }
  }

  async function handleRestore() {
    if (!pending) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pending.text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "");
      setResult({
        songs: Number(data.songs) || 0,
        setlists: Number(data.setlists) || 0,
        versions: Number(data.versions) || 0,
      });
      setPending(null);
    } catch (err) {
      setRestoreError(
        err instanceof Error && err.message ? err.message : "No se pudo restaurar el respaldo."
      );
    } finally {
      setRestoring(false);
    }
  }

  // El valor viene de localStorage: si está corrupto, se trata como "nunca".
  const lastDate = lastBackup && !Number.isNaN(Date.parse(lastBackup)) ? lastBackup : null;
  const days = lastDate ? daysSince(lastDate) : null;
  const stale = days === null || days >= STALE_BACKUP_DAYS;

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pb-10">
      <section
        aria-label="Descargar respaldo"
        className="flex flex-col gap-3 rounded-2xl border border-plum/60 bg-night/40 p-4"
      >
        <h2 className="font-display text-lg text-mist">Descargar respaldo</h2>
        <p className="text-sm text-lilac-light">
          Baja un archivo con todas las canciones, los powers y el historial de versiones. No
          incluye usuarios ni contraseñas. Guardalo en un lugar seguro (por ejemplo, tu Drive).
        </p>
        <p
          role="status"
          className={`rounded-xl px-3 py-2 text-sm ${
            stale ? "bg-accent/20 text-mist" : "bg-plum/50 text-lilac-light"
          }`}
        >
          {lastDate && days !== null ? (
            <>
              {days === 0
                ? "Hoy descargaste un respaldo."
                : `Hace ${plural(days, "día", "días")} que no hacés un respaldo.`}{" "}
              <span className="text-lilac-light" title={dateFormat.format(new Date(lastDate))}>
                (último: {timeAgo(lastDate)})
              </span>
            </>
          ) : (
            "Todavía no descargaste ningún respaldo desde este navegador."
          )}
        </p>
        {downloadError && (
          <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
            {downloadError}
          </p>
        )}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center justify-center gap-2 rounded-full bg-accent py-2.5 text-sm font-semibold text-night disabled:opacity-60"
        >
          <Download size={16} />
          {downloading ? "Preparando..." : "Descargar respaldo"}
        </button>
      </section>

      <section
        aria-label="Restaurar desde un archivo"
        className="flex flex-col gap-3 rounded-2xl border border-plum/60 bg-night/40 p-4"
      >
        <h2 className="font-display text-lg text-mist">Restaurar desde un archivo</h2>
        <p className="text-sm text-lilac-light">
          Elegí un respaldo descargado antes. Se <span className="text-mist">fusiona</span> con lo
          que ya hay: no se borra nada de lo existente.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          className="sr-only"
          aria-label="Archivo de respaldo (.json)"
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={restoring}
          className="flex items-center justify-center gap-2 rounded-full bg-plum py-2.5 text-sm font-medium text-mist disabled:opacity-60"
        >
          <Upload size={16} />
          Elegir archivo .json
        </button>

        {fileError && (
          <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
            {fileError}
          </p>
        )}

        {pending && (
          <div className="flex flex-col gap-2 rounded-xl bg-plum/40 p-3">
            <p className="truncate text-sm text-mist">{pending.fileName}</p>
            <p className="text-sm text-lilac-light">
              Trae {plural(pending.songs, "canción", "canciones")},{" "}
              {plural(pending.setlists, "power", "powers")}
              {pending.versions > 0 && <> y {plural(pending.versions, "versión", "versiones")}</>}.
            </p>
            {restoreError && (
              <p role="alert" className="rounded-xl bg-accent/20 px-3 py-2 text-sm text-mist">
                {restoreError}
              </p>
            )}
            <button
              onClick={() => {
                setRestoreError(null);
                setConfirming(true);
              }}
              disabled={restoring}
              className="rounded-full bg-accent py-2.5 text-sm font-semibold text-night disabled:opacity-60"
            >
              Restaurar este respaldo
            </button>
          </div>
        )}

        {result && (
          <p role="status" className="rounded-xl border border-plum/60 bg-plum/40 px-3 py-2 text-sm text-mist">
            Listo. Se fusionaron {plural(result.songs, "canción", "canciones")},{" "}
            {plural(result.setlists, "power", "powers")} y{" "}
            {plural(result.versions, "versión", "versiones")}.
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirming && pending !== null}
        title="¿Restaurar este respaldo?"
        message={
          restoring
            ? "Restaurando..."
            : "Esto fusiona el respaldo con lo que ya está cargado: agrega y actualiza, pero no borra nada de lo existente."
        }
        confirmLabel="Restaurar"
        onConfirm={async () => {
          await handleRestore();
          setConfirming(false);
        }}
        onCancel={() => !restoring && setConfirming(false)}
      />
    </div>
  );
}
