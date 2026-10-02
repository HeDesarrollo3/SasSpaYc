// src/components/dashboard/TarjetaMetaVacia.tsx
//
// Tarjeta discreta para una meta que **no está definida** (`0`).
//
// Importa tanto como la tarjeta con barra: sin ella, el apartado de metas
// aparecería a medias y el dueño no sabría que puede fijar los objetivos que le
// faltan. Y es deliberadamente sobria — sin barra, sin porcentaje—: pintar un
// `100 %` contra cero sería decirle que ha cumplido algo que nadie fijó.
//
// Las metas se editan solas en `/settings`: esa página agrupa los parámetros por
// prefijo `meta.` y los pinta con el control que corresponde a su tipo.
import { Link } from 'react-router-dom';
import { Settings, type LucideIcon } from 'lucide-react';

export function TarjetaMetaVacia({
  titulo,
  icono: Icono,
  ayuda,
}: {
  titulo: string;
  icono: LucideIcon;
  /** Qué mide esta meta y para qué sirve fijarla. */
  ayuda: string;
}) {
  return (
    <article className="panel flex h-full flex-col p-4" aria-label={`${titulo}: sin meta definida`}>
      <span className="flex items-center gap-2 text-body-sm font-semibold text-text-secondary">
        <Icono size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
        {titulo}
      </span>

      <p className="mt-1 text-label text-text-muted">Sin meta definida</p>
      <p className="mt-2 flex-1 text-body-sm text-text-secondary">{ayuda}</p>

      <Link
        to="/settings"
        className="mt-3 inline-flex items-center gap-1.5 self-start text-label font-semibold text-accent-from hover:underline"
      >
        <Settings size={14} aria-hidden="true" />
        Definir meta
      </Link>
    </article>
  );
}
