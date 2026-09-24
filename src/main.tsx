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