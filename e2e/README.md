# Pruebas de punta a punta (e2e)

Prueban la app corriendo de verdad: por HTTP (`http-test*.mjs`) y con un navegador (`ui*-test.mjs`,
`intro-test.mjs`, con Playwright).

> **Estos tests ESCRIBEN y BORRAN datos** en la base a la que apunta el servidor que levantes.
> Apuntalos a una **rama de Neon** o a una base de prueba. **Nunca a producción.**

## Cómo funcionan

- **Son autosuficientes.** Cada test crea lo que necesita (canciones, powers, usuarios) con el prefijo
  `ZZ_e2e_` (usuarios: `zz_e2e_`) y lo borra al final, **aunque falle** (`try/finally`). Toleran una base vacía.
- **Guardas de seguridad** (en `e2e/lib.mjs`, valen para el runner y para cada archivo por separado):
  1. Sin `E2E_ALLOW_WRITES=1` no corren: muestran un mensaje y salen con código 2.
  2. `E2E_URL` tiene que ser `localhost` / `127.0.0.1`, salvo que pases `E2E_ALLOW_REMOTE=1`.
- Cada cliente HTTP manda un `X-Forwarded-For` inventado: el límite de intentos de login es por IP y así los
  fallos de un test no bloquean a los otros.
- **La papelera:** borrar una canción la manda a la papelera. Al terminar, los tests vacían la papelera
  **solo si adentro hay únicamente canciones de prueba** (`ZZ_e2e_`). Si hay canciones reales, no se toca nada
  y las de prueba quedan en la papelera (se ven por el prefijo).
- El historial (`/admin/historial`) y el log de auditoría **no se limpian**: las acciones de prueba quedan anotadas.

## Cómo correrlos

1. Apuntar el servidor a una base de prueba. Con una rama de Neon: poné su `DATABASE_URL` (y
   `DATABASE_URL_UNPOOLED`) en `.env.local`, o exportalas en la terminal antes de levantar el servidor.
   Aplicá las migraciones a esa rama (`npm run db:migrate`).
2. Levantar la app con un dueño de prueba:

   ```bash
   npm run build
   ADMIN_USER=tester ADMIN_PASSWORD=tmp-pass-123 SESSION_SECRET=un-secreto-de-prueba-de-32-caracteres-o-mas npx next start -p 3100
   ```

   (`next dev -p 3100` también sirve.)
3. En otra terminal:

   ```bash
   E2E_ALLOW_WRITES=1 node e2e/run.mjs            # todo
   E2E_ALLOW_WRITES=1 node e2e/run.mjs --http     # solo HTTP (no necesita Playwright)
   E2E_ALLOW_WRITES=1 node e2e/run.mjs --ui       # solo navegador
   E2E_ALLOW_WRITES=1 node e2e/run.mjs http-test4 # solo los que coincidan con el texto
   node e2e/run.mjs --list                        # ver el orden (no escribe nada)
   ```

   Para los de navegador hace falta una vez: `npx playwright install chromium`.

También se puede correr un archivo suelto: `E2E_ALLOW_WRITES=1 node e2e/http-test4.mjs`.

### Variables

| Variable | Para qué | Default |
|---|---|---|
| `E2E_ALLOW_WRITES` | Obligatoria, tiene que ser `1`. Confirma que sabés que se escribe en la base. | — |
| `E2E_ALLOW_REMOTE` | `1` para permitir un `E2E_URL` que no sea localhost. | — |
| `E2E_URL` | Dónde está la app. | `http://localhost:3100` |
| `E2E_USER` / `E2E_PASS` | El dueño: tienen que coincidir con `ADMIN_USER` / `ADMIN_PASSWORD` **del servidor**. | `tester` / `tmp-pass-123` |
| `E2E_SKIP_UI` | `1` para saltear los de navegador. | — |
| `E2E_TIMEOUT_MS` | Tiempo máximo por archivo. | `300000` |

## Archivos

| Archivo | Qué cubre |
|---|---|
| `run.mjs` | Runner: guardas, orden, resumen y lista de lo que falló. |
| `lib.mjs` | Cliente HTTP, guardas, creación y limpieza de datos de prueba, helpers de Playwright. |
| `sweep.mjs` | Barrido: borra restos `ZZ_e2e_` de una corrida cortada a la mitad. El runner lo corre al principio y al final. |
| `http-test.mjs` | Permisos sin sesión, login, búsqueda, canciones, importador (hostnames), powers y pptx. |
| `http-test2.mjs` | Usuarios (dueño vs. usuario común), claves débiles, duplicadas, último tono, vista previa. |
| `http-test3.mjs` | Historial con dos usuarios, copiar un power, divisores al presentar. |
| `http-test4.mjs` | **Papelera**, **historial de versiones**, filtro **Sin acordes**, `limit`/`offset` decimales. |
| `http-test5.mjs` | **Cambio de contraseña** y **respaldo** (solo dueño). |
| `http-test6.mjs` | **Límite de intentos de login** (429). Corre casi al final a propósito (ver abajo). |
| `ui-test.mjs` | Login por UI, lista del admin, armador con divisores, vista pública, visor. |
| `ui2-test.mjs` | Tema, búsqueda, tamaño de letra, "Recientes", hidratación sin errores. |
| `ui3-test.mjs` | Duplicadas, usuarios, aviso de título repetido, último tono, vista previa. |
| `ui4-test.mjs` | Aviso de basura al pegar, copiar power, divisores al presentar, historial. |
| `intro-test.mjs` | La intro en texto plano cambia de tono. |

Los de navegador guardan capturas en `e2e/out/` (ignorada por git).

## Contratos de la API que se verifican

Si alguno cambia, el test correspondiente falla y el runner lo lista en "Qué falló". Hay que actualizar la
app **o** el test, y este cuadro.

| Flujo | Contrato | Test |
|---|---|---|
| Papelera: borrar | `DELETE /api/songs/:id` => 200; después `GET /api/songs/:id` => 404 y no sale en `GET /api/songs` | http-test4 |
| Papelera: listar | `GET /api/songs/trash` => `{ songs: [{ id, title, ... }] }`; 401 sin sesión | http-test4 |
| Papelera: restaurar | `POST /api/songs/:id/restore` => 200 `{ song }`; 404 si no está en la papelera / id inválido; 401 sin sesión | http-test4 |
| Papelera: vaciar | `DELETE /api/songs/trash` => 200 `{ purged: n }`; 401 sin sesión. Solo se prueba si la papelera tiene únicamente canciones de prueba | http-test4 |
| Historial: listar | `GET /api/songs/:id/versions` => `{ versions: [{ id, savedAt, savedBy, reason, title, artist, originalKey, body }] }`, la más nueva primero; la versión guarda el contenido de **antes** del cambio; 401/403 sin sesión | http-test4 |
| Historial: volver | `POST /api/songs/:id/versions/:versionId/revert` => 200 `{ song }` con el texto de esa versión; antes guarda el estado actual (la lista crece); una versión de otra canción => 404; 401 sin sesión | http-test4 |
| Sin acordes | `GET /api/songs?tag=Sin%20acordes` devuelve solo canciones sin `[acorde]`; se puede combinar con `q` y con otros `tag` | http-test4 |
| Paginación | `limit` y `offset` raros (`2.5`, `-3`, `NaN`, `1e3`, vacíos, enormes) nunca dan 500 | http-test4 |
| Cambio de clave | `POST /api/auth/password { current, next }`: 401 sin sesión; 400 si faltan campos, `current` incorrecta, `next` corta/débil o igual a la actual; 200 y cookie nueva si sale bien; las sesiones viejas pasan a 401; la clave vieja deja de entrar | http-test5 |
| Cambio de clave (dueño) | El dueño recibe 400: su clave está en `ADMIN_PASSWORD` y no se cambia desde la app | http-test5 |
| Respaldo | `GET /api/admin/backup` => 200 JSON con `Content-Disposition: attachment`, **solo dueño** (anónimo: 401/403, usuario común: 403); no incluye hashes (`scrypt:`) ni la clave del dueño. Pantalla `/admin/respaldo` | http-test5 |
| Rate limit de login | 5 fallos seguidos desde una misma IP => el siguiente intento da 429 (aunque la clave sea correcta) con `{ error }` y sin cookie; un login correcto reinicia la cuenta; 8 fallos contra un mismo usuario desde IPs distintas lo bloquean también | http-test6 |
| Usuarios | Nombre `[a-z0-9._-]{3,30}` (se guarda en minúsculas), clave >= 8 y no obvia (`password123`, `12345678`...); solo el dueño lista/crea/borra (los demás 403); un usuario borrado pierde la sesión | http-test2 |
| Historial de cambios | `/admin/historial` muestra `usuario creó/editó/copió/eliminó la canción/el power "título"` | http-test3 |

Supuestos que conviene saber:

- `http-test6.mjs` manda los fallos con un `X-Forwarded-For` falso. La app usa el último valor de ese
  encabezado fuera de Vercel, así que solo se bloquea esa IP inventada. Si algún día el servidor ignorara el
  encabezado, el test bloquearía tu IP real unos 10 minutos: por eso corre casi al final.
- Los textos de la UI (placeholders, `aria-label`, frases como "tocá para empezar") están escritos en los tests
  tal cual están hoy: si cambiás un texto, actualizá el test que lo busca.
- En GitHub Actions los e2e son un job manual y opcional (`workflow_dispatch` en `.github/workflows/ci.yml`) que usa los secretos de una rama de Neon; en cada push solo corren tsc, eslint y los tests unitarios.
