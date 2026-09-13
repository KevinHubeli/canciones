import {
  displayChord,
  parseSongLine,
  toEnglishNotation,
  transposeChord,
  wrapLine,
  type ChordNotation,
} from "@/lib/chords";

type ResolvedChord = { index: number; label: string; lookup: string };

export default function ChordLine({
  raw,
  semitones,
  notation,
  textSizeClass = "",
  interactive,
  maxCharsPerRow,
}: {
  raw: string;
  semitones: number;
  notation: ChordNotation;
  textSizeClass?: string;
  interactive: boolean;
  maxCharsPerRow?: number | null;
}) {
  const { lyrics, chords } = parseSongLine(raw);

  if (chords.length === 0) {
    return (
      <div className={`whitespace-pre font-mono ${textSizeClass} leading-relaxed text-mist/90`}>
        {lyrics || " "}
      </div>
    );
  }

  const resolved: ResolvedChord[] = chords.map((c) => ({
    index: c.index,
    label: displayChord(c.chord, semitones, notation),
    // El diagrama se busca siempre en notación inglesa (así lo esperan las
    // formas de guitarra/bajo); lo que se muestra respeta la preferencia del usuario.
    lookup: transposeChord(toEnglishNotation(c.chord), semitones),
  }));

  const rows = maxCharsPerRow
    ? wrapLine(lyrics, resolved, maxCharsPerRow)
    : [{ lyrics, chords: resolved }];

  return (
    <>
      {rows.map((row, ri) => (
        <div
          key={ri}
          className={`relative whitespace-pre font-mono ${textSizeClass} leading-relaxed pt-[1.3em]`}
        >
          <div className="absolute inset-x-0 top-0 h-[1.3em]">
            {row.chords.map((c, i) => (
              <span
                key={i}
                data-chord={interactive ? c.lookup : undefined}
                className={`absolute top-0 font-semibold text-chord-gold ${
                  interactive ? "cursor-pointer underline decoration-dotted underline-offset-4" : ""
                }`}
                style={{ left: `${c.index}ch` }}
              >
                {c.label}
              </span>
            ))}
          </div>
          <div className="text-mist/90">{row.lyrics || " "}</div>
        </div>
      ))}
    </>
  );
}
