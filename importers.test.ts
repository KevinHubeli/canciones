import {
  fetchHtml,
  guessOriginalKey,
  ImportError,
  isAllowedImportHost,
  NetworkImportError,
  parseImportUrl,
  slugToTitleCase,
  titleCase,
} from "./src/lib/importers/shared";
import { normalizeKeyHint } from "./src/lib/importers/key";
import { parseLaCuerdaHtml } from "./src/lib/importers/lacuerda";
import { parseCifraClubHtml } from "./src/lib/importers/cifraclub";
import {
  artistMatchesSlug,
  parseSearchResults,
  pickMatch,
  searchLaCuerda,
  type LaCuerdaCandidate,
} from "./src/lib/importers/lacuerdaSearch";
import { hasChords, lyricsSimilarity } from "./src/lib/text";
import { findJunkLines, removeJunkLines } from "./src/lib/junk";
import { parseChordPro } from "./src/lib/chordpro";

let failures = 0;
let passed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else {
    failures++;
    console.log(`  FAIL: ${name}${detail ? " — " + detail : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// Construye un body "[G]x [C]y" a partir de una progresión.
const prog = (...chords: string[]) => chords.map((c) => `[${c}]la`).join(" ");

async function rejects(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
}

async function main() {
  // AbortSignal.timeout no mantiene vivo el proceso: sin esto Node sale en el test del timeout.
  const keepAlive = setInterval(() => {}, 1000);
  // ---- titleCase ----
  eq("titleCase: tildes y artículos", titleCase("no hay dios como tú"), "No Hay Dios Como Tú");
  eq("titleCase: de/la/en en minúscula", titleCase("cristo en mí"), "Cristo en Mí");
  eq("titleCase: mayúsculas de entrada", titleCase("RENUÉVAME"), "Renuévame");
  eq("titleCase: primera palabra siempre capitalizada", titleCase("la fe de mi vida"), "La Fe de mi Vida");
  eq("titleCase: sin smallWords", titleCase("los del rio", { smallWords: false }), "Los Del Rio");
  eq("titleCase: comillas y paréntesis", titleCase('"santo" (en vivo)'), '"Santo" (en Vivo)');
  eq("slugToTitleCase: artista", slugToTitleCase("marcos_witt"), "Marcos Witt");
  eq("slugToTitleCase: guiones", slugToTitleCase("hillsong-worship"), "Hillsong Worship");

  // ---- guessOriginalKey ----
  eq("key: G C D G", guessOriginalKey(prog("G", "C", "D", "G")), "G");
  eq("key: Am F C G (relativa mayor)", guessOriginalKey(prog("Am", "F", "C", "G")), "C");
  eq("key: D A Bm G", guessOriginalKey(prog("D", "A", "Bm", "G")), "D");
  eq("key: arranca en el IV (C D G Em ...)", guessOriginalKey(prog("C", "D", "G", "Em", "C", "D", "G")), "G");
  eq("key: menor con V mayor (Am G F E)", guessOriginalKey(prog("Am", "G", "F", "E", "Am")), "Am");
  eq("key: menor frecuente (Em C G D Em Em)", guessOriginalKey(prog("Em", "C", "G", "D", "Em", "Em", "Am", "Em")), "Em");
  eq("key: bemoles se respetan", guessOriginalKey(prog("Bb", "Eb", "F", "Bb")), "Bb");
  eq("key: acordes con extensiones y bajos", guessOriginalKey(prog("Gsus", "Cmaj7", "D/F#", "G")), "G");
  eq("key: E A B C#m", guessOriginalKey(prog("A", "E", "B", "C#m")), "E");
  eq("key: sin acordes", guessOriginalKey("solo letra"), "C");
  eq("key: pista de la página gana", guessOriginalKey(prog("G", "C", "D"), "F#m"), "F#m");
  eq("key: pista inválida se ignora", guessOriginalKey(prog("G", "C", "D", "G"), "capo 2"), "G");
  eq("hint: Lam latino", normalizeKeyHint("Lam"), "Am");
  eq("hint: Sol", normalizeKeyHint("Sol"), "G");
  eq("hint: basura", normalizeKeyHint("tom: G mayor"), null);

  // ---- parseImportUrl / hosts ----
  check("host cifraclub", isAllowedImportHost("www.cifraclub.com"));
  check("host cifraclub.com.br", isAllowedImportHost("cifraclub.com.br"));
  check("host acordes.lacuerda.net", isAllowedImportHost("acordes.lacuerda.net"));
  check("host lacuerda.net.evil.com NO", !isAllowedImportHost("lacuerda.net.evil.com"));
  check("host evil-cifraclub.com NO", !isAllowedImportHost("evil-cifraclub.com"));
  eq("url sin protocolo", parseImportUrl("www.cifraclub.com/a/b/").toString(), "https://www.cifraclub.com/a/b/");
  check("url ftp rechazada", (await rejects((async () => parseImportUrl("ftp://cifraclub.com/a"))())) instanceof ImportError);
  check("url con usuario rechazada", (await rejects((async () => parseImportUrl("https://u:p@cifraclub.com/a"))())) instanceof ImportError);
  check("url con puerto raro rechazada", (await rejects((async () => parseImportUrl("https://cifraclub.com:8080/a"))())) instanceof ImportError);
  check("url ajena rechazada", (await rejects((async () => parseImportUrl("https://evil.com/a"))())) instanceof ImportError);

  // ---- fetchHtml con fetch simulado ----
  const html = (body: string, init?: ResponseInit) =>
    new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
  {
    const calls: string[] = [];
    const ok = await fetchHtml("https://www.cifraclub.com/a/b/", {
      fetchImpl: (async (u: string, init?: RequestInit) => {
        calls.push(u);
        check("fetch: redirect manual", init?.redirect === "manual");
        return html("<p>hola</p>");
      }) as unknown as typeof fetch,
    });
    eq("fetch: devuelve el html", ok, "<p>hola</p>");
  }
  {
    // Redirección dentro del mismo sitio: se sigue.
    let n = 0;
    const out = await fetchHtml("https://cifraclub.com/a/b/", {
      fetchImpl: (async () => {
        n++;
        if (n === 1) return new Response(null, { status: 301, headers: { location: "/c/d/" } });
        return html("final");
      }) as unknown as typeof fetch,
    });
    check("fetch: sigue redirección relativa", out === "final" && n === 2);
  }
  {
    // Redirección a otro host: se corta.
    let n = 0;
    const err = await rejects(
      fetchHtml("https://cifraclub.com/a/b/", {
        fetchImpl: (async () => {
          n++;
          return new Response(null, { status: 302, headers: { location: "https://evil.com/x" } });
        }) as unknown as typeof fetch,
      })
    );
    check("fetch: redirect a host ajeno falla", err instanceof NetworkImportError && n === 1);
  }
  {
    // Demasiados saltos.
    let n = 0;
    const err = await rejects(
      fetchHtml("https://cifraclub.com/a/", {
        fetchImpl: (async () => {
          n++;
          return new Response(null, { status: 302, headers: { location: `/loop${n}/` } });
        }) as unknown as typeof fetch,
      })
    );
    check("fetch: máx 3 redirecciones", err instanceof NetworkImportError && n === 4, `n=${n}`);
  }
  {
    const err = await rejects(
      fetchHtml("https://cifraclub.com/a/", {
        maxBytes: 100,
        fetchImpl: (async () => html("x".repeat(500))) as unknown as typeof fetch,
      })
    );
    check("fetch: tope de tamaño", err instanceof NetworkImportError);
  }
  {
    const err = await rejects(
      fetchHtml("https://cifraclub.com/a/", {
        fetchImpl: (async () =>
          new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch,
      })
    );
    check("fetch: content-type no html", err instanceof ImportError && !(err instanceof NetworkImportError));
  }
  {
    const err = await rejects(
      fetchHtml("https://cifraclub.com/a/", {
        fetchImpl: (async () => new Response("no", { status: 404, headers: { "content-type": "text/html" } })) as unknown as typeof fetch,
      })
    );
    check("fetch: 404 es error de red", err instanceof NetworkImportError);
  }
  {
    const t0 = Date.now();
    const err = await rejects(
      fetchHtml("https://cifraclub.com/a/", {
        timeoutMs: 60,
        fetchImpl: ((_: string, init?: RequestInit) =>
          new Promise((_res, rej) => {
            init?.signal?.addEventListener("abort", () => rej(new Error("abort")));
          })) as unknown as typeof fetch,
      })
    );
    check("fetch: timeout", err instanceof NetworkImportError && Date.now() - t0 < 2000);
  }
  {
    const err = await rejects(fetchHtml("https://evil.com/a"));
    check("fetch: host ajeno ni se pide", err instanceof ImportError);
  }

  // ---- búsqueda en LaCuerda ----
  const searchHtml = `<script>var hds=['marcos_witt','otro_artista','marcos_witt'];var fns=['renuevame','renuevame','renuevame'];</script>`;
  const cands = parseSearchResults(searchHtml);
  eq("search: parsea y deduplica", cands.map((c) => c.url), [
    "https://acordes.lacuerda.net/marcos_witt/renuevame",
    "https://acordes.lacuerda.net/otro_artista/renuevame",
  ]);
  eq("search: sin arrays => []", parseSearchResults("<html></html>"), []);
  {
    const err = await rejects(
      searchLaCuerda("x", {
        retryDelayMs: 1,
        fetchImpl: (async () => {
          throw new Error("boom");
        }) as unknown as typeof fetch,
      })
    );
    check("search: error de red lanza (no [])", err instanceof NetworkImportError);
    let n = 0;
    const res = await searchLaCuerda("x", {
      retryDelayMs: 1,
      fetchImpl: (async () => {
        n++;
        if (n < 3) throw new Error("boom");
        return html(searchHtml);
      }) as unknown as typeof fetch,
    });
    check("search: reintenta", n === 3 && res.length === 2);
  }

  // ---- pickMatch / artista ----
  check("artista: tildes y guiones", artistMatchesSlug("Jesús Adrián Romero", "jesus_adrian_romero"));
  check("artista: 'Los' ignorado", artistMatchesSlug("Los Hijos de la Luz", "hijos_de_la_luz"));
  check("artista: 'El' ignorado al revés", artistMatchesSlug("Marcos Witt", "el_marcos_witt") === true);
  check("artista: lista con coma", artistMatchesSlug("Hillsong, Marcos Witt", "marcos_witt"));
  check("artista: distinto", !artistMatchesSlug("Marcos Witt", "marcos_brunet"));
  check("artista: prefijo no alcanza", !artistMatchesSlug("Marcos", "marcos_witt"));

  const mk = (artistSlug: string, songSlug: string): LaCuerdaCandidate => ({
    artistSlug,
    songSlug,
    url: `https://acordes.lacuerda.net/${artistSlug}/${songSlug}`,
  });
  const santo = [mk("hillsong", "santo"), mk("marcos_witt", "santo"), mk("x", "santo_santo")];
  eq("pick: artista coincide", pickMatch({ title: "Santo", artist: "Marcos Witt" }, santo).candidate?.artistSlug, "marcos_witt");
  eq("pick: artista no coincide", pickMatch({ title: "Santo", artist: "Miel San Marcos" }, santo).reason, "artist-mismatch");
  eq("pick: sin artista y varios => ambiguous", pickMatch({ title: "Santo", artist: "" }, santo).reason, "ambiguous");
  eq("pick: sin artista y único => ok", pickMatch({ title: "Renuévame", artist: "" }, [mk("marcos_witt", "renuevame"), mk("a", "otra")]).reason, "ok");
  eq("pick: título distinto", pickMatch({ title: "Aleluya", artist: "" }, santo).reason, "no-exact-title");
  eq("pick: sin candidatos", pickMatch({ title: "Aleluya", artist: "" }, []).reason, "no-candidates");
  eq("pick: título con tildes y signos", pickMatch({ title: "¡Renuévame!", artist: "marcos witt" }, [mk("marcos_witt", "renuevame")]).reason, "ok");

  // ---- similitud de letras ----
  const letraA = "[D]Renuévame Señor Jesús [G]ya no quiero ser igual [A]pon en mí tu corazón";
  const letraB = "Renuevame Senor Jesus\nya no quiero ser igual\npon en mi tu corazon\nPorque todo lo que hay dentro de mi";
  check("similitud: misma letra con/sin acordes y tildes", lyricsSimilarity(letraA, letraB) > 0.9, String(lyricsSimilarity(letraA, letraB)));
  const otra = "Santo santo santo Dios todopoderoso\ntemprano por la mañana te buscaré\nsanto santo santo siempre digno de adoración";
  const santoUsuario = "Santo, santo, santo es el Señor\nllena está la tierra de su gloria\nhosanna en las alturas";
  check("similitud: otra canción con el mismo título < 0.45", lyricsSimilarity(santoUsuario, otra) < 0.45, String(lyricsSimilarity(santoUsuario, otra)));
  check("similitud: versión incompleta del usuario sigue pasando", lyricsSimilarity("Renuévame Señor Jesús\nya no quiero ser igual", letraB) > 0.9);
  eq("similitud: usuario vacío => 1", lyricsSimilarity("", letraB), 1);
  eq("similitud: importada vacía => 0", lyricsSimilarity(letraB, ""), 0);
  check("hasChords", hasChords("a [Am]b"));
  check("hasChords: sin acordes", !hasChords("solo letra"));

  // ---- parseo de LaCuerda (fixture chico) ----
  const lacuerdaHtml = `<html><head><meta property="og:title" content="RENUEVAME: Acordes y Letra para Guitarra, Piano y Ukulele (Marcos Witt)" /></head><body>
<div id=r_head><H1>Renuévame <br><A href="./">Marcos Witt</A></H1><H2>Letras</H2></div>
<div class='rtBody'><pre>// Intro: <A>D</A>  <A>G</A>  <A>A</A> //

<A>D</A>       <A>G</A>   <A>A</A>       <A>D</A>
Renuevame Señor Jesus
<A>G</A>       <A>Em</A>         <A>A</A>     A/C#m
pon en mí tu corazon
</pre></div></body></html>`;
  {
    const song = parseLaCuerdaHtml(lacuerdaHtml, "https://acordes.lacuerda.net/marcos_witt/renuevame");
    eq("lacuerda: título del h1 con tilde", song.title, "Renuévame");
    eq("lacuerda: artista del h1", song.artist, "Marcos Witt");
    check("lacuerda: acorde suelto A/C#m rescatado", song.body.includes("[A/C#m]"), song.body);
    check("lacuerda: acordes mezclados con la letra", song.body.includes("[D]Renuevam"), song.body);
    check("lacuerda: la etiqueta Intro se conserva", song.body.startsWith("Intro: [D]"), song.body);
    eq("lacuerda: tono estimado", song.originalKey, "D");
  }
  {
    const noH1 = `<html><head><meta property="og:title" content="NO HAY DIOS COMO TÚ: Acordes y Letra" /></head><body><pre><A>G</A>   <A>C</A>
No hay dios como tú</pre></body></html>`;
    const song = parseLaCuerdaHtml(noH1, "https://acordes.lacuerda.net/jesus_adrian_romero/no_hay_dios_como_tu");
    eq("lacuerda: og:title con titleCase", song.title, "No Hay Dios Como Tú");
    eq("lacuerda: artista del slug", song.artist, "Jesus Adrian Romero");
  }

  // ---- parseo de Cifra Club (fixture chico) ----
  const cifraHtml = `<html><head><title>Cristo en mí - Hillsong - Cifra Club</title></head><body>
<span id="cifra_tom">tom: <a href="#">E</a></span>
<pre data-chord-content="true"><b>C</b>        <b>G</b>
Cristo en mí
<b>Am</b>       <b>F</b>
Mi esperanza
</pre></body></html>`;
  {
    const song = parseCifraClubHtml(cifraHtml, "https://www.cifraclub.com/hillsong/cristo-en-mi/");
    eq("cifraclub: título/artista del <title>", [song.title, song.artist], ["Cristo en mí", "Hillsong"]);
    eq("cifraclub: usa el tono de la página", song.originalKey, "E");
    check("cifraclub: cuerpo", song.body.includes("[C]Cristo") && song.body.includes("[Am]Mi"), song.body);
    const sinTono = parseCifraClubHtml(cifraHtml.replace(/<span id="cifra_tom">.*<\/span>/, ""), "https://www.cifraclub.com/hillsong/cristo-en-mi/");
    eq("cifraclub: sin tono estima con acordes", sinTono.originalKey, "C");
  }

  // ---- junk ----
  const junkOf = (s: string) => findJunkLines(s).map((j) => j.text);
  eq("junk: Piano/Bajo en frases no", junkOf("Piano en la noche\nBajo tu mirada\nSolo de piano\nTocá el bajo"), []);
  eq("junk: 'Piano:' es rótulo", junkOf("Piano:"), []);
  eq("junk: Piano/Bajo sueltos sí (menú)", junkOf("Guitarra\nPiano\nBajo\nTeclado"), ["Guitarra", "Piano", "Bajo", "Teclado"]);
  eq("junk: capo", junkOf("Capo en el traste 2\nCapotraste 3\nCapo: 2\nCejilla en 3"), ["Capo en el traste 2", "Capotraste 3", "Capo: 2", "Cejilla en 3"]);
  eq("junk: capo en frases no", junkOf("Capo en tu corazón"), []);
  eq("junk: afinación", junkOf("Afinación\nAfinación: E A D G B E\nAfinación estándar"), ["Afinación", "Afinación: E A D G B E", "Afinación estándar"]);
  eq("junk: tono y dificultad", junkOf("Tono: G\nTom: C\nDificultad: Principiante\nTonalidad"), ["Tono: G", "Tom: C", "Dificultad: Principiante", "Tonalidad"]);
  eq("junk: frases normales con 'tono' no", junkOf("El tono de tu voz\nTono de gloria"), []);
  eq("junk: con acordes nunca", junkOf("[Am]Tono: G"), []);
  eq("removeJunkLines", removeJunkLines("Capo en el traste 2\n\n[G]Hola\nGuitarra\nmundo"), "[G]Hola\nmundo");

  // ---- ChordPro ----
  {
    const r = parseChordPro(`﻿# comentario\n{title: Cristo en mí}\n{artist: Hillsong}\n{key: Am}\n{tempo: 72}\n{start_of_chorus}\n[Am]Cristo en [F]mí\n{end_of_chorus}\n{c: Puente}\n[G]Hola\n{define: Am base-fret 1}`);
    eq("chordpro: título", r.title, "Cristo en mí");
    eq("chordpro: artista", r.artist, "Hillsong");
    eq("chordpro: tono", r.key, "Am");
    eq("chordpro: tempo", r.bpm, 72);
    eq("chordpro: cuerpo", r.body, "Coro:\n[Am]Cristo en [F]mí\n\nPuente:\n[G]Hola");
  }
  {
    const r = parseChordPro("{t:Santo}\n{st:Miel San Marcos}\n{tempo: 999}\n{soc: Coro 2}\nA\n{eoc}\n{sot}\nE|--0--|\n{eot}\nfin");
    eq("chordpro: abreviaturas", [r.title, r.artist], ["Santo", "Miel San Marcos"]);
    eq("chordpro: tempo fuera de rango", r.bpm, undefined);
    eq("chordpro: etiqueta propia y tab ignorada", r.body, "Coro 2:\nA\n\nfin");
  }
  {
    const r = parseChordPro("[Am]Hola [*nota]mundo\r\n\r\n\r\n\r\nchau [ G ]");
    eq("chordpro: txt sin directivas + anotaciones + espacios", r.body, "[Am]Hola mundo\n\nchau [G]");
    eq("chordpro: sin metadatos", [r.title, r.artist, r.key, r.bpm], [undefined, undefined, undefined, undefined]);
  }

  clearInterval(keepAlive);
  console.log(`RESULTADO: ${passed} OK, ${failures} FAIL`);
  if (failures > 0) process.exit(1);
}

main();
