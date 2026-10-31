export type SongSummary = {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  category: string | null;
  tags: string[];
  updatedAt: string;
};

export type Song = SongSummary & {
  body: string;
  /** Tempo en pulsos por minuto (30–300), si se cargó. */
  bpm: number | null;
  /** Notas libres para el equipo ("entra en el 2º verso"). */
  notes: string | null;
};
