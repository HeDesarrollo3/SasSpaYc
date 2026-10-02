// src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AuthService } from '../services/auth.service';

import { useAuthStore } from '../stores/auth.store';
import { BotonTema } from '../components/BotonTema';

/** Nombre del spa recordado de la última sesión (el login no puede consultarlo aún). */
function nombreNegocioGuardado(): string {
  try {
    return localStorage.getItem('negocio_nombre') || 'Tu spa';
  } catch {
    return 'Tu spa';
  }
}

/**
 * Lee el motivo de la última desconexión (`USER_INACTIVE`, …).
 *
 * Se hace en el **inicializador perezoso de `useState`**, no en un
 * `useEffect`: un efecto que llama a `setState` de forma síncrona provoca un
 * render en cascada (el lint `react(set-state-in-effect)` lo marca).
 *
 * ⚠️ **No se borra la clave aquí.** El inicializador puede ejecutarse dos veces
 * en `StrictMode`, así que si borrara en la primera pasada el mensaje se
 * perdería. Se limpia al enviar el formulario.
 */
function leerMotivoDeSesion(): string | null {
  const raw = localStorage.getItem('session_reason');
  if (!raw) return null;
  try {
    const { message } = JSON.parse(raw) as { message?: string };
    return message ?? null;
  } catch {
    return null;
  }
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(leerMotivoDeSesion);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    // Ya se mostró: se limpia para que no reaparezca al recargar.
    localStorage.removeItem('session_reason');

    if (!email || !password) {
      setErrorMsg('Por favor complete todos los campos');
      return;
    }

    setLoading(true);
    try {
      const user = await AuthService.login({ email, password });
      setUser(user);
      toast.success(`Bienvenido, ${user.nombre}`);
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from ?? '/dashboard', { replace: true });
    } catch (err: any) {
      const msg = err?.message ?? 'Credenciales inválidas o error de conexión';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg-base p-4">
      <BotonTema className="absolute right-4 top-4" />
      <div className="w-full max-w-md glass-card p-8">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {nombreNegocioGuardado()}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Inicia sesión con tu correo y contraseña
          </p>
        </header>

        {errorMsg && (
          <div
            className="mb-4 p-3 rounded-sm bg-danger/10 border border-danger text-danger text-xs flex items-center gap-2"
            role="alert"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-text-primary mb-1"
            >
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 text-text-muted" size={18} />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@spa.com"
                className="w-full bg-surface-card border border-border-subtle rounded-sm py-2 pl-10 pr-3 text-text-primary text-sm focus:border-border-strong transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-text-primary mb-1"
            >
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 text-text-muted" size={18} />
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-card border border-border-subtle rounded-sm py-2 pl-10 pr-3 text-text-primary text-sm focus:border-border-strong transition-colors"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2 flex justify-center items-center gap-2"
          >
            {loading ? <span className="skeleton h-4 w-20 inline-block" /> : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
};
