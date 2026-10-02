// src/services/auth.service.ts
import { supabase } from './supabase';
import { api, type ApiResponse } from './api';
import type { AuthUser } from '../types/auth.types';

export type LoginPayload = { email: string; password: string };

export const AuthService = {
  /**
   * 1. Autentica contra Supabase Auth.
   * 2. Guarda el JWT.
   * 3. Pide `GET /auth/me` para obtener el perfil de negocio (rol real).
   */
  login: async ({ email, password }: LoginPayload): Promise<AuthUser> => {

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      throw { error: 'INVALID_CREDENTIALS', message: error?.message ?? 'Login fallido' };
    }

    localStorage.setItem('access_token', data.session.access_token);

    const me = await api.get<unknown, ApiResponse<AuthUser>>('/auth/me');
    if (!('success' in me) || !me.success) {
      // Si /auth/me falla (ej. USER_NOT_REGISTERED), limpiamos y propagamos
      localStorage.removeItem('access_token');
      await supabase.auth.signOut();
      throw me;
    }
    return me.data;
  },

  logout: async (): Promise<void> => {
    await supabase.auth.signOut();
    localStorage.removeItem('access_token');
  },

  /** Refresca el JWT a partir de la sesión de Supabase (lo llama el listener global). */
  refreshAccessToken: async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (token) localStorage.setItem('access_token', token);
    return token;
  },

  /** Vuelve a pedir el perfil de negocio (útil al arrancar la app o tras un refresh). */
  fetchMe: async (): Promise<AuthUser> => {
    const me = await api.get<unknown, ApiResponse<AuthUser>>('/auth/me');
    if (!('success' in me) || !me.success) throw me;
    return me.data;
  },
};