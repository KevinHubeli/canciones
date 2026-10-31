export type BackupSummary =
  | { ok: true; songs: number; setlists: number; versions: number }
  | { ok: false; error: string };

/**
 * Revisión básica de un archivo de respaldo antes de mandarlo: que sea JSON,
 * un objeto, y que traiga canciones y/o powers. El servidor valida en serio.
 */
export function summarizeBackup(text: string): BackupSummary {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Este archivo no parece un respaldo del cancionero." };
  }
  const { songs, setlists, versions } = data as Record<string, unknown>;
  const hasSongs = Array.isArray(songs);
  const hasSetlists = Array.isArray(setlists);
  if (!hasSongs && !hasSetlists) {
    return { ok: false, error: "Este archivo no trae canciones ni powers." };
  }
  if ((songs !== undefined && !hasSongs) || (setlists !== undefined && !hasSetlists)) {
    return { ok: false, error: "El archivo tiene un formato que no reconocemos." };
  }
  return {
    ok: true,
    songs: hasSongs ? songs.length : 0,
    setlists: hasSetlists ? setlists.length : 0,
    versions: Array.isArray(versions) ? versions.length : 0,
  };
}
