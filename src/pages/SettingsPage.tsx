// src/pages/SettingsPage.tsx
//
// Configuración general del negocio. Las tres secciones escriben de verdad en
// `parametros_sistema` (vía `/parametros`), que es la fuente de verdad: aquí no
// queda ningún estado local "de mentira" que se pierda al recargar.
//
// ## La moneda es la protagonista
// Un importe se pinta con `formatMoney()`, que lee el objeto **mutable** `MONEDA`
// de `lib/format.ts`. Ese objeto se rellena al arrancar con `GET /parametros/formato`
// (lo montan los dos layouts con `useFormato()`), así que cambiar la moneda es
// cambiar cinco filas de la base y refrescar el formateo — no hay nada
// hardcodeado que desplegar.
//
// La **vista previa** es la única excepción a la regla "todo importe pasa por
// `formatMoney()`": aquí se enseña cómo quedaría un importe con la configuración
// que el usuario está editando *todavía sin guardar*, y `formatMoney()` lee la
// configuración ya guardada. Por eso se calcula con un `Intl.NumberFormat` local.
//
// ⚠️ Cambiar la moneda NO convierte nada: los importes guardados siguen siendo
// los mismos números, sólo cambia símbolo, separadores y decimales.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Coins,
  Eye,
  HandCoins,
  Loader2,
  Package,
  Percent,
  Save,
  Settings,
  SlidersHorizontal,
  Store,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthStore } from '../stores/auth.store';
import { PageHeader } from '../components/PageHeader';
import { ParametrosService, guardarMoneda, type Parametro } from '../services/parametros.service';
import { useRefrescarFormato } from '../hooks/useFormato';
import { SeccionMetasNegocio } from '../components/settings/SeccionMetasNegocio';
import { MONEDAS, configurarFormato, formatFechaHora, type CodigoMoneda } from '../lib/format';
import { claseBanner } from '../lib/estados';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
/** Clave de TanStack Query del listado crudo. */
const PARAMETROS_KEY = ['parametros'] as const;

/** Importe de ejemplo de la vista previa: un servicio típico del spa. */
const IMPORTE_EJEMPLO = 100000;

/** Decimales que admite el formato de `Intl.NumberFormat`. */
const DECIMALES_MAX = 4;

/**
 * Listas cerradas que la propia `descripcion` del parámetro declara
 * (`precio | precio_menos_insumo`). El resto de parámetros de texto son libres.
 */
const OPCIONES_CERRADAS: Record<string, readonly string[]> = {
  'comision.base': ['precio', 'precio_menos_insumo'],
  'liquidacion.base_temporal': ['fecha_confirmacion', 'fecha_servicio'],
};

/**
 * Pista de formato para los parámetros de texto libre. La `descripcion` de la
 * base explica *para qué* sirven, pero no con qué sintaxis se escriben, y sin
 * esto `comision.orden` es imposible de rellenar bien.
 */
const PISTAS_TEXTO: Record<string, string> = {
  'comision.orden': 'linea,servicio,colaborador',
  'liquidacion.dia_corte': 'domingo',
};

interface Grupo {
  prefijo: string;
  titulo: string;
  descripcion: string;
  Icono: LucideIcon;
}

/** Agrupación de las reglas por prefijo de clave. */
const GRUPOS: readonly Grupo[] = [
  {
    prefijo: 'caja.',
    titulo: 'Cajas',
    descripcion: 'apertura y cierre',
    Icono: Wallet,
  },
  {
    prefijo: 'comision.',
    titulo: 'Comisiones',
    descripcion: 'base y precedencia del porcentaje',
    Icono: Percent,
  },
  {
    prefijo: 'liquidacion.',
    titulo: 'Liquidaciones',
    descripcion: 'corte semanal y arrastre de saldos',
    Icono: CalendarClock,
  },
  {
    prefijo: 'productos.',
    titulo: 'Productos',
    descripcion: 'comisión por venta de productos',
    Icono: Package,
  },
  {
    prefijo: 'propina.',
    titulo: 'Propinas',
    descripcion: 'registro de propina en el cobro',
    Icono: HandCoins,
  },
];

/** Grupo de cierre para una clave nueva que aún no tenga prefijo conocido. */
const GRUPO_OTROS: Grupo = {
  prefijo: '',
  titulo: 'Otros parámetros',
  descripcion: 'sin grupo asignado',
  Icono: SlidersHorizontal,
};

// ---------------------------------------------------------------------------
// Utilidades locales
// ---------------------------------------------------------------------------
/**
 * Claves que tienen su propia sección arriba y por eso NO salen en el listado
 * de reglas. `moneda` va sin punto (es la clave raíz del bloque de moneda).
 */
function esClaveReservada(clave: string): boolean {
  return (
    clave === 'moneda' ||
    clave.startsWith('moneda.') ||
    clave.startsWith('negocio.') ||
    clave.startsWith('meta.')
  );
}

/** `comision.base` → `param-comision-base`, para `htmlFor`/`id` estables. */
function idDe(clave: string): string {
  return `param-${clave.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

/** ¿El código es uno de los presets de `MONEDAS`? */
function esCodigoMoneda(codigo: string): codigo is CodigoMoneda {
  return Object.prototype.hasOwnProperty.call(MONEDAS, codigo);
}

/** ¿La cadena sirve como configuración regional de `Intl`? */
function localeValido(locale: string): boolean {
  try {
    new Intl.NumberFormat(locale);
    return true;
  } catch {
    return false;
  }
}

/** Decimales saneados al rango que admite `Intl.NumberFormat`. */
function decimalesValidos(valor: string | number): number {
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n)) return 0;
  return Math.min(DECIMALES_MAX, Math.max(0, n));
}

/** ¿El texto del input es un entero entre 0 y 4? */
function decimalesOk(valor: string): boolean {
  const v = valor.trim();
  return /^\d+$/.test(v) && Number(v) <= DECIMALES_MAX;
}

/**
 * Vista previa del importe con la configuración **en edición**.
 *
 * No usa `formatMoney()` a propósito: ése lee `MONEDA`, que todavía tiene los
 * valores guardados, así que la previsualización mentiría.
 */
function previsualizarImporte(
  importe: number,
  cfg: { simbolo: string; locale: string; decimales: number; centavos: boolean },
): string {
  if (!localeValido(cfg.locale)) return '—';
  const valor = cfg.centavos ? importe / 100 : importe;
  const decimales = decimalesValidos(cfg.decimales);
  const cuerpo = new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
  return `${cfg.simbolo}${cuerpo}`;
}

/** Traduce el error de la API a algo accionable. */
function mensajeError(err: unknown): string {
  const e = err as { error?: string; message?: string; statusCode?: number } | null;
  if (e?.error === 'NOT_FOUND') {
    return (
      e.message ??
      'Ese parámetro no está declarado en la base de datos. Las claves se añaden en las migraciones, no desde la interfaz.'
    );
  }
  if (e?.error === 'VALIDATION_ERROR') {
    return e.message ?? 'El valor no encaja con el tipo declarado del parámetro.';
  }
  if (e?.error === 'FORBIDDEN') {
    return 'Sólo la administración puede cambiar la configuración.';
  }
  return e?.message ?? 'No se pudo guardar el cambio.';
}

// ---------------------------------------------------------------------------
// Piezas de UI
// ---------------------------------------------------------------------------
const Section: React.FC<{
  icon: ReactNode;
  title: string;
  desc?: string;
  children: ReactNode;
}> = ({ icon, title, desc, children }) => (
  <section className="panel space-y-4 p-6">
    <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
      <span className="text-accent-from" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h2 className="text-h2 text-text-primary">{title}</h2>
        {desc && <p className="mt-0.5 text-body-sm text-text-muted">{desc}</p>}
      </div>
    </div>
    {children}
  </section>
);

/**
 * Interruptor accesible.
 *
 * Es un `<button role="switch">` con `aria-checked`, no un `<input type="checkbox">`
 * escondido: el estado se anuncia igual y no hace falta CSS nuevo.
 */
const Switch: React.FC<{
  id: string;
  activo: boolean;
  etiqueta: string;
  ayuda?: string;
  pendiente?: boolean;
  onToggle: () => void;
}> = ({ id, activo, etiqueta, ayuda, pendiente = false, onToggle }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <span id={id} className="text-body-sm font-semibold text-text-primary">
        {etiqueta}
      </span>
      {ayuda && <p className="field-help">{ayuda}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-labelledby={id}
      disabled={pendiente}
      onClick={onToggle}
      className={`relative h-5 w-10 shrink-0 rounded-full transition-all disabled:opacity-50 ${
        activo ? 'bg-accent-from' : 'bg-border-subtle'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          activo ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

/** Estado de un guardado: error inline o confirmación. */
const EstadoGuardado: React.FC<{ error: string | null; guardado: boolean }> = ({
  error,
  guardado,
}) => {
  if (error) {
    return (
      <p className="field-error" role="alert">
        <AlertTriangle size={14} aria-hidden="true" />
        {error}
      </p>
    );
  }
  if (guardado) {
    return (
      <p className="field-help text-success">
        <Check size={14} aria-hidden="true" /> Guardado
      </p>
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Fila de un parámetro de las secciones "Negocio" y "Reglas"
// ---------------------------------------------------------------------------
/**
 * Pinta el control que corresponde al `tipo` de la fila
 * (`boolean` → switch, `number` → input numérico, `string` → texto o `select`).
 *
 * Guarda **por campo**, con `ParametrosService.actualizar(clave, String(valor))`:
 * el servidor valida contra el tipo declarado en la base y devuelve el motivo en
 * un `422`, que se enseña junto al campo. Nada de `alert()`.
 */
const FilaParametro: React.FC<{
  parametro: Parametro;
  etiqueta?: string;
  ayuda?: string;
  placeholder?: string;
  opciones?: readonly string[];
  /**
   * Efecto local al guardar, con el valor **ya normalizado** por el servidor.
   * Se usa para la zona horaria: `formatMoney` y las fechas leen `MONEDA`/`TZ`
   * en vivo, y así el cambio se nota sin recargar.
   */
  alGuardar?: (valor: string) => void;
}> = ({ parametro, etiqueta, ayuda, placeholder, opciones, alGuardar }) => {
  const qc = useQueryClient();
  const [borrador, setBorrador] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // El borrador sólo existe mientras se edita: si es `null` se pinta el valor
  // del servidor. Así, después de guardar (o de fallar) la fila vuelve a la
  // verdad de la base sin estado duplicado que se pueda desincronizar.
  const valor = borrador ?? parametro.valor;
  const id = idDe(parametro.clave);
  const etiquetaFinal = etiqueta ?? parametro.clave;
  const textoAyuda = ayuda ?? parametro.descripcion ?? undefined;
  const esBooleano = parametro.tipo === 'boolean';
  const esNumerico = parametro.tipo === 'number';

  const mutacion = useMutation({
    mutationFn: (nuevo: string) => ParametrosService.actualizar(parametro.clave, nuevo),
    onSuccess: (fila) => {
      setError(null);
      setBorrador(null);
      setGuardado(true);
      alGuardar?.(fila.valor);
      toast.success(`«${parametro.clave}» actualizado`);
      // Invalidar el listado recarga también `['parametros','formato']` (coincide
      // por prefijo), así que un cambio de zona horaria se aplica al formateo.
      qc.invalidateQueries({ queryKey: PARAMETROS_KEY });
    },
    onError: (err) => {
      setError(mensajeError(err));
      setGuardado(false);
      // Un interruptor no puede quedarse en el estado que el servidor rechazó;
      // en un texto se conserva lo escrito para que se pueda corregir.
      if (esBooleano) setBorrador(null);
    },
  });

  const editar = (nuevo: string) => {
    setBorrador(nuevo);
    setError(null);
    setGuardado(false);
  };

  const alternar = () => {
    const nuevo = valor === 'true' ? 'false' : 'true';
    setBorrador(nuevo); // el switch responde al instante
    setError(null);
    setGuardado(false);
    mutacion.mutate(nuevo);
  };

  const sucio = valor !== parametro.valor;
  const vacio = valor.trim() === '';

  return (
    <div className="panel space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="badge badge-neutral">{parametro.clave}</span>
        <span className="text-body-sm text-text-muted">
          Actualizado {formatFechaHora(parametro.updated_at)}
        </span>
      </div>

      {esBooleano ? (
        <Switch
          id={id}
          activo={valor === 'true'}
          etiqueta={etiquetaFinal}
          ayuda={textoAyuda}
          pendiente={mutacion.isPending}
          onToggle={alternar}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor={id} className="label">
                {etiquetaFinal}
              </label>
              {opciones ? (
                <select
                  id={id}
                  className="select"
                  value={valor}
                  disabled={mutacion.isPending}
                  aria-invalid={error !== null}
                  onChange={(e) => editar(e.target.value)}
                >
                  {!opciones.includes(valor) && <option value={valor}>{valor} (valor actual)</option>}
                  {opciones.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  className={esNumerico ? 'input tabular' : 'input'}
                  type={esNumerico ? 'number' : 'text'}
                  step={esNumerico ? 'any' : undefined}
                  value={valor}
                  placeholder={placeholder}
                  disabled={mutacion.isPending}
                  aria-invalid={error !== null}
                  onChange={(e) => editar(e.target.value)}
                />
              )}
            </div>
            <button
              type="button"
              className="btn-secondary shrink-0 text-label"
              disabled={!sucio || vacio || mutacion.isPending}
              onClick={() => mutacion.mutate(valor)}
            >
              {mutacion.isPending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Save size={14} aria-hidden="true" />
              )}
              Guardar
            </button>
          </div>
          {textoAyuda && <p className="field-help">{textoAyuda}</p>}
        </>
      )}

      <EstadoGuardado error={error} guardado={guardado && !sucio} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
interface FormMoneda {
  codigo: string;
  simbolo: string;
  locale: string;
  /** Texto: es lo que edita el input, se sanea al guardar. */
  decimales: string;
  centavos: boolean;
}

export const SettingsPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const refrescarFormato = useRefrescarFormato();

  const {
    data: parametros = [],
    isLoading,
    error: errorLista,
  } = useQuery({
    queryKey: PARAMETROS_KEY,
    queryFn: () => ParametrosService.listar(),
    staleTime: 5 * 60_000,
  });

  const porClave = useMemo(() => {
    const mapa = new Map<string, Parametro>();
    for (const p of parametros) mapa.set(p.clave, p);
    return mapa;
  }, [parametros]);

  /** Lo que hay guardado en la base ahora mismo. */
  const monedaGuardada: FormMoneda | null = useMemo(() => {
    if (!porClave.has('moneda')) return null;
    const leer = (clave: string, porDefecto: string) => porClave.get(clave)?.valor ?? porDefecto;
    return {
      codigo: leer('moneda', 'COP'),
      simbolo: leer('moneda.simbolo', '$'),
      locale: leer('moneda.locale', 'es-CO'),
      decimales: leer('moneda.decimales', '0'),
      centavos: leer('moneda.centavos', 'false') === 'true',
    };
  }, [porClave]);

  // `null` mientras no se toque nada: entonces se pinta el valor del servidor.
  const [borradorMoneda, setBorradorMoneda] = useState<FormMoneda | null>(null);
  const moneda = borradorMoneda ?? monedaGuardada;

  const editarMoneda = (parcial: Partial<FormMoneda>) => {
    if (!moneda) return;
    setBorradorMoneda({ ...moneda, ...parcial });
  };

  /**
   * Al elegir un preset se rellenan símbolo, locale y decimales. **No** se toca
   * `centavos`: eso describe cómo están guardados los datos, no cómo se ven, y
   * cambiarlo a la brava reinterpretaría todos los importes históricos.
   */
  const elegirMoneda = (codigo: string) => {
    if (!moneda) return;
    if (!esCodigoMoneda(codigo)) {
      editarMoneda({ codigo });
      return;
    }
    const preset = MONEDAS[codigo];
    editarMoneda({
      codigo,
      simbolo: preset.simbolo,
      locale: preset.locale,
      decimales: String(preset.decimales),
    });
  };

  const [errorMoneda, setErrorMoneda] = useState<string | null>(null);

  const guardarMonedaMut = useMutation({
    mutationFn: (form: FormMoneda) =>
      guardarMoneda({
        codigo: form.codigo,
        simbolo: form.simbolo.trim(),
        locale: form.locale.trim(),
        decimales: decimalesValidos(form.decimales),
        centavos: form.centavos,
      }),
    onSuccess: async (_data, form) => {
      const normalizado: FormMoneda = {
        codigo: form.codigo,
        simbolo: form.simbolo.trim(),
        locale: form.locale.trim(),
        decimales: String(decimalesValidos(form.decimales)),
        centavos: form.centavos,
      };
      // Local primero: `formatMoney()` no es reactivo, así que sin esto los
      // importes ya pintados en esta pantalla seguirían con el formato viejo
      // hasta que el `GET /formato` volviera.
      configurarFormato({
        moneda: {
          codigo: normalizado.codigo,
          simbolo: normalizado.simbolo,
          locale: normalizado.locale,
          decimales: decimalesValidos(normalizado.decimales),
          centavos: normalizado.centavos,
        },
      });
      setBorradorMoneda(normalizado);
      setErrorMoneda(null);
      // Invalida el formato y **toda** la caché: cada pantalla vuelve a pintar
      // sus datos y con ellos sus importes. Es lo que hace que el cambio se vea
      // en el resto de la aplicación sin recargar.
      await refrescarFormato();
      toast.success(`Moneda guardada: ${normalizado.codigo}`);
    },
    onError: (err) => setErrorMoneda(mensajeError(err)),
  });

  // ── Validación del formulario de moneda ──
  const simboloOk = moneda !== null && moneda.simbolo.trim() !== '';
  const localeOk = moneda !== null && localeValido(moneda.locale.trim());
  const decimalesInputOk = moneda !== null && decimalesOk(moneda.decimales);
  const puedeGuardar = simboloOk && localeOk && decimalesInputOk;

  const monedaCambiada =
    moneda !== null &&
    monedaGuardada !== null &&
    (moneda.codigo !== monedaGuardada.codigo ||
      moneda.simbolo !== monedaGuardada.simbolo ||
      moneda.locale !== monedaGuardada.locale ||
      moneda.decimales.trim() !== monedaGuardada.decimales ||
      moneda.centavos !== monedaGuardada.centavos);

  const previsualizacion =
    moneda === null
      ? '—'
      : previsualizarImporte(IMPORTE_EJEMPLO, {
          simbolo: moneda.simbolo,
          locale: moneda.locale.trim(),
          decimales: decimalesValidos(moneda.decimales),
          centavos: moneda.centavos,
        });

  // ── Reparto de los parámetros en secciones ──
  const reglas = useMemo(
    () => parametros.filter((p) => !esClaveReservada(p.clave)),
    [parametros],
  );

  const grupos = useMemo(() => {
    const asignados = new Set<string>();
    const bloques = GRUPOS.map((grupo) => {
      const items = reglas.filter((p) => p.clave.startsWith(grupo.prefijo));
      for (const p of items) asignados.add(p.clave);
      return { grupo, items };
    }).filter((bloque) => bloque.items.length > 0);

    const otros = reglas.filter((p) => !asignados.has(p.clave));
    if (otros.length > 0) bloques.push({ grupo: GRUPO_OTROS, items: otros });
    return bloques;
  }, [reglas]);

  const paramNombreNegocio = porClave.get('negocio.nombre');
  const paramZonaHoraria = porClave.get('negocio.zona_horaria');
  const listo = !isLoading && !errorLista && porClave.size > 0;

  return (
    <div className="page-container max-w-4xl space-y-6">
      <PageHeader
        titulo="Configuración"
        descripcion={
          <>
            Moneda, datos del negocio y reglas de cálculo. Todo lo de esta pantalla se guarda en la
            base de datos (<code>parametros_sistema</code>) y se aplica sin desplegar código.
          </>
        }
        icono={Settings}
      />

      {/* ─── Perfil del usuario conectado ─── */}
      <div className="glass-card flex items-center gap-4 rounded-md border border-accent-from/20 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-from to-accent-to text-lg font-bold text-on-accent">
          {user?.nombre?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div>
          <p className="text-body-sm font-semibold text-text-primary">{user?.nombre}</p>
          <p className="text-body-sm text-text-muted">{user?.email}</p>
          <span className="badge badge-accent mt-1 capitalize">{user?.rol}</span>
        </div>
      </div>

      {/* ─── Carga y error del listado ─── */}
      {isLoading && (
        <div className="panel space-y-4 p-6" aria-busy="true">
          <span className="sr-only">Cargando la configuración…</span>
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      )}

      {Boolean(errorLista) && (
        <div className={claseBanner('danger')} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{mensajeError(errorLista)}</span>
        </div>
      )}

      {listo && <SeccionMetasNegocio porClave={porClave} parametrosKey={PARAMETROS_KEY} />}

      {/* ─── MONEDA (la protagonista) ─── */}
      {listo && monedaGuardada === null && (
        <div className={claseBanner('warning')} role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            No se encontró el parámetro «moneda» en la base. Comprueba que las migraciones{' '}
            <code>003_parametros_sistema.sql</code> y <code>007_moneda_configurable.sql</code> estén
            aplicadas.
          </span>
        </div>
      )}

      {listo && moneda !== null && (
        <Section
          icon={<Coins size={18} />}
          title="Moneda"
          desc="Cómo se muestran los importes en toda la aplicación"
        >
          <div className={claseBanner('warning')} role="note">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span>
              Cambiar la moneda afecta a <strong>todos</strong> los importes que se muestran, incluidos
              los históricos: cambia el <strong>formato</strong>, no el valor. No hay conversión de
              divisas — un servicio guardado como <span className="tabular">{IMPORTE_EJEMPLO}</span> se
              sigue mostrando con ese mismo número, con otro símbolo y otros separadores.
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={idDe('moneda')} className="label">
                Moneda
              </label>
              <select
                id={idDe('moneda')}
                className="select"
                value={moneda.codigo}
                disabled={guardarMonedaMut.isPending}
                onChange={(e) => elegirMoneda(e.target.value)}
              >
                {!esCodigoMoneda(moneda.codigo) && (
                  <option value={moneda.codigo}>{moneda.codigo} — código personalizado</option>
                )}
                {(Object.keys(MONEDAS) as CodigoMoneda[]).map((codigo) => (
                  <option key={codigo} value={codigo}>
                    {codigo} · {MONEDAS[codigo].nombre} ({MONEDAS[codigo].simbolo})
                  </option>
                ))}
              </select>
              <p className="field-help">
                Al elegir una moneda de la lista se rellenan el símbolo, la configuración regional y
                los decimales con los valores habituales de esa divisa.
              </p>
            </div>

            <div>
              <label htmlFor={idDe('moneda.simbolo')} className="label">
                Símbolo
              </label>
              <input
                id={idDe('moneda.simbolo')}
                className="input"
                type="text"
                value={moneda.simbolo}
                placeholder="$"
                disabled={guardarMonedaMut.isPending}
                aria-invalid={!simboloOk}
                onChange={(e) => editarMoneda({ simbolo: e.target.value })}
              />
              {simboloOk ? (
                <p className="field-help">Se antepone al importe.</p>
              ) : (
                <p className="field-error">El símbolo no puede quedar vacío.</p>
              )}
            </div>

            <div>
              <label htmlFor={idDe('moneda.locale')} className="label">
                Configuración regional (locale)
              </label>
              <input
                id={idDe('moneda.locale')}
                className="input"
                type="text"
                value={moneda.locale}
                placeholder="es-CO"
                disabled={guardarMonedaMut.isPending}
                aria-invalid={!localeOk}
                onChange={(e) => editarMoneda({ locale: e.target.value })}
              />
              {localeOk ? (
                <p className="field-help">
                  Decide los separadores: <span className="tabular">es-CO</span> agrupa con punto
                  (<span className="tabular">100.000</span>) y <span className="tabular">en-US</span> con
                  coma (<span className="tabular">100,000</span>).
                </p>
              ) : (
                <p className="field-error">
                  Configuración regional no válida. Usa el formato idioma-PAÍS, por ejemplo es-CO.
                </p>
              )}
            </div>

            <div>
              <label htmlFor={idDe('moneda.decimales')} className="label">
                Decimales
              </label>
              <input
                id={idDe('moneda.decimales')}
                className="input tabular"
                type="number"
                inputMode="numeric"
                min={0}
                max={DECIMALES_MAX}
                step={1}
                value={moneda.decimales}
                disabled={guardarMonedaMut.isPending}
                aria-invalid={!decimalesInputOk}
                onChange={(e) => editarMoneda({ decimales: e.target.value })}
              />
              {decimalesInputOk ? (
                <p className="field-help">
                  Entre 0 y {DECIMALES_MAX}. El peso colombiano usa 0: no tiene centavos.
                </p>
              ) : (
                <p className="field-error">Indica un número entero entre 0 y {DECIMALES_MAX}.</p>
              )}
            </div>

            <div className="sm:self-end">
              <Switch
                id={idDe('moneda.centavos')}
                activo={moneda.centavos}
                etiqueta="Los importes se guardan en centavos"
                ayuda="Actívalo sólo si tus importes se guardan multiplicados por 100: al mostrarlos se dividen entre 100."
                pendiente={guardarMonedaMut.isPending}
                onToggle={() => editarMoneda({ centavos: !moneda.centavos })}
              />
            </div>
          </div>

          <hr className="divider" />

          {/* Vista previa: se calcula con la configuración en edición, no con la guardada */}
          <div className="panel space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Eye size={14} className="text-accent-from" aria-hidden="true" />
              <span className="text-label text-text-secondary">Vista previa</span>
              {monedaCambiada && <span className="badge badge-warning">Sin guardar</span>}
            </div>
            <p className="tabular text-h1 text-text-primary">{previsualizacion}</p>
            <p className="field-help">
              Así se vería un servicio de <span className="tabular">{IMPORTE_EJEMPLO}</span> guardado
              en la base
              {moneda.centavos
                ? ', dividido entre 100 porque los importes están en centavos'
                : ', tal cual está guardado'}
              . Los importes reales de la aplicación se actualizan al guardar.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                className="btn-primary text-label"
                disabled={!monedaCambiada || !puedeGuardar || guardarMonedaMut.isPending}
                onClick={() => moneda && guardarMonedaMut.mutate(moneda)}
              >
                {guardarMonedaMut.isPending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={14} aria-hidden="true" />
                )}
                Guardar moneda
              </button>
              {monedaCambiada && (
                <button
                  type="button"
                  className="btn-ghost text-label"
                  disabled={guardarMonedaMut.isPending}
                  onClick={() => {
                    setBorradorMoneda(null);
                    setErrorMoneda(null);
                  }}
                >
                  Descartar cambios
                </button>
              )}
            </div>

            {errorMoneda && (
              <div className={claseBanner('danger')} role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{errorMoneda}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ─── NEGOCIO ─── */}
      {listo && (
        <Section
          icon={<Store size={18} />}
          title="Negocio"
          desc="Identidad y zona horaria del establecimiento"
        >
          {paramNombreNegocio ? (
            <FilaParametro
              parametro={paramNombreNegocio}
              etiqueta="Nombre del negocio"
              ayuda="Es la marca que aparece en la interfaz y en los recibos."
              placeholder="Mi Spa"
            />
          ) : (
            <p className="text-body-sm text-text-muted">
              No hay un parámetro «negocio.nombre» declarado en la base.
            </p>
          )}

          {paramZonaHoraria ? (
            <FilaParametro
              parametro={paramZonaHoraria}
              etiqueta="Zona horaria"
              ayuda="Zona IANA del negocio (ej. America/Bogota). Define el corte semanal de las liquidaciones: una zona distinta a la del servidor asigna cada servicio a la semana equivocada y se paga en el periodo que no toca."
              placeholder="America/Bogota"
              // La zona horaria se aplica en vivo, igual que la moneda: las
              // fechas de esta pantalla se recalculan sin esperar al refresco.
              alGuardar={(valor) => configurarFormato({ zonaHoraria: valor })}
            />
          ) : (
            <p className="text-body-sm text-text-muted">
              No hay un parámetro «negocio.zona_horaria» declarado en la base.
            </p>
          )}
        </Section>
      )}

      {/* ─── REGLAS ─── */}
      {listo && (
        <Section
          icon={<SlidersHorizontal size={18} />}
          title="Reglas de negocio"
          desc="Las aplica el backend; aquí sólo se cambian sus valores"
        >
          {grupos.length === 0 && (
            <p className="text-body-sm text-text-muted">
              No hay reglas declaradas aparte de la moneda y el negocio.
            </p>
          )}

          {grupos.map(({ grupo, items }) => (
            <div key={grupo.prefijo || 'otros'} className="space-y-3">
              <div className="flex items-center gap-2">
                <grupo.Icono size={14} className="text-accent-from" aria-hidden="true" />
                <h3 className="text-label text-text-primary">{grupo.titulo}</h3>
                <span className="text-body-sm text-text-muted">· {grupo.descripcion}</span>
              </div>
              <div className="space-y-2">
                {items.map((parametro) => (
                  <FilaParametro
                    key={parametro.clave}
                    parametro={parametro}
                    opciones={OPCIONES_CERRADAS[parametro.clave]}
                    placeholder={PISTAS_TEXTO[parametro.clave]}
                  />
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
};
