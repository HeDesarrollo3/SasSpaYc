// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';
import { supabase } from './services/supabase';
import { setUnauthorizedHandler } from './services/api';
import { useAuthStore } from './stores/auth.store';
import { AuthService } from './services/auth.service';

// -----------------------------------------------------------------------------
// Service Worker (PWA) — sólo en producción
// -----------------------------------------------------------------------------
/**
 * Registra `public/sw.js` (precaché de la cáscara + estrategias por tipo de
 * petición: ver la cabecera del propio SW para el detalle y para el pendiente
 * de la cola de escritura offline).
 *
 * **Sólo en producción.** En desarrollo el SW cachearía el `index.html` y los
 * módulos que sirve Vite, y el HMR dejaría de verse: cambios que no aparecen o
 * HTML viejo servido desde caché. `import.meta.env.PROD` es un literal que Vite
 * sustituye en build, así que en dev este bloque se elimina del bundle.
 *
 * El registro es best-effort: si el navegador no soporta SW (`serviceWorker`
 * ausente: Safari antiguo, algunos WebView, o contexto no seguro) o el registro
 * falla, la app debe seguir funcionando igual — sólo se pierde el offline.
 */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // Un SW que no registra no puede tumbar la app: se avisa y se sigue.
      console.warn('[PWA] No se pudo registrar el service worker:', error);
    });
  });
}

registerServiceWorker();

// -----------------------------------------------------------------------------
// QueryClient global (TanStack Query)
// -----------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s: evita refetch agresivo en navegación
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// -----------------------------------------------------------------------------
// Puente entre el axios (services/api.ts) y el auth store
// Cuando el backend devuelve 401, limpiamos sesión y redirigimos.
// -----------------------------------------------------------------------------
setUnauthorizedHandler(async (reason, message) => {
  await AuthService.logout();
  useAuthStore.getState().clear();
  localStorage.setItem(
    'session_reason',
    JSON.stringify({ reason, message, at: Date.now() }),
  );
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
});

// -----------------------------------------------------------------------------
// Supabase: mantiene el access_token fresco y reacciona a logout remoto
// -----------------------------------------------------------------------------
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'TOKEN_REFRESHED' && session) {
    localStorage.setItem('access_token', session.access_token);
  } else if (event === 'SIGNED_OUT') {
    localStorage.removeItem('access_token');
    useAuthStore.getState().clear();
  }
});

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);