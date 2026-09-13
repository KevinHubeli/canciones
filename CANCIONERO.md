# Especificación: "Cancionero", cancionero de acordes propio (tipo lacuerda.net)

> **Para quién es:** un agente (Claude) que tiene que construir esta app **desde cero** en un repositorio nuevo (no es parte de "Nacidas para este tiempo" ni la modifica).
> **Qué es:** un sitio donde **nosotros cargamos nuestros propios temas** (letra + acordes, como en la imagen de referencia: línea de acordes arriba, línea de letra abajo) y cualquiera los puede buscar y tocar/cantar desde el celular, con las mismas herramientas que un cancionero de acordes clásico: **mostrar/ocultar menú, desfile automático, diagramas de acordes, cambio de tono, notación inglés/latino (C↔Do) y formato del texto**.
> **No hay archivos de audio ni de imagen que subir**: todo el contenido es texto (letra + acordes), así que **no hace falta Vercel Blob**. Solo Next.js + Neon + Drizzle.
> **Estructura:** partes 1 a 3 explican la app, la parte 4 cubre los MCP, la parte 5 es el paso a paso y la parte 6 trae el código completo de los archivos clave.

---

## PARTE 1: Qué es y cómo funciona

### 1.1 Qué hace

Web app **pensada para celular** (se usa en vivo, en el atril, mientras se toca) para ver y administrar canciones con acordes.

| Rol | Qué puede hacer | Login |
|---|---|---|
| **Visitante** (músico/a) | Buscar canciones por título o artista, abrir una y verla con letra + acordes, y usar las 6 herramientas del menú flotante (ver 2.5) | No |
| **Admin** | Iniciar sesión, **cargar canciones nuevas** (texto con acordes), **editarlas** y **eliminarlas** | Sí |

Todos los textos van en **español rioplatense** (voseo: "Buscá", "Tocá", "Ingresá").

### 1.2 El formato de una canción (lo esencial de todo el proyecto)

Se escribe el acorde **pegado, entre corchetes, justo antes de la sílaba** donde va:

```
//[Dm]Lara lara la-la [Gm]lara lara la-la [Dm]lara la [A7]la la la la [Dm]la//

//[Dm]Cantare a Jehová por [Gm]siempre

[Dm]Su diestra es todo [A7]poder[Dm] //
```

- Esto es **texto plano guardado tal cual** en la base (una canción = un string largo con saltos de línea). No es un editor "WYSIWYG": el admin escribe/pega el texto con esta convención, igual que en los cancioneros de acordes de toda la vida.
- Al **mostrarla**, el frontend separa cada línea en "letra sin acordes" + "lista de acordes con la posición (columna) donde iban", y dibuja los acordes en una fila arriba, alineados por columna con la letra de abajo — igual que la imagen de referencia. Esto se explica en detalle en 2.6.
- Si una línea no tiene ningún `[Acorde]`, se muestra como texto suelto (por ejemplo, un comentario o una instrucción tipo "(Repetir estribillo)").

### 1.3 Stack

| Pieza | Tecnología | Versión |
|---|---|---|
| Framework | **Next.js**, App Router, carpeta `src/` | `16.2.12` |
| UI | **React** / React DOM | `19.2.4` |
| Lenguaje | **TypeScript** strict | `^5` |
| Estilos | **Tailwind CSS v4** (`@tailwindcss/postcss`, sin `tailwind.config.js`, tema en `globals.css` con `@theme inline`) | `^4` |
| Base de datos | **Neon** (Postgres serverless), vía Marketplace de Vercel | — |
| ORM | **Drizzle ORM**, `drizzle-orm/neon-http` + `@neondatabase/serverless` | `^0.45.2` / `^1.1.0` |
| Migraciones | **drizzle-kit** | `^0.31.10` |
| Archivos | **Ninguno.** Todo el contenido es texto en Neon. No se usa Vercel Blob. | — |
| Íconos | **lucide-react** | `^1.27.0` |
| Fuentes | `next/font/google`: **Quicksand** (UI), **Cinzel** (títulos formales), **JetBrains Mono** (letra + acordes, monoespaciada — imprescindible para que el acorde quede alineado arriba de la sílaba) | — |
| Linter | ESLint 9 (flat config) + `eslint-config-next` | `^9` / `16.2.12` |
| Autenticación | Propia: cookie httpOnly con token HMAC-SHA256 (Web Crypto), igual patrón que "Nacidas para este tiempo" | — |
| Hosting | **Vercel** | — |

⚠️ **Next.js 16 tiene cambios que rompen convenciones viejas.** Antes de escribir código, leer `node_modules/next/dist/docs/`. Los mismos puntos que en cualquier proyecto de esta versión:
- Middleware en **`src/proxy.ts`**, exporta `proxy` (no `middleware.ts`).
- `searchParams` de una página es **Promise** → `await searchParams`.
- `cookies()` de `next/headers` es **async** → `await cookies()`.
- Los `GET` de Route Handlers no se cachean por defecto.

### 1.4 Arquitectura

```
                       ┌──────────────── Vercel ────────────────┐
 Navegador             │  Next.js (Functions)                   │
 ─────────             │                                        │
 Buscar/Lista ────GET /api/songs?q=&offset=──▶ listSongs() ──▶ Neon (tabla songs)
                       │                                        │
 Abrir canción ───GET /api/songs/[id]───────▶ getSong() ──────▶ Neon
   (se parsea y renderiza 100% en el navegador: transponer,     │
    notación, diagramas y desfile son client-side, no pegan     │
    contra el servidor de nuevo)                                │
                       │                                        │
 Admin: crear/editar ─POST/PATCH /api/songs {title,artist,body}─▶ Neon
 Admin: borrar ───────DELETE /api/songs {id}────────────────────▶ Neon
                       └────────────────────────────────────────┘
```

- Todo el trabajo "pesado" (parsear acordes, transponer, dibujar diagramas) se hace **en el cliente**, sobre el `body` de texto que ya se trajo. Así cambiar de tono o de notación es instantáneo, sin ida y vuelta al servidor.
- No hay Blob ni `head()`/`del()` de archivos: es un CRUD de texto sobre Neon, más simple que "Nacidas para este tiempo".

### 1.5 Estructura de archivos

```
.
├── AGENTS.md / CLAUDE.md
├── .env.example
├── .gitignore
├── drizzle.config.ts
├── drizzle/                    # Migraciones (se commitean)
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
└── src/
    ├── proxy.ts                 # Protege /admin/* → redirige a /admin/login
    ├── db/
    │   ├── schema.ts            # Tabla songs (Drizzle)
    │   └── index.ts             # getDb()
    ├── lib/
    │   ├── types.ts             # type Song
    │   ├── session.ts           # Token HMAC, cookie, requireAdmin()
    │   ├── rateLimit.ts         # Rate limit de intentos de login
    │   ├── chords.ts            # Parseo de línea, transposición, notación ES/EN
    │   └── importers/
    │       ├── cifraclub.ts     # Scraper de cifraclub.com → {title, artist, originalKey, body}
    │       └── lacuerda.ts      # Scraper de lacuerda.net → idem
    ├── components/
    │   ├── SpaBackground.tsx
    │   ├── BottomNav.tsx        # Inicio, Buscar, Admin
    │   ├── Spinner.tsx
    │   ├── SongList.tsx         # Buscador + lista con paginación
    │   ├── SongViewer.tsx       # Letra+acordes, el menú flotante y todo su estado
    │   ├── ChordLine.tsx        # Dibuja una línea (acordes arriba, letra abajo)
    │   ├── ChordDiagramPopover.tsx
    │   ├── FabMenu.tsx          # El menú flotante circular de la imagen
    │   ├── LoginForm.tsx
    │   ├── LogoutButton.tsx
    │   └── SongForm.tsx         # Alta/edición con vista previa en vivo
    └── app/
        ├── layout.tsx
        ├── globals.css
        ├── page.tsx             # "/" — bienvenida + buscador rápido + últimas agregadas
        ├── canciones/page.tsx   # "/canciones" — lista completa con búsqueda
        ├── canciones/[id]/page.tsx  # "/canciones/:id" — el visor
        ├── admin/page.tsx
        ├── admin/login/page.tsx
        ├── admin/nueva/page.tsx
        ├── admin/[id]/editar/page.tsx
        └── api/
            ├── songs/route.ts        # GET (lista+búsqueda) · POST (crear, admin)
            ├── songs/[id]/route.ts   # GET (una canción) · PATCH · DELETE (admin)
            ├── songs/import/route.ts # POST (admin): scraping de Cifra Club/LaCuerda
            ├── chord-diagram/route.ts# GET: Uberchord + Chords API con caché
            └── auth/login/route.ts · auth/logout/route.ts
```

---

## PARTE 2: Especificación funcional

### 2.1 Páginas

| Ruta | Contenido |
|---|---|
| `/` | Eyebrow **"Nuestro cancionero"** → título (Cinzel) → buscador grande → "Agregadas últimamente" (lista corta de 5) → link "Ver todas" |
| `/canciones` | Buscador (por título/artista, con debounce) + chips de categoría opcionales + lista con scroll infinito (24 por página, mismo patrón `?limit&offset` que otros proyectos) |
| `/canciones/[id]` | El **visor**: título, artista, tono actual, el texto renderizado con `ChordLine`, y el `FabMenu` flotante abajo a la derecha |
| `/admin/login` | Igual patrón que "Nacidas": `?next=` solo si empieza con `/admin` |
| `/admin` | Lista de canciones propias con buscador, botón "+ Nueva canción", editar y eliminar (con `confirm()`) |
| `/admin/nueva` | `SongForm` vacío: título, artista, tono original, categoría, textarea del `body` con vista previa en vivo al costado (o abajo en mobile). Incluye un botón **"Importar desde una URL"** que abre un campo para pegar un link de Cifra Club o LaCuerda y precarga el formulario (ver 2.9) — el admin siempre revisa/edita antes de guardar |
| `/admin/[id]/editar` | `SongForm` precargado con la canción |

### 2.2 API

| Método y ruta | Auth | Entrada | Salida |
|---|---|---|---|
| `GET /api/songs?q=&limit=&offset=` | Pública | query opcional | `200 { songs: SongSummary[], hasMore }` — `SongSummary` sin `body`, para que la lista pese poco |
| `GET /api/songs/[id]` | Pública | — | `200 { song: Song }` (con `body` completo) · `404 { error: "No encontramos esa canción." }` |
| `POST /api/songs` | Admin | `{ title, artist, originalKey, category?, body }` | `401` · `400 { error: "Falta el título." }` / `"Falta la letra." }` · `200 { song }` |
| `PATCH /api/songs/[id]` | Admin | mismos campos, parciales | `401` · `404` · `200 { song }` |
| `DELETE /api/songs/[id]` | Admin | — | `401` · `404` · `200 { ok: true }` |
| `POST /api/songs/import` | Admin | `{ url }` (de cifraclub.com o lacuerda.net) | `200 { title, artist, originalKey, body }` — **no guarda nada**, solo devuelve los campos ya parseados para precargar `SongForm`; el admin decide si guarda · `400 { error: "No pudimos leer esa página." }` si el scraping falla o el sitio no es soportado |
| `GET /api/chord-diagram?name=` | Pública | query `name` (notación inglesa) | `200 { positions }` · `404 { error: "Diagrama no disponible para este acorde." }` (ver 2.8) |
| `POST /api/auth/login` | — | `{ username, password }` | igual patrón que "Nacidas": 200+cookie / 401 / 429 (rate limit) / 500 |
| `POST /api/auth/logout` | — | — | `200 { ok: true }` + borra cookie |

El proxy no cubre `/api`; cada ruta de admin llama a `requireAdmin()`.

### 2.3 Base de datos (Neon + Drizzle)

Una sola tabla, `songs`:

| Columna | Tipo | Detalle |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `title` | `text` | NOT NULL |
| `artist` | `text` | NOT NULL |
| `original_key` | `text` | NOT NULL — tono en el que está escrita (ej. `"Dm"`), es el punto de partida del cambio de tono |
| `category` | `text` | Opcional (ej. "Alabanza", "Adoración", "Congreso") |
| `body` | `text` | NOT NULL — el texto completo con acordes entre `[corchetes]` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()`, se pisa en cada `PATCH` |

Índices: `songs_title_idx` (btree sobre `title`) para ordenar/alfabetizar, y búsqueda por `ILIKE '%q%'` sobre `title`/`artist` (alcanza para el volumen esperado; si algún día son miles de canciones, pasar a `tsvector`).

```sql
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"original_key" text NOT NULL,
	"category" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "songs_title_idx" ON "songs" USING btree ("title");
```

**Scripts:** `db:generate` / `db:migrate` / `db:studio`, igual que siempre. `DATABASE_URL` para la app, `DATABASE_URL_UNPOOLED` para migraciones. **Build Command** en Vercel: `npm run db:migrate && npm run build` (para que las ramas de preview de Neon también tengan la tabla).

### 2.4 Autenticación

Idéntico patrón a "Nacidas para este tiempo": `ADMIN_USER` / `ADMIN_PASSWORD` / `SESSION_SECRET` obligatorios sin default, token `base64url(payload).base64url(HMAC-SHA256)` de 30 días, cookie `cancionero_session` httpOnly/secure/sameSite=lax, `src/proxy.ts` protegiendo `/admin/:path*` + `requireAdmin()` en cada ruta de admin, y **rate limiting** en `/api/auth/login` (5 intentos / 10 minutos por IP, en memoria — best-effort, no distribuido entre instancias).

### 2.5 El menú flotante (`FabMenu`) — el corazón de la UX

Botón circular naranja fijo abajo a la derecha del visor que, al tocarlo, despliega 6 botones (como en la imagen de referencia). Cada uno abre/activa lo siguiente:

1. **Mostrar/Ocultar Menú** — colapsa el `FabMenu` a un solo botón (para no tapar la letra mientras se toca).
2. **Desfile Automático** — inicia/pausa un auto-scroll del contenedor de la letra (`scrollBy({ top: 1 })` cada ~40 ms, velocidad configurable con dos botones +/− que aparecen mientras está activo). Se pausa solo si el usuario hace scroll manual.
3. **Diagramas de Acordes** — activa un modo donde cada acorde de la canción se puede tocar y muestra un `ChordDiagramPopover` con el diagrama de guitarra (mástil con los dedos).
4. **Cambio de Tono** — abre un selector con `−` / `+` (semitonos) y muestra el tono resultante; transpone **todos** los acordes de la canción en el cliente, sin tocar el `body` guardado.
5. **Cifrado Inglés/Latino** — alterna la notación de las **raíces** de los acordes entre `C D E F G A B` y `Do Re Mi Fa Sol La Si` (los sufijos `m`, `7`, `sus4`, etc. no cambian).
6. **Formato del Texto** — abre `A−` / `A+` para el tamaño de letra de la letra+acordes (persistido en `localStorage`, es preferencia del dispositivo, no hace falta guardarlo en la base).

Todas las preferencias (tono elegido, notación, tamaño de letra, velocidad de desfile) son **puramente client-side** (estado de React + `localStorage`), no se mandan al servidor: la canción guardada nunca cambia.

### 2.6 Cómo se dibuja una línea con acordes (`ChordLine` + `lib/chords.ts`)

1. `parseLine(raw: string)` recorre el string y separa:
   - `lyrics`: el texto **sin** los `[Acorde]` (por ejemplo `"Cantare a Jehová por siempre"`).
   - `chords: { index: number; chord: string }[]`: la posición **en `lyrics`** (no en `raw`) donde iba cada acorde, y el nombre del acorde tal cual se escribió.
2. Al renderizar, se usan **dos filas superpuestas en una grilla monoespaciada** (`font-mono`, `JetBrains Mono`): una fila de acordes con cada uno en `position: absolute; left: {index}ch` (la unidad `ch` = ancho de un carácter en fuente monoespaciada, por eso la alineación es exacta) y debajo la fila de letra en flujo normal.
3. **Transponer no rompe la alineación**: solo cambia el *texto* que se muestra en cada acorde (`Dm` → `D#m` → `Em`...), nunca su `index`, que sigue ligado a la letra original.
4. Acordes sin letra debajo (línea puramente instrumental, como el primer renglón del ejemplo) se soportan igual: `lyrics` puede tener espacios/guiones sueltos (`"lara lara la-la..."`) y los acordes se posicionan sobre esos caracteres tal cual estén escritos.

### 2.7 Transposición (`transposeChord`)

- Notas cromáticas con sostenidos: `["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]`.
- Regex para separar un acorde en raíz + sufijo: `/^([A-G])(#|b)?(.*)$/`. Si tiene bemol (`b`), se normaliza a su equivalente con sostenido antes de ubicarlo en la escala (simplificación aceptada: el resultado transpuesto siempre se muestra con sostenidos, no con bemoles — se documenta como limitación conocida).
- `transposeChord(chord, semitones)`: ubica el índice de la raíz, suma `semitones` (con módulo 12, positivo), arma `nuevaRaíz + sufijo`.
- El selector de tono va de **−11 a +11** semitonos respecto del tono en que se cargó la canción (`original_key`), mostrando siempre el nombre del tono resultante (ej. "Tono: Em").

### 2.8 Diagramas de acordes (`lib/chordDiagrams.ts` + `/api/chord-diagram`)

App **privada** (no pública/no redistribuye contenido de terceros a desconocidos), así que en vez de un diccionario propio se consumen dos APIs externas gratuitas, con una ruta propia como capa de caché:

- **[Uberchord API](https://api.uberchord.com/)** (`GET https://api.uberchord.com/v1/chords?nameStrict=<acorde>`): digitaciones reales de guitarra (qué traste y dedo por cuerda) para el acorde pedido.
- **[The Chords API](https://chords.alday.dev/)**: notas/tipo de acorde, como respaldo cuando Uberchord no tiene el acorde exacto (por ejemplo variantes con bajo alterado).
- **`GET /api/chord-diagram?name=<acorde>`** (propia, pública): recibe el nombre ya normalizado a notación inglesa (la conversión Do↔C se hace antes de pedir, las APIs externas no entienden "Do"), llama primero a Uberchord y si no hay resultado prueba con The Chords API, y devuelve `{ positions: FretPosition[] } | { error }`. Se cachea en memoria del servidor por nombre de acorde (`Map`, TTL largo tipo 24 h) para no repetir la llamada externa en cada canción que use el mismo acorde, y en el cliente con `sessionStorage` para no volver a pedirlo ni siquiera entre canciones de la misma visita.
- `ChordDiagramPopover` dibuja un mini-mástil en SVG (6 líneas verticales = cuerdas, 5 horizontales = trastes) con un punto en cada posición, a partir de la respuesta de `/api/chord-diagram`.
- Si ninguna de las dos APIs tiene el acorde, o si fallan (timeout, caídas), se muestra "Diagrama no disponible para este acorde" en vez de romper — nunca se bloquea la vista de la letra por esto.
- Como son servicios de terceros sin SLA garantizado, un timeout corto (ej. 2.5 s por llamada) evita que un servicio lento trabe el `FabMenu`.

### 2.9 Importar canciones desde Cifra Club / LaCuerda (`lib/importers/`)

App **privada para uso interno**, así que se permite traer contenido de estos dos sitios para no tener que tipear todo el cancionero a mano — pero siempre como **borrador editable**, nunca como guardado automático:

- `POST /api/songs/import { url }` detecta el sitio por el dominio (`cifraclub.com` / `cifraclub.com.br` → `lib/importers/cifraclub.ts`; `lacuerda.net` → `lib/importers/lacuerda.ts`) y devuelve `{ title, artist, originalKey, body }` ya convertido al formato `[Acorde]letra` de este proyecto.
- Cada importador: 1) hace `fetch(url)` de la página pública, 2) extrae el bloque de cifrado (en ambos sitios es un `<pre>`/contenedor con spans para cada acorde intercalados en el texto), 3) recorre línea por línea reconstruyendo `[Acorde]` en la posición exacta donde el sitio lo tenía.
- **Es scraping de HTML, no una API oficial**: si el sitio cambia su estructura de página, el importador puede romperse. Por eso cada importador es un archivo aislado y chico (fácil de arreglar) y `POST /api/songs/import` nunca tira un 500 feo: si no reconoce la estructura, responde `400 { error: "No pudimos leer esa página. Cargala manualmente." }` y el admin sigue con el formulario en blanco.
- Rate/uso: como es una herramienta de admin (autenticada) y de uso ocasional, no hace falta cachear ni limitar esto — cada importación es una llamada puntual mientras se arma el cancionero.
- Es **solo un atajo para escribir menos**: el resultado siempre pasa por el textarea del `SongForm` antes de guardarse, así el admin corrige cualquier cosa que el importador haya interpretado mal (tono detectado, símbolos raros, etc.) antes de que quede en la base.

---

## PARTE 3: Diseño visual

### 3.1 Criterio

Estética cálida y legible pensada para **leerse en el atril con poca luz**: fondo oscuro (mejor contraste, no encandila), acordes en un color bien distinguible de la letra (naranja/dorado, como en la referencia) y tipografía monoespaciada grande para la letra.

### 3.2 Paleta (sugerida, se define en `:root` + `@theme inline`)

| Token | Hex | Uso |
|---|---|---|
| `night` | `#1a1420` | Fondo general, tarjetas |
| `plum-deep` | `#2e2338` | Fondo del body, superficies |
| `plum` | `#4a3a5c` | Bordes, superficies elevadas |
| `mist` | `#f6f1fa` | Texto principal, títulos |
| `lilac-light` | `#c9b8d9` | Textos secundarios, labels |
| **`chord-gold`** | **`#e8a94a`** | **Color de los acordes** — es lo primero que el ojo tiene que encontrar |
| `accent` | `#f0824a` | Botón del `FabMenu`, acciones principales (mismo tono naranja que la referencia) |

Contraste verificado con la fórmula WCAG (AA ≥ 4.5:1 para texto normal): `mist` sobre `plum-deep` y `chord-gold` sobre `plum-deep` superan 7:1.

### 3.3 Tipografía

- `--font-sans` = Quicksand (UI general).
- `--font-display` = Cinzel (títulos de página).
- `--font-mono` = **JetBrains Mono** — obligatoria para `ChordLine`, es lo que garantiza que `1ch` sea un ancho constante y los acordes queden alineados.
- Tamaño de letra de `ChordLine` configurable entre 3 pasos (`text-sm` / `text-base` / `text-lg`) vía "Formato del Texto".

### 3.4 Responsive / mobile

- Mobile-first: `ChordLine` con `overflow-x-auto` por si una línea muy larga no entra en pantallas chicas (en vez de achicar la letra hasta ilegible).
- `FabMenu` con los 6 botones en semicírculo sobre el borde inferior derecho en mobile (como la referencia) y en columna vertical fija a la derecha en pantallas ≥ `sm`.
- `BottomNav` flotante igual que en "Nacidas para este tiempo": Inicio / Buscar / Admin, con `env(safe-area-inset-bottom)` para no chocar con la barra de gestos de iOS.
- Los popovers de diagramas y el selector de tono se abren como *sheet* desde abajo en mobile (`fixed inset-x-0 bottom-0`) y como popover flotante en desktop.
- Objetivo táctil mínimo 44×44px en todos los botones del `FabMenu` (son los que se tocan con la app en el atril, muchas veces con apuro).

### 3.5 Metadata

- `title`: `"Cancionero"` (placeholder — cambiar por el nombre real que se elija)
- `description`: `"Nuestras canciones con acordes: buscá, cambiá el tono y tocá desde el celular."`
- `<html lang="es">`, `color-scheme: dark`, `themeColor: "#2e2338"`

---

## PARTE 4: MCP (herramientas para que Claude opere Vercel y Neon)

Igual que en cualquier proyecto de este tipo — acá **no hace falta Blob**, así que solo importan dos:

### 4.1 MCP de Vercel

```bash
claude mcp add --transport http vercel https://mcp.vercel.com
```
Después `/mcp` en Claude Code para autenticarse. Sirve para revisar builds/logs, ver deploys y hacer `deploy_to_vercel`. **No** crea integraciones de Marketplace ni carga env vars — eso es CLI/dashboard.

### 4.2 MCP de Neon

```bash
npx neon@latest init
# o: claude mcp add --transport http neon https://mcp.neon.tech/mcp
```
Sirve para confirmar que la tabla `songs` existe, mirar filas ("¿cuántas canciones hay cargadas?"), y comparar esquemas. **Los cambios de estructura siempre van por `schema.ts` + `db:generate` + `db:migrate`**, nunca por SQL suelto desde el MCP.

### 4.3 Seguridad

Conectar un MCP da a Claude el mismo acceso que la cuenta del usuario en Vercel/Neon. Mantener confirmación manual para deploys a producción y para cualquier SQL que borre datos.

---

## PARTE 5: Paso a paso

### 5.1 Crear el proyecto

```bash
npx create-next-app@16.2.12 cancionero --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd cancionero
npm install @neondatabase/serverless@^1.1.0 drizzle-orm@^0.45.2 lucide-react@^1.27.0
npm install -D drizzle-kit@^0.31.10
```

Leer `node_modules/next/dist/docs/`. Borrar el contenido de ejemplo y crear los archivos de la Parte 6.

### 5.2 Conectar Vercel y Neon

1. Subir a GitHub e importar en Vercel (o `vercel link`).
2. **Neon:** Storage → Create Database → Neon (Marketplace) → conectar a los 3 entornos. Carga `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, etc. Activar ramas de preview si se quiere.
3. Variables de admin en los 3 entornos: `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 32`).
4. `vercel env pull .env.local`.
5. Build Command: `npm run db:migrate && npm run build`.

### 5.3 Base de datos y prueba local

1. `npm run db:generate` (commitear `drizzle/`) → `npm run db:migrate`.
2. `npm run dev` y probar:
   - `/admin` sin sesión → redirige a login.
   - Login correcto → entra; `/admin/nueva` → cargar el ejemplo de la Parte 1.2 → guardar.
   - `/canciones/[id]` muestra la letra con los acordes alineados arriba.
   - Cambiar tono con `+2` → los acordes cambian, la letra no se corre.
   - Alternar a notación latina → `Dm` pasa a `Rem` (o "Re menor" según se defina el sufijo en español — decidir y documentar en el código).
   - Tocar un acorde en modo diagrama → aparece el mástil.
   - Activar desfile automático → la pantalla se mueve sola; tocar para pausar.
   - Buscar por artista en `/canciones` → filtra.
   - Borrar una canción desde `/admin` → confirm() → desaparece.
3. `npm run lint` y `npm run build` sin errores. Commit, push, deploy.

### 5.4 Checklist de aceptación

- [ ] El `body` de una canción con acordes entre corchetes se ve como letra abajo + acordes arriba, alineados por carácter.
- [ ] Cambiar de tono no desalinea ni un carácter la letra.
- [ ] Notación inglés/latino solo cambia la raíz del acorde, no el sufijo (`m`, `7`, `sus4`...).
- [ ] Desfile automático arranca/pausa, y se pausa solo si el usuario scrollea a mano.
- [ ] Diagramas: acordes comunes muestran el mástil; uno no soportado muestra el aviso, no rompe la página.
- [ ] Formato de texto (A−/A+) persiste entre visitas (localStorage).
- [ ] `/admin` protegido, CRUD completo de canciones funcionando contra Neon.
- [ ] Responsive: se usa cómodamente con una mano en un celular apoyado en un atril.

---

## Notas importantes

1. **No hay archivos**: si más adelante se quiere adjuntar un PDF de la partitura o un audio de referencia, ahí sí conviene sumar Vercel Blob (mismo patrón que "Nacidas para este tiempo": subida directa desde el navegador con `@vercel/blob/client`).
2. **Transposición con bemoles**: se simplifica todo a sostenidos al transponer (ver 2.7). Si se necesita fidelidad total (mantener bemoles cuando corresponde armónicamente), es una mejora futura, no bloqueante.
3. **Búsqueda**: `ILIKE` alcanza para cientos de canciones. Si el cancionero crece mucho (miles), migrar a búsqueda full-text de Postgres (`tsvector` + índice GIN).
4. **Contraseña de admin**: igual que en cualquier proyecto de este tipo, no debe quedar en un `.md` commiteado al repo si el repo es público.
5. **Ideas para después**: transposición inteligente con capo (mostrar "tono real vs. posición con capo"), favoritos/listas para un repertorio de ensayo, exportar a PDF, modo "solo letra" (sin acordes) para el público que canta, importar temas en formato ChordPro estándar.
