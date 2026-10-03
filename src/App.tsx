// src/App.tsx
import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { MainLayout } from './components/MainLayout';
import { AppLayout } from './components/portal/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireRole } from './components/RequireRole';
import { useAuthStore } from './stores/auth.store';

/**
 * Rutas con **carga diferida**.
 *
 * Antes todas las páginas se importaban de forma estática, así que el bundle
 * inicial incluía el POS, el inventario, la auditoría y las liquidaciones aunque
 * el usuario sólo fuera a ver el login. El build avisaba de un chunk de ~945 KB.
 *
 * Con `lazy()` cada página se descarga **cuando se visita**, y el `<Suspense>`
 * de abajo muestra un esqueleto mientras llega (nunca una pantalla en blanco, que
 * es lo que prohíbe el design system §6).
 *
 * Nota: las páginas usan *named exports*, de ahí el `.then(m => ({ default: … }))`.
 */
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const POSPage = lazy(() => import('./pages/POSPage').then((m) => ({ default: m.POSPage })));
const ColaboradoresPage = lazy(() =>
  import('./pages/ColaboradoresPage').then((m) => ({ default: m.ColaboradoresPage })),
);
const CajasPage = lazy(() => import('./pages/CajasPage').then((m) => ({ default: m.CajasPage })));
const CuentasPage = lazy(() =>
  import('./pages/CuentasPage').then((m) => ({ default: m.CuentasPage })),
);
const CobrosPage = lazy(() =>
  import('./pages/CobrosPage').then((m) => ({ default: m.CobrosPage })),
);
const CuentasFinancierasPage = lazy(() =>
  import('./pages/CuentasFinancierasPage').then((m) => ({ default: m.CuentasFinancierasPage })),
);
const ClientesPage = lazy(() =>
  import('./pages/ClientesPage').then((m) => ({ default: m.ClientesPage })),
);
const ReportesPage = lazy(() =>
  import('./pages/ReportesPage').then((m) => ({ default: m.ReportesPage })),
);
const LiquidacionesPage = lazy(() =>
  import('./pages/LiquidacionesPage').then((m) => ({ default: m.LiquidacionesPage })),
);
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })),
);
const UsuariosPage = lazy(() =>
  import('./pages/UsuariosPage').then((m) => ({ default: m.UsuariosPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
// `AuditoriaPage` usa export por defecto.
const AuditoriaPage = lazy(() => import('./pages/AuditoriaPage'));

/**
 * Portal del colaborador (`/app`) — shell móvil propio.
 *
 * Va con su propio `AppLayout` (bottom-nav + topbar), **fuera** del `MainLayout`
 * de escritorio: el colaborador usa el celular, no una tabla densa. Mismo patrón
 * de `lazy()` + named exports que el resto.
 */
const InicioPage = lazy(() =>
  import('./pages/app/InicioPage').then((m) => ({ default: m.InicioPage })),
);
const NuevoServicioPage = lazy(() =>
  import('./pages/app/NuevoServicioPage').then((m) => ({ default: m.NuevoServicioPage })),
);
const MisServiciosPage = lazy(() =>
  import('./pages/app/MisServiciosPage').then((m) => ({ default: m.MisServiciosPage })),
);
const MisComisionesPage = lazy(() =>
  import('./pages/app/MisComisionesPage').then((m) => ({ default: m.MisComisionesPage })),
);
const MisMetasPage = lazy(() =>
  import('./pages/app/MisMetasPage').then((m) => ({ default: m.MisMetasPage })),
);
const PerfilPage = lazy(() =>
  import('./pages/app/PerfilPage').then((m) => ({ default: m.PerfilPage })),
);

/** Esqueleto de página completa mientras se descarga el chunk de una ruta. */
const CargandoPagina: React.FC = () => (
  <div className="space-y-6 page-container" aria-busy="true" aria-live="polite">
    <span className="sr-only">Cargando la página…</span>
    <div className="skeleton h-8 w-64" />
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-24" />
      ))}
    </div>
    <div className="skeleton h-64" />
  </div>
);

/** Rol cuyo destino no es el dashboard de escritorio. */
const ROL_COLABORADOR = 'colaborador';

/**
 * Redirección por rol.
 *
 * El colaborador **no** entra a `/` (escritorio): su casa es `/app`. El resto de
 * roles no tienen nada que hacer en `/app`, así que van al dashboard.
 * `ProtectedRoute` aplica la misma regla para las rutas anidadas; esto cubre los
 * comodines (`*`).
 */
const InicioPorRol: React.FC = () => {
  const rol = useAuthStore((s) => s.user?.rol);
  return <Navigate to={rol === ROL_COLABORADOR ? '/app' : '/dashboard'} replace />;
};

export const App: React.FC = () => {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/*
          Portal del colaborador — shell móvil propio.
          `ProtectedRoute` redirige a `/app` a quien tenga rol `colaborador` y
          `/dashboard` a quien no lo tenga, así que la guarda de rol ya está hecha.
        */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<InicioPage />} />
          <Route path="nuevo" element={<NuevoServicioPage />} />
          <Route path="servicios" element={<MisServiciosPage />} />
          <Route path="comisiones" element={<MisComisionesPage />} />
          {/*
            Metas personales. Existe porque la tarjeta hero de `/app` necesita una
            meta del día y no había ninguna pantalla para definirla: la tabla
            estaba vacía y no había forma de llenarla.
          */}
          <Route path="metas" element={<MisMetasPage />} />
          <Route path="perfil" element={<PerfilPage />} />
        </Route>

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="pos" element={<POSPage />} />

          {/* Solo administración */}
          <Route
            path="colaboradores"
            element={
              <RequireRole roles={['administrador']}>
                <ColaboradoresPage />
              </RequireRole>
            }
          />
          <Route
            path="liquidaciones"
            element={
              <RequireRole roles={['administrador']}>
                <LiquidacionesPage />
              </RequireRole>
            }
          />
          <Route
            path="clientes"
            element={
              <RequireRole roles={['administrador', 'recepcionista', 'cajero']}>
                <ClientesPage />
              </RequireRole>
            }
          />
          <Route
            path="reportes"
            element={
              <RequireRole roles={['administrador']}>
                <ReportesPage />
              </RequireRole>
            }
          />
          <Route
            path="finanzas"
            element={
              <RequireRole roles={['administrador']}>
                <CuentasFinancierasPage />
              </RequireRole>
            }
          />
          <Route
            path="inventory"
            element={
              <RequireRole roles={['administrador']}>
                <InventoryPage />
              </RequireRole>
            }
          />
          <Route
            path="settings"
            element={
              <RequireRole roles={['administrador']}>
                <SettingsPage />
              </RequireRole>
            }
          />
          <Route
            path="usuarios"
            element={
              <RequireRole roles={['administrador']}>
                <UsuariosPage />
              </RequireRole>
            }
          />
          <Route
            path="auditoria"
            element={
              <RequireRole roles={['administrador']}>
                <AuditoriaPage />
              </RequireRole>
            }
          />

          {/* Administración + cajero */}
          <Route
            path="caja"
            element={
              <RequireRole roles={['administrador', 'cajero']}>
                <CajasPage />
              </RequireRole>
            }
          />
          <Route
            path="cuentas"
            element={
              <RequireRole roles={['administrador', 'cajero']}>
                <CuentasPage />
              </RequireRole>
            }
          />

          {/* Cobro de servicios: administración, recepción y caja */}
          <Route
            path="cobros"
            element={
              <RequireRole roles={['administrador', 'recepcionista', 'cajero']}>
                <CobrosPage />
              </RequireRole>
            }
          />
        </Route>

        <Route path="*" element={<InicioPorRol />} />
      </Routes>
    </Suspense>
  );
};

export default App;
