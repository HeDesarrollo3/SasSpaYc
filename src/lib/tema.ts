// src/lib/tema.ts
//
// Tema claro / oscuro. Es una preferencia de cada dispositivo (no del negocio):
// se guarda en localStorage y se aplica poniendo `data-theme` en <html>, que es
// lo que lee `index.css` para cambiar los tokens de color.
//
// `index.html` aplica el tema guardado ANTES de que cargue React, para que la
// pantalla no parpadee en claro al abrir la app en modo oscuro.

export type Tema = 'claro' | 'oscuro';

const CLAVE = 'tema';
const COLOR_BARRA: Record<Tema, string> = { claro: '#2D6A5A', oscuro: '#161C19' };

export function temaGuardado(): Tema {
  try {
    return localStorage.getItem(CLAVE) === 'oscuro' ? 'oscuro' : 'claro';
  } catch {
    return 'claro';
  }
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.theme = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema]);
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    /* sin almacenamiento: dura hasta recargar */
  }
}
