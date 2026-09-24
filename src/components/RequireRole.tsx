// src/components/RequireRole.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import type { Rol } from '../types/auth.types';

type Props = {
  roles: Rol[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export const RequireRole: React.FC<Props> = ({ roles, children, fallback }) => {
  const hasRole = useAuthStore((s) => s.hasRole);
  if (!hasRole(...roles)) {
    return <>{fallback ?? <Navigate to="/dashboard" replace />}</>;
  }
  return <>{children}</>;
};