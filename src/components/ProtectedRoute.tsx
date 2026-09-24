// src/components/ProtectedRoute.tsx
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { AuthService } from '../services/auth.service';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  // Si hay token pero no user en el store (por ej. reload), reconstruimos el perfil.
  const token = localStorage.getItem('access_token');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: AuthService.fetchMe,
    enabled: !!token && !user,
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="glass-card flex flex-col items-center gap-3 p-6">
          <div className="skeleton h-6 w-32" />
          <p className="text-xs text-text-muted">Validando sesión…</p>
        </div>
      </div>
    );
  }

  if (!user && isError) {
    // El interceptor ya redirige en 401; esto cubre el caso de otros errores.
    return <Navigate to="/login" replace />;
  }

  if (!user) return null;

  return <>{children}</>;
};