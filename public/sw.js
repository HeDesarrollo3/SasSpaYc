/**
 * public/sw.js — Service Worker de Mi Spa (portal del colaborador).
 * ─────────────────────────────────────────────────────────────────────────────
 * Escrito a mano. **Sin Workbox ni `vite-plugin-pwa`**: no se añade ninguna
 * dependencia. Es un archivo plano en `public/`, así que Vite lo copia tal cual
 * a `dist/sw.js` sin procesarlo (importante: el SW no puede pasar por el
 * bundler, porque tiene que servirse desde la raíz del sitio para controlar
 * `/app` y `/`).
 *
 * Además vive en un ámbito distinto al del bundle: aquí `self` es el global
 * (ServiceWorkerGlobalScope) y no existe `window`, `document` ni `localStorage`.
 * Por eso no hay nada de TypeScript ni de ESLint que valga: se escribe con la
 * API del navegador a pelo.
 *
 * Se registra **sólo en producción** (`import.meta.env.PROD` en `main.tsx`):
 * en desarrollo pelearía con el HMR de Vite y con sus URLs sin hash.
 *
 * ── Estrategias ─────────────────────────────────────────────────────────────
 *   · Navegación (`mode: 'navigate'`)  → network-first + fallback a la cáscara.
 *   · Estáticos (`/assets/**`, .js/.css/fuentes) → cache-first (Vite les pone
 *     hash en el nombre, así que son inmutables; el navegador puede tirar de
 *     caché sin miedo).
 *   · API (`/api/**`)                  → **NUNCA se cachea**. Ver abajo.
 *
 * ── Por qué la API no se toca ───────────────────────────────────────────────
 * Son datos financieros (saldo de comisiones, ventas, caja). Servir un saldo
 * de hace dos horas porque "había caché" es peor que no servir nada: el
 * colaborador cobraría sobre una cifra falsa. Ante un fallo de red se devuelve
 * un `503` con un JSON explícito para que la UI muestre el error en vez de un
 * dato viejo.
 *
 * ── PENDIENTE (fuera de alcance, documentado a propósito) ───────────────────
 * **Cola de escritura offline.** Un spa tiene wifi malo y el caso que de verdad
 * importa es *registrar un servicio sin conexión* y sincronizarlo después. Eso
 * NO está implementado: hoy, si no hay red, el registro falla y se ve el error.
 * Cómo se haría (trabajo aparte, bastante más grande):
 *
 *   1. En el cliente (no en el SW): envolver las mutaciones de registro
 *      (`POST /comandas`, `POST /comanda-items`) en un interceptor que, ante
 *      `TypeError` de red (axios) u `offline`, encole la petición en IndexedDB
 *      (store `outbox`: `{ id, url, method, body, createdAt, idempotencyKey }`)
 *      en vez de propagar el error.
 *   2. Añadir `idempotencyKey` (uuid v4) a cada petición encolada y una columna
 *      única en el backend para poder reintentar sin duplicar comandas. **Esto
 *      requiere tocar backend.**
 *   3. En este SW, un evento `sync` (`registration.sync.register('outbox')`)
 *      que abra IndexedDB y haga `fetch` secuencial de la cola; `BackgroundSync`
 *      sólo está en Chromium, así que hace falta además un reintento al volver
 *      `online` desde el cliente (escuchar `window.addEventListener('online')`)
 *      para iOS/Safari.
 *   4. `fetch` desde el SW hacia la API no puede añadir cabeceras de auth que
 *      viven en `localStorage`; hay que guardar el token en IndexedDB (o enviar
 *      la petición desde el cliente al recuperar conexión) y resolver la
 *      re-autenticación si el token caducó mientras estaba offline.
 *   5. UI de estado: contador de pendientes y aviso «N servicios sin subir»,
 *      con resolución de conflictos (servicio ya cancelado en servidor, etc.).
 *
 * Notificaciones push: tampoco entran (necesitan backend + claves VAPID), así
 * que aquí no hay `push` ni `notificationclick`.
 */

/**
 * Versión de la caché. **Súbela al cambiar cualquier asset precacheado** (el
 * `index.html` o los iconos): `activate` borra todas las cachés que no empiecen
 * por esta cadena, así que es el único interruptor que hay que tocar.
 * El nombre incluye el prefijo para poder limpiar por prefijo sin tocar otras
 * cachés del mismo origen.
 */
const VERSION = 'mi-spa-v1';
const CACHE_PREFIX = 'mi-spa-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

/** Cáscara: lo mínimo para arrancar la app sin red y sin HTML obsoleto. */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.svg',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

/* ═══════════════════════════════════════════════════════════════════════════
   INSTALL — precachea la cáscara
   ═══════════════════════════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Uno a uno y tolerante a fallos: si un icono no está, el SW no debe
      // quedarse sin instalar (y sin él no habría offline en absoluto).
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* sin red en la instalación: se precacheará en el próximo load */
          }
        }),
      );
      // Toma el control sin esperar a que se cierren las pestañas viejas.
      await self.skipWaiting();
    })(),
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   ACTIVATE — borra cachés viejas y toma el control de las pestañas abiertas
   ═══════════════════════════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/** ¿Es una petición a la API? (mismo origen o el backend en otro puerto). */
function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.includes('/api/');
}

/** ¿Es un asset inmutable generado por Vite, o una fuente? */
function isStaticAsset(url) {
  if (url.pathname.startsWith('/assets/')) return true;
  return /\.(?:js|mjs|css|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico)$/i.test(
    url.pathname,
  );
}

/** Respuesta 503 clara para la API cuando no hay red. */
function apiOfflineResponse() {
  return new Response(
    JSON.stringify({
      statusCode: 503,
      error: 'Service Unavailable',
      message:
        'Sin conexión: no se pudieron obtener datos actualizados. ' +
        'Los datos financieros no se sirven desde caché; vuelve a intentarlo cuando tengas red.',
      offline: true,
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FETCH — estrategia por tipo de petición
   ═══════════════════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Sólo GET. Un POST/PUT/PATCH/DELETE no se puede "reintentar desde caché" y
  // encolarlo es justo la cola de escritura que está pendiente (ver cabecera).
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Sólo http(s): chrome-extension://, data:, etc. no pasan por el SW.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // ── 1. API: nunca se cachea ──────────────────────────────────────────────
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(() => {
        if (request.mode === 'navigate') {
          return new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        return apiOfflineResponse();
      }),
    );
    return;
  }

  // ── 2. Navegación: network-first con fallback a la cáscara ───────────────
  //    Network-first (y no cache-first) para no quedarse pegado a un HTML
  //    viejo que apunte a assets con hash que ya no existen tras un deploy.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            // Se guarda también en la clave '/' para que el fallback offline
            // funcione aunque se navegue a una ruta profunda (/app/comisiones).
            await cache.put('/', response.clone());
            return response;
          }
          throw new Error(`Respuesta no OK: ${response && response.status}`);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const fallback =
            (await cache.match(request)) ||
            (await cache.match('/')) ||
            (await cache.match('/index.html'));
          if (fallback) return fallback;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
              '<body style="font-family:sans-serif;background:#0B1120;color:#F8FAFC;padding:24px">' +
              '<h1>Sin conexión</h1><p>No se pudo cargar la aplicación y no hay copia guardada.</p>',
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            },
          );
        }
      })(),
    );
    return;
  }

  // ── 3. Estáticos: cache-first (nombres con hash ⇒ inmutables) ────────────
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request, { ignoreSearch: false });
        if (cached) return cached;
        try {
          const response = await fetch(request);
          // Sólo se cachean respuestas completas y del mismo origen: una
          // respuesta `opaque` (cross-origin sin CORS) no se puede inspeccionar
          // y envenenaría la caché.
          if (response.ok && response.type === 'basic') {
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const fallback = await cache.match(request);
          if (fallback) return fallback;
          return new Response('', { status: 504, statusText: 'Gateway Timeout' });
        }
      })(),
    );
    return;
  }

  // Cualquier otra cosa (p. ej. `/vite.svg` sin extensión reconocida): a la red
  // sin tocarla. Mejor no cachear de más que servir algo raro.
});
