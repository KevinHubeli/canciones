# Cancionero

Cancionero de acordes de la iglesia, pensado para usarse **desde el celular, en vivo**: letra con los
acordes alineados arriba, cambio de tono, notación inglés/latino (C ↔ Do), diagramas de acordes, desfile
automático y modo presentación. Las canciones se arman en **powers** (listas para un culto) con divisores
de sección (ALABANZA, ADORACIÓN, OFRENDA...) que se pueden presentar en pantalla o exportar a PowerPoint.

Los textos de la app van en español rioplatense (voseo). Es una PWA: las canciones ya vistas se pueden abrir
sin conexión.

> La especificación original con la que se armó la app está en [`CANCIONERO.md`](./CANCIONERO.md)
> (al principio tiene una nota con lo que cambió desde entonces).

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Neon (Postgres) · Drizzle ORM · Vercel.

> **Ojo:** esta versión de Next.js tiene cambios incompatibles con lo que se sabe de versiones anteriores
> (por ejemplo, el middleware es `src/proxy.ts`, y `params`, `searchParams` y `cookies()` son asíncronos).
> Antes de tocar algo de Next, leé la guía en `node_modules/next/dist/docs/` (ver también `AGENTS.md`).

## Qué se puede hacer

**Cualquier persona (sin login)** puede buscar canciones, abrirlas, usar el menú flotante (tono, notación,
tamaño de letra, diagramas, desfile) y ver los powers que le compartan.

**El equipo (con login)** carga, edita y borra canciones, arma powers y revisa el historial.
**El dueño** además administra usuarios y los respaldos.

### Rutas públicas

| Ruta | Qué es |
|---|---|
| `/` | Inicio: buscador rápido y últimas canciones. |
| `/canciones` | Lista completa con búsqueda (título, artista, sin tildes) y filtros por etiqueta (incluido "Sin acordes"). |
| `/canciones/[id]` | El visor de una canción. Con `?set=...` se navega dentro de un power. |
| `/powers/[id]` | Un power: canciones en orden, con sus divisores y tonos. Desde acá se presenta o se descarga. |
| `/powers/[id]/vista-previa` | Vista previa de las diapositivas antes de exportar. |
| `/api/setlists/[id]/export-pptx` | Descarga del power en PowerPoint. |

### Rutas de admin (con sesión; sin sesión redirigen a `/admin/login`)

| Ruta | Qué es | Quién |
|---|---|---|
| `/admin` | Lista de canciones, búsqueda y atajos a las demás pantallas. | Equipo |
| `/admin/nueva`, `/admin/[id]/editar` | Alta y edición (con importador de Cifra Club / LaCuerda y aviso de líneas "basura" al pegar). Cada edición guarda una versión anterior. | Equipo |
| `/admin/powers`, `/admin/powers/nuevo`, `/admin/powers/[id]/editar` | Armador de powers: canciones, tonos, divisores, copiar un power. | Equipo |
| `/admin/duplicados` | Canciones con el mismo título, con una recomendada para conservar. | Equipo |
| `/admin/auto-acordes` | Busca acordes para las canciones que tienen solo letra. | Equipo |
| `/admin/papelera` | Canciones borradas: restaurar o vaciar. | Equipo |
| `/admin/historial` | Quién creó, editó o borró qué. | Equipo |
| `/admin/estadisticas` | Resumen de uso y de la biblioteca. | Equipo |
| `/admin/cuenta` | Cambiar la propia contraseña. | Equipo |
| `/admin/usuarios` | Crear y borrar usuarios. | **Dueño** |
| `/admin/respaldo` | Descargar y restaurar un respaldo. | **Dueño** |

## Variables de entorno

Copiá `.env.example` a `.env.local` y completalo. En Vercel se cargan en *Settings → Environment Variables*.

| Variable | Para qué | Notas |
|---|---|---|
| `ADMIN_USER` | Nombre de usuario del **dueño**. | Obligatoria, no hay valor por defecto. |
| `ADMIN_PASSWORD` | Contraseña del **dueño**. | Obligatoria. Vive solo en el entorno (no en la base): para cambiarla se edita la variable y se vuelve a desplegar, y eso cierra todas las sesiones. |
| `SESSION_SECRET` | Secreto con el que se firman las cookies de sesión. | Obligatoria. **Al menos 32 caracteres en producción** (con uno más corto la app falla al firmar sesiones). Generalo con `openssl rand -base64 48`. Si lo cambiás se cierran todas las sesiones. |
| `DATABASE_URL` | Conexión a Neon **con pooling**; es la que usa la app. | Se carga sola al conectar Neon desde el Marketplace de Vercel. |
| `DATABASE_URL_UNPOOLED` | Conexión **directa** a Neon; la usa `drizzle-kit` para las migraciones. | Si falta, las migraciones usan `DATABASE_URL`. |

**Dueño y usuarios:** el *dueño* es el usuario definido por `ADMIN_USER` / `ADMIN_PASSWORD`. Es el único que
crea y borra usuarios y que maneja los respaldos. El resto del equipo son *usuarios* guardados en la base
(con la contraseña hasheada con scrypt) que pueden cargar canciones y armar powers, pero no administrar.

## Scripts

```bash
npm run dev          # servidor de desarrollo (http://localhost:3000)
npm run build        # compila para producción
npm start            # sirve lo compilado
npm run lint         # eslint
npm test             # tests unitarios (tsx); no tocan la base
npm run db:generate  # genera una migración a partir de cambios en src/db/schema.ts
npm run db:migrate   # aplica las migraciones pendientes a la base de .env.local
npm run db:studio    # explorador visual de la base
npm run test:e2e     # tests de punta a punta (ver la advertencia de abajo)
```

Para chequear todo antes de subir: `npx tsc --noEmit && npx eslint && npm test`. Es lo mismo que corre CI en
cada push y pull request.

### Tests e2e (¡escriben datos!)

`npm run test:e2e` levanta un runner (`e2e/run.mjs`) que prueba la app corriendo de verdad, por HTTP y con
Playwright. **Crean y borran canciones, powers y usuarios en la base a la que apunta el servidor.** Por eso:

- se niegan a correr sin `E2E_ALLOW_WRITES=1`,
- solo corren contra `localhost` (salvo `E2E_ALLOW_REMOTE=1`),
- hay que apuntarlos a una **rama de Neon o una base de prueba, nunca a producción**.

```bash
# 1) servidor de prueba (con la base de la rama de Neon en .env.local)
npm run build
ADMIN_USER=tester ADMIN_PASSWORD=tmp-pass-123 SESSION_SECRET=un-secreto-de-prueba-de-32-caracteres-o-mas npx next start -p 3100

# 2) en otra terminal
E2E_ALLOW_WRITES=1 npm run test:e2e
```

En PowerShell: `$env:E2E_ALLOW_WRITES = "1"; npm run test:e2e`. El detalle (variables, contratos de la API que
se verifican, cómo correr un archivo suelto) está en [`e2e/README.md`](./e2e/README.md).

## Base de datos y migraciones

El esquema está en `src/db/schema.ts` y las migraciones en `drizzle/` (se commitean). Las canciones, los
powers, los usuarios, el historial de versiones, el log de auditoría y los intentos de login viven en Neon.

**Aplicar migraciones (Vercel + Neon).** Vercel no las corre solo al desplegar: hay que aplicarlas a la base
de producción a mano, **antes** de desplegar el código que las necesita (las migraciones suelen solo agregar
cosas, así que el código viejo sigue andando mientras tanto):

1. Traé las variables del proyecto: `vercel env pull .env.local` (o copiá `DATABASE_URL` y
   `DATABASE_URL_UNPOOLED` de *Neon → Connection details*).
2. `npm run db:migrate` (`drizzle.config.ts` lee `.env.local`; usa `DATABASE_URL_UNPOOLED`).
3. Desplegá.

**Cambiar el esquema:** editá `src/db/schema.ts`, corré `npm run db:generate`, revisá el `.sql` generado y
commitealo junto con el cambio. Para probar una migración sin riesgo, aplicala primero a una **rama de Neon**
(*Neon → Branches → Create branch*) apuntando `DATABASE_URL_UNPOOLED` a esa rama.

Neon también permite volver atrás en el tiempo (*Restore*) si algo sale mal, además del respaldo de abajo.

## Respaldo y restauración

Solo el dueño, en **`/admin/respaldo`**:

- **Descargar respaldo:** baja un `.json` con las canciones (incluidas las de la papelera), los powers y el
  historial de versiones. **No** incluye contraseñas ni usuarios. Conviene bajar uno de vez en cuando y
  guardarlo fuera de la app (la pantalla avisa si pasó mucho tiempo).
- **Restaurar desde un archivo:** *fusiona* el respaldo con lo que hay: agrega lo que falta y pisa por `id`
  lo que coincide; **nunca borra** lo que ya está en la base. Para recuperar una canción borrada por error,
  primero fijate en la papelera.

También se puede bajar por API: `GET /api/admin/backup` (con la cookie del dueño).

## Arquitectura

```
src/
├── proxy.ts            # Protege /admin/*: sin sesión válida redirige a /admin/login
├── db/                 # schema.ts (Drizzle) y getDb() (se conecta recién al usarse)
├── lib/                # La lógica, sin UI (ver abajo)
├── components/         # Componentes de React (visor, formularios, armador de powers...)
└── app/
    ├── page.tsx, canciones/, powers/   # Páginas públicas
    ├── admin/                          # Panel (protegido por proxy.ts y por cada página)
    └── api/                            # Route Handlers: songs, setlists, auth, admin
drizzle/                # Migraciones SQL
e2e/                    # Tests de punta a punta (ver e2e/README.md)
public/                 # Íconos, manifest y service worker (uso sin conexión)
```

Piezas clave de `src/lib/`:

| Archivo | Qué hace |
|---|---|
| `chords.ts` | Parsea líneas con `[Acorde]`, transpone, convierte inglés/latino y pasa acordes en texto plano a corchetes. |
| `songs.ts`, `setlists.ts` | Consultas a la base (búsqueda con `pg_trgm` y `unaccent`, papelera, powers). |
| `versions.ts` | Historial de versiones de cada canción (guarda el estado anterior de cada cambio). |
| `dividers.ts` | Divisores de sección de un power: validación y posiciones. |
| `pptx-slides.ts`, `pptx-layout.ts` | Arman las diapositivas (vista previa y exportación a PowerPoint). |
| `session.ts` | Cookie de sesión firmada con HMAC; distingue dueño de usuarios. |
| `rateLimit.ts` | Límite de intentos de login, guardado en la base. |
| `users.ts` | Usuarios, hash de contraseñas con scrypt y reglas de contraseña. |
| `audit.ts` | Registro de quién hizo qué (alimenta `/admin/historial`). |
| `backup.ts` | Exportar y restaurar respaldos. |
| `importers/` | Importadores de Cifra Club y LaCuerda (solo esos dominios, con hostname estricto). |
| `junk.ts` | Detecta líneas de menú/botones que se cuelan al pegar desde una página web. |

Las canciones se guardan como texto plano con el acorde entre corchetes justo antes de la sílaba
(`[Dm]Cantaré a Jehová por [Gm]siempre`); el parseo, la transposición y el dibujo se hacen en el navegador.

## Seguridad

- **Sesión:** cookie `httpOnly`, `SameSite=Lax` y `Secure` en producción, con un token firmado con HMAC-SHA256
  (Web Crypto) y vencimiento de 30 días. El token queda atado a la contraseña de quien entró: al cambiarla
  (o al cambiar `ADMIN_PASSWORD`), las sesiones anteriores dejan de servir; un usuario borrado pierde el
  acceso aunque su cookie siga vigente. `SESSION_SECRET` tiene que tener al menos 32 caracteres en producción.
- **Contraseñas:** las de los usuarios se guardan hasheadas con scrypt (sal propia por contraseña) y se comparan
  en tiempo constante. Se piden al menos 8 caracteres y se rechazan las obvias (`12345678`, `password`, el
  propio nombre de usuario...). El login siempre hace el cálculo del hash, exista o no el usuario, para no
  revelar qué usuarios hay. La del dueño vive solo en las variables de entorno.
- **Rate limit del login:** 5 intentos fallidos seguidos desde una misma IP, o 8 contra un mismo usuario, en
  10 minutos => `429` con `Retry-After`. Los contadores están en la tabla `login_attempts` (no en memoria)
  porque en serverless cada instancia tiene la suya; si la base falla, cae a un contador en memoria. Cambiar
  la contraseña también exige la actual y cuenta los fallos. La IP sale de los encabezados que pone Vercel; fuera
  de Vercel se usa el último valor de `X-Forwarded-For` (el que agrega el proxy más cercano).
- **Permisos:** todo lo que escribe (`POST/PATCH/DELETE` de canciones y powers) exige sesión; lo de usuarios y
  respaldos, además, ser el dueño (`403` para los demás). Lo público es solo lectura.
- **Importadores:** solo aceptan URLs de `lacuerda.net` y `cifraclub.com` (se compara el *hostname* exacto, no
  una subcadena) para que nadie use la app para pedir otras direcciones desde el servidor.
- **Datos:** sin archivos subidos. Borrar una canción la manda a la papelera (se puede restaurar) y cada
  edición guarda la versión anterior. Los respaldos no incluyen contraseñas.
- **Uso sin conexión:** el service worker nunca guarda `/admin`, `/api/auth`, `/api/admin` ni descargas
  (`public/sw-rules.js`), así que al cerrar sesión no queda nada de eso en el celular.

Si encontrás un problema de seguridad, avisale al dueño del proyecto directamente en vez de abrir un issue público.

## Despliegue

Se despliega en Vercel conectando el repositorio. Conectá Neon desde el Marketplace de Vercel (carga
`DATABASE_URL` y `DATABASE_URL_UNPOOLED`), agregá `ADMIN_USER`, `ADMIN_PASSWORD` y `SESSION_SECRET`, aplicá las
migraciones (ver arriba) y desplegá. CI (`.github/workflows/ci.yml`) corre `tsc`, `eslint` y `npm test` en
cada push y pull request; los e2e son un job manual y opcional que usa los secretos de una rama de Neon de
prueba (`DATABASE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`, `SESSION_SECRET`).
