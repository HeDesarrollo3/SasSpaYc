import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    /**
     * **Escuchar en toda la red local, no sólo en `localhost`.**
     *
     * Sin esto Vite se ata a `::1` (loopback) y **el móvil no puede alcanzarlo**:
     * para el teléfono, `localhost` es él mismo. Con `host: true` el servidor
     * escucha en todas las interfaces y se accede por la IP del PC
     * (`http://192.168.x.x:5173`).
     */
    host: true,

    /**
     * **Proxy de la API.**
     *
     * Cuando el móvil abre `http://192.168.x.x:5173`, el navegador pide la API al
     * **mismo origen** y Vite la reenvía a `http://localhost:3000` desde el PC.
     *
     * Esto resuelve dos problemas de golpe, y por eso se prefiere a exponer el
     * backend en la red:
     *   1. **No hay CORS.** El backend sólo permite `http://localhost:5173`; el
     *      origen del móvil (`http://192.168.40.125:5173`) sería rechazado. Al ir
     *      por el mismo origen que sirve la página, no hay petición cruzada.
     *   2. **Un solo puerto expuesto** (5173). El 3000 no necesita salir a la red
     *      ni abrirse en el firewall.
     *
     * Por eso `VITE_API_URL` es **relativa** (`/api/v1`): así funciona igual desde
     * el PC, desde el móvil y desde cualquier IP que te dé el router.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },

    watch: {
      /**
       * **Sondeo en vez de eventos nativos del sistema.**
       *
       * En Windows, el watcher nativo revienta con
       * `EBUSY: resource busy or locked` cuando intenta vigilar un archivo
       * **justo mientras se está escribiendo**, y ese error **mata el servidor
       * de desarrollo entero** — no sólo la recarga.
       *
       * Ha pasado tres veces. La primera fue por un `.tmpdir` en `scripts/`; las
       * siguientes, escribiendo archivos de `src/` en ráfaga (varios agentes
       * editando a la vez: el log mostraba HMR cada 2-3 segundos sobre el mismo
       * archivo). El `ignored` de abajo tapa el primer caso; **el sondeo tapa el
       * segundo**, que no se puede evitar ignorando rutas porque son justo los
       * archivos que hay que vigilar.
       *
       * Cuesta algo más de CPU que los eventos nativos, pero en desarrollo es un
       * precio bajo comparado con perder el servidor cada vez que se guardan
       * varios archivos seguidos.
       */
      usePolling: true,
      interval: 300,

      /**
       * **Carpetas que el watcher NO debe vigilar.**
       *
       * Refuerzo para el caso de un directorio temporal bloqueado dentro del
       * árbol vigilado. `scripts/` no forma parte de la app (no lo importa nada
       * de `src/`), así que vigilarlo no aporta nada y sí puede romperlo todo.
       */
      ignored: ['**/scripts/**', '**/*.tmpdir*/**', '**/.*.tmpdir*/**', '**/*.tmp'],
    },
  },

  build: {
    // Sube el umbral del aviso por encima del chunk de vendor más grande.
    // No oculta el problema: el reparto real está en `codeSplitting` de abajo.
    chunkSizeWarningLimit: 550,

    rolldownOptions: {
      output: {
        /**
         * **Reparto de chunks.**
         *
         * Sin esto, todo el código compartido (React, TanStack Query,
         * react-hook-form, zod, axios, sonner, lucide) caía en un único chunk de
         * ~610 KB que se descargaba **antes** de pintar el login.
         *
         * Separándolo por familias:
         *   · el chunk inicial baja y el primer pintado es más rápido;
         *   · cuando cambias código de la app, el hash de `vendor-react` **no
         *     cambia**, así que el navegador lo reutiliza de caché entre
         *     despliegues en vez de volver a descargarlo.
         *
         * ⚠️ La opción se llamaba `advancedChunks` y Vite 8 la marca como
         * obsoleta (`WARN advancedChunks option is deprecated, please use
         * codeSplitting instead`). Se usa el nombre nuevo. La forma de `groups`
         * es la misma.
         *
         * El orden importa: gana el primer grupo que coincide.
         */
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
            },
            {
              name: 'vendor-form',
              test: /node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/,
            },
            {
              name: 'vendor-data',
              test: /node_modules[\\/](@tanstack|axios|@supabase)[\\/]/,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/](lucide-react|sonner|zustand)[\\/]/,
            },
            {
              // Red de seguridad: cualquier otra dependencia, en su propio chunk.
              name: 'vendor',
              test: /node_modules[\\/]/,
            },
          ],
        },
      },
    },
  },
});
