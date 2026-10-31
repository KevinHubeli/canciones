import { mergeEntries } from "@/lib/dividers";
import { paginateSong, type Run } from "@/lib/pptx-layout";
import { getSongsByIds } from "@/lib/songs";
import type { Setlist } from "@/lib/setlists";

export type DividerSlide = { kind: "divider"; name: string };
export type SongSlide = {
  kind: "song";
  title: string;
  columns: Run[][];
  index: number;
  count: number;
  fontSize: number;
};
export type Slide = DividerSlide | SongSlide;

/**
 * Las diapositivas de un power, en orden: un divisor es una diapositiva
 * propia y cada canción ocupa una o más hojas. Lo usan tanto el export a
 * PowerPoint como la vista previa, así los dos siempre muestran lo mismo.
 */
export async function buildSlides(setlist: Setlist): Promise<Slide[]> {
  // Una sola consulta para todas las letras (y sin las canciones en la papelera).
  const found = await getSongsByIds(setlist.songs.map((s) => s.id));
  const byId = new Map(found.map((s) => [s.id, s]));
  const entries = mergeEntries(
    setlist.songs.map((s) => ({ semitones: s.semitones, song: byId.get(s.id) })),
    setlist.dividers
  );

  const slides: Slide[] = [];
  for (const entry of entries) {
    if (entry.kind === "divider") {
      slides.push({ kind: "divider", name: entry.name });
      continue;
    }
    const { song, semitones } = entry.song;
    if (!song) continue;
    const { fontSize, pages } = paginateSong(song.body, semitones, song.originalKey);
    for (const page of pages) {
      slides.push({ kind: "song", title: song.title, fontSize, ...page });
    }
  }
  return slides;
}
