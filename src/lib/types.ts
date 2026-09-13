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
};
