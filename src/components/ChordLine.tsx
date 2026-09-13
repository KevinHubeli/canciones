import {
  displayChord,
  parseSongLine,
  toEnglishNotation,
  transposeChord,
  type ChordNotation,
} from "@/lib/chords";

export default function ChordLine({
  raw,
  semitones,
  notation,
  textSizeClass,
  interactive,
}: {
  raw: string;
  semitones: number;
  notation: ChordNotation;
  textSizeClass: string;
  interactive: boolean;
}) {
  const { lyrics, chords } = parseSongLine(raw);

  if (chords.length === 0) {
    return (
      <div className={`whitespace-pre font-mono ${textSizeClass} leading-relaxed text-mist/90`}>
        {lyrics || " "}
      </div>
    );
  }

  return (
    <div
      className={`relative whitespace-pre font-mono ${textSizeClass} leading-relaxed pt-[1.3em]`}
    >
      <div className="absolute inset-x-0 top-0 h-[1.3em]">
        {chords.map((c, i) => {
          // El diagrama se busca siempre en notación inglesa (así lo esperan las
          // APIs externas); lo que se muestra respeta la preferencia del usuario.
          const lookupChord = transposeChord(toEnglishNotation(c.chord), semitones);
          return (
            <span
              key={i}
              data-chord={interactive ? lookupChord : undefined}
              className={`absolute top-0 font-semibold text-chord-gold ${
                interactive ? "cursor-pointer underline decoration-dotted underline-offset-4" : ""
              }`}
              style={{ left: `${c.index}ch` }}
            >
              {displayChord(c.chord, semitones, notation)}
            </span>
          );
        })}
      </div>
      <div className="text-mist/90">{lyrics || " "}</div>
    </div>
  );
}
