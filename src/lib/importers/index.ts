import { importFromCifraClub } from "@/lib/importers/cifraclub";
import { importFromLaCuerda } from "@/lib/importers/lacuerda";
import {
  ImportError,
  isCifraClubHost,
  isLaCuerdaHost,
  parseImportUrl,
  type ImportedSong,
} from "@/lib/importers/shared";

/** Importa una canción desde una URL de Cifra Club o LaCuerda (valida el host antes de pedir nada). */
export async function importFromUrl(rawUrl: string): Promise<ImportedSong> {
  const url = parseImportUrl(rawUrl);
  if (isCifraClubHost(url.hostname)) return importFromCifraClub(url.toString());
  if (isLaCuerdaHost(url.hostname)) return importFromLaCuerda(url.toString());
  throw new ImportError("Solo se puede importar desde Cifra Club o LaCuerda.");
}
