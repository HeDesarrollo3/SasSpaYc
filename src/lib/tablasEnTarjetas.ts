// src/lib/tablasEnTarjetas.ts
//
// En el celular, las tablas `.data-table` se muestran como tarjetas (ver
// index.css). Para que cada valor diga qué es, cada celda necesita el título de
// su columna en `data-label`. En lugar de repetirlo a mano en cada tabla, se
// copia aquí del encabezado, también cuando React vuelve a pintar filas.

function etiquetar(tabla: HTMLTableElement) {
  const titulos = Array.from(tabla.querySelectorAll('thead th')).map((th) =>
    (th.textContent ?? '').trim(),
  );
  if (titulos.length === 0) return;
  tabla.querySelectorAll('tbody tr').forEach((tr) => {
    Array.from(tr.children).forEach((celda, i) => {
      const titulo = titulos[i];
      if (titulo && celda.getAttribute('data-label') !== titulo) {
        celda.setAttribute('data-label', titulo);
      }
    });
  });
}

export function activarTablasEnTarjetas(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  let pendiente = false;
  const recorrer = () => {
    pendiente = false;
    document.querySelectorAll<HTMLTableElement>('table.data-table').forEach(etiquetar);
  };
  new MutationObserver(() => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(recorrer);
  }).observe(document.body, { childList: true, subtree: true });
  recorrer();
}
