// src/pages/app/PerfilPage.tsx
//
// `/app/perfil` — datos del usuario, estado del vínculo con su ficha de
// colaborador y cierre de sesión (spec §3.18).
//
// ⚠️ **No hay PIN de acceso rápido.** La spec §3.18 lo pide para "entrar rápido sin
// escribir la contraseña", pero el backend no expone ningún endpoint para
// guardarlo ni validarlo (`auth.service.ts` sólo tiene login/logout/me, y el PIN no
// existe en el esquema). Inventar un PIN en el cliente sería un falso candado:
// cualquiera con el dispositivo abriría la app. Se deja fuera y se anota.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleAlert,
  Info,
  LogOut,
  LoaderCircle,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { AuthService } from '../../services/auth.service';
import { useAuthStore } from '../../stores/auth.store';
import { PageHeader } from '../../components/PageHeader';
import { ROL, claseBadge, metaEstado } from '../../lib/estados';
import { iniciales } from '../../lib/format';

export function PerfilPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const [saliendo, setSaliendo] = useState(false);

  const rol = metaEstado(ROL, user?.rol);
  const vinculado = Boolean(user?.colaborador_id);

  const cerrarSesion = async () => {
    setSaliendo(true);
    try {
      await AuthService.logout();
    } catch {
      // Si Supabase falla (sin red), la sesión local se limpia igual: es lo que el
      // usuario ha pedido. No se le muestra un error por esto.
    }
    clear();
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader titulo="Mi perfil" descripcion="Tus datos de acceso y el estado de tu cuenta." />

      {/* Identidad */}
      <section className="panel p-4">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-strong bg-gradient-to-br from-accent-from to-accent-to text-lg font-bold text-on-accent"
          >
            {iniciales(user?.nombre)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-h2 text-text-primary">{user?.nombre ?? 'Usuario'}</p>
            <span className={`${claseBadge(rol.tono)} mt-1`}>
              <ShieldCheck size={12} aria-hidden="true" />
              {rol.label}
            </span>
          </div>
        </div>

        <dl className="mt-4 space-y-3 border-t border-border-subtle pt-4">
          <div className="flex items-start justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-body-sm text-text-secondary">
              <UserRound size={13} aria-hidden="true" />
              Nombre
            </dt>
            <dd className="text-right text-body text-text-primary">{user?.nombre ?? '—'}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-body-sm text-text-secondary">
              <Mail size={13} aria-hidden="true" />
              Correo
            </dt>
            <dd className="truncate text-right text-body text-text-primary">
              {user?.email ?? '—'}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-body-sm text-text-muted">
          Tus datos los mantiene administración. Si algo no cuadra, avísales: desde el portal no se
          pueden editar.
        </p>
      </section>

      {/* Vínculo con la ficha de colaborador */}
      <section className="panel p-4">
        <h2 className="text-h2 text-text-primary">Ficha de colaborador</h2>

        {vinculado ? (
          <p className="mt-2 flex items-center gap-2 text-body-sm text-success">
            <CheckCircle2 size={14} aria-hidden="true" />
            Vinculada (colaborador #{user?.colaborador_id}). Tus servicios quedan registrados a tu
            nombre.
          </p>
        ) : (
          <>
            <p className="mt-2 flex items-center gap-2 text-body-sm text-warning">
              <CircleAlert size={14} aria-hidden="true" />
              Tu usuario todavía no está vinculado a una ficha de colaborador.
            </p>
            <div className="banner banner-info mt-3" role="status">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Este vínculo (<code>usuarios.colaborador_id</code>) llega con la migración{' '}
                <code>001</code>, que aún no está aplicada en la base. Hasta entonces no se pueden
                registrar servicios: el envío fallará y verás un aviso. Es lo único que falta de tu
                lado; avisa a administración.
              </span>
            </div>
          </>
        )}
      </section>

      {/* Cerrar sesión */}
      <section className="panel p-4">
        <h2 className="text-h2 text-text-primary">Sesión</h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          Cierra la sesión si vas a dejar el teléfono en el salón. Tendrás que volver a entrar con
          tu correo y contraseña.
        </p>
        <button
          type="button"
          className="btn-danger mt-3 min-h-12 w-full"
          onClick={cerrarSesion}
          disabled={saliendo}
        >
          {saliendo ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <LogOut size={16} aria-hidden="true" />
          )}
          {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </section>

      <p className="pb-2 text-center text-body-sm text-text-muted">
        Portal del colaborador · si algo no funciona, avisa a administración antes de reintentar
        varias veces.
      </p>
    </div>
  );
}
