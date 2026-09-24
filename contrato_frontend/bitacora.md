# 📓 Bitácora de Desarrollo - Frontend SPA

Este documento registra los cambios, decisiones arquitectónicas, mejoras y problemas resueltos a lo largo del desarrollo del frontend.

## [Fecha: Inicialización]
*   **Acción**: Creación de la estructura del proyecto con Vite + React (TypeScript).
*   **Decisión**: Se opta por CSS puro (Vanilla/Modules) en lugar de TailwindCSS para tener un control granular sobre el efecto Glassmorphism y garantizar el aspecto premium y minimalista estipulado en las guías de diseño.
*   **Documentación**: Creación de `DISENO_GUIDELINES.md` y `checklist.md`.
*   **Mejora Planeada**: Implementar el Layout responsivo con un menú lateral (Sidebar) que se adapte a dispositivos móviles.

## [2026-09-17] Alineación estricta con DISENO_GUIDELINES + contrato SPED v2
*   **Tokens (`src/index.css`)**: reescritura a la paleta cerrada exacta (`--bg-base #0B1120`, `--bg-elevated #111827`, `--surface-card*`, `--border-*`, `--text-muted #64748B`, `--accent-from/to`, `--success #22C55E`, `--info #38BDF8`), escala 8pt (`--space-*`), radios (`--radius-sm/md/lg`), esculas tipográficas (`.text-display/h1/h2/body/body-sm/label`), motion (`180ms/250ms`, `ease-out`) y elevaciones `elevation-0..3`. Eliminados los tokens legacy (`--bg-primary`, `--accent-primary`, etc.) y los valores mágicos.
*   **Componentes**: `DashboardLayout` y `Dashboard` sin ningún `style=""` inline; botones a variantes `.btn-primary/.btn-secondary` (un solo gradiente por vista); tendencias con ícono + texto (nunca solo color); skeletons con shimmer en la carga; `focus-visible` global; `prefers-reduced-motion`; `Esc` cierra el menú móvil; `aria-label`s en controles; títulos dinámicos por ruta y `lang="es"` + meta description (SEO básico).
*   **Cliente API (`src/services/api.ts`)**: base versionada `/api/v1` (SPED §9); tipos `ApiSuccess/ApiErrorBody`; clase `ApiError` con código estable (decidir por `error`, SPED §5); `401` limpia la sesión; helper `postIdempotent()` con header `Idempotency-Key` (SPED §7).
*   **Documentación**: nuevo `contrato_frontend/API_CONTRATO.md` (mapa de endpoints, envelopes, paginación, idempotencia, tabla de códigos de error); `checklist.md` actualizado con el estado real por fase.
*   **Verificación**: `npm run lint` OK, `npm run build` OK.
*   **Pendiente**: Login; vistas de Ventas/Cajas/Colaboradores/Cuentas/Catálogos/Auditoría consumiendo `API_CONTRATO.md` (Fase 3 del checklist).

## [Fecha: Inicialización]
*   **Acción**: Creación de la estructura del proyecto con Vite + React (TypeScript).
*   **Decisión**: Se opta por CSS puro (Vanilla/Modules) en lugar de TailwindCSS para tener un control granular sobre el efecto Glassmorphism y garantizar el aspecto premium y minimalista estipulado en las guías de diseño.
*   **Documentación**: Creación de `DISENO_GUIDELINES.md` y `checklist.md`.
*   **Mejora Planeada**: Implementar el Layout responsivo con un menú lateral (Sidebar) que se adapte a dispositivos móviles.
