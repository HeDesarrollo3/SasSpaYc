// src/pages/app/NuevoServicioPage.tsx
//
// Asistente de 3 pasos para registrar un servicio (spec §3.18).
//
//   PASO 1  ¿qué servicio hiciste?      → catálogo, con búsqueda
//   PASO 2  ¿a quién y con qué extras?  → cliente (buscable o manual) + extras
//   PASO 3  confirma y envía            → total y comisión estimados
//
// Reglas de negocio que esta pantalla **no** puede romper:
//   · El colaborador **no elige precios**: los ve, nunca los escribe.
//   · **No puede crear extras manuales**: sólo marca los del catálogo
//     (`CatalogoService.listarItems()` → `tipo === 'adicional'`). Si no hay
//     ninguno, se muestra un estado vacío, jamás un campo libre.
//   · Sólo **registra y envía**. Confirmar el cobro es de recepción/caja y este
//     portal no incluye ese endpoint.
//   · La comisión es **orientativa** y la UI lo dice con un ℹ️ explícito.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Info,
  LoaderCircle,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { CatalogoService, type ItemCatalogo } from '../../services/catalog.service';
import { ClientesService, type Cliente } from '../../services/clientes.service';
import {
  ComandasService,
  comandasKeys,
  type CrearComandaInput,
} from '../../services/comandas.service';
import { estimarComisionLinea } from '../../hooks/useComandas';
import { useAuthStore } from '../../stores/auth.store';
import { api, type ApiSuccess } from '../../services/api';
import { formatMoney, formatPorcentaje } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { AvisoApi } from '../../components/portal/AvisoApi';
import { PasoServicio } from '../../components/portal/PasoServicio';

type Paso = 1 | 2 | 3;

/** Opciones de hora del servicio. Cubre el caso real: "acabo de terminar". */
const OPCIONES_HORA = [
  { valor: 0, etiqueta: 'Ahora mismo' },
  { valor: 30, etiqueta: 'Hace 30 minutos' },
  { valor: 60, etiqueta: 'Hace 1 hora' },
  { valor: 120, etiqueta: 'Hace 2 horas' },
] as const;

const TITULOS: Record<Paso, string> = {
  1: '¿Qué servicio hiciste?',
  2: '¿A quién y con qué extras?',
  3: 'Confirma y envía',
};

/** `ahora − minutos` en ISO 8601, que es lo que espera `fecha_servicio`. */
function instanteHace(minutos: number): string {
  return new Date(Date.now() - minutos * 60_000).toISOString();
}

/** Etiqueta corta de un extra del catálogo, con su precio tal como lo lee el colaborador. */
function descripcionExtra(extra: ItemCatalogo): string {
  const pct = extra.porcentaje_comision;
  const sufijo = typeof pct === 'number' && pct > 0 ? ` · comisiona ${formatPorcentaje(pct)}` : '';
  return `+${formatMoney(extra.precio)}${sufijo}`;
}

export function NuevoServicioPage() {
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  /**
   * Servicio preseleccionado por quien trajo hasta aquí: «Repetir último» y los
   * chips de «Más usados» de `/app` navegan con
   * `state={{ servicioId }}`, así que el asistente ya sabe qué se hizo.
   *
   * Se lee **una sola vez**, como valor inicial del estado: si después el
   * colaborador elige otro servicio, el `state` de la URL no debe volver a pisarlo.
   */
  const servicioPreseleccionado =
    (ubicacion.state as { servicioId?: number } | null)?.servicioId ?? null;

  const [paso, setPaso] = useState<Paso>(1);
  const [filtroServicio, setFiltroServicio] = useState('');
  const [servicioId, setServicioId] = useState<number | null>(servicioPreseleccionado);

  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [modoClienteManual, setModoClienteManual] = useState(false);
  const [clienteNombre, setClienteNombre] = useState('');
  const [extrasMarcados, setExtrasMarcados] = useState<number[]>([]);
  /** Otros servicios del MISMO colaborador y de la MISMA área (categoría) que el principal. */
  const [otrosServiciosIds, setOtrosServiciosIds] = useState<number[]>([]);
  /** Adicionales que pidió el cliente y no están en el catálogo (migración 024). */
  const [extrasManuales, setExtrasManuales] = useState<
    { id: number; descripcion: string; valor: number }[]
  >([]);
  const [nuevoExtraTexto, setNuevoExtraTexto] = useState('');
  const [nuevoExtraValor, setNuevoExtraValor] = useState('');
  /** Precio elegido en servicios de precio variable (texto del input). */
  const [precioVariable, setPrecioVariable] = useState('');
  const [minutosAtras, setMinutosAtras] = useState(0);

  const [observaciones, setObservaciones] = useState('');
  const [clienteReferido, setClienteReferido] = useState(false);
  const [errorApi, setErrorApi] = useState<unknown>(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  /** El foco va al bloque del título del paso: sin esto, con teclado el foco se queda atrás. */
  const refTitulo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    refTitulo.current?.focus();
  }, [paso]);

  /** Esc cierra el bottom-sheet de descarte, como el resto de la aplicación. */
  useEffect(() => {
    if (!confirmarSalida) return;
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setConfirmarSalida(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [confirmarSalida]);

  // ── Catálogo ──────────────────────────────────────────────────────────────
  // ¿Este colaborador tiene comisión por cliente referido? (solo cabello, migración 023)
  const miPerfil = useQuery({
    queryKey: ['colaboradores', 'mi-perfil'],
    queryFn: async () => {
      const res = await api.get<
        unknown,
        ApiSuccess<{ area: string | null; porcentaje_referido: number | null }>
      >('/colaboradores/mi-perfil');
      return res.data;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  const porcentajeReferido = miPerfil.data?.porcentaje_referido ?? null;

  const catalogo = useQuery({
    queryKey: ['catalogo', 'items', true],
    queryFn: () => CatalogoService.listarItems(true),
    staleTime: 5 * 60_000,
  });

  const servicios = useMemo(
    () =>
      (catalogo.data ?? [])
        .filter((i) => i.tipo === 'servicio')
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [catalogo.data],
  );
  const extrasCatalogo = useMemo(
    () => (catalogo.data ?? []).filter((i) => i.tipo === 'adicional'),
    [catalogo.data],
  );

  // ── Clientes (buscable; el alta rápida es un extra opcional) ──────────────
  const clientes = useQuery({
    queryKey: ['clientes', 'opciones-portal'],
    queryFn: () => ClientesService.listar(1, 100),
    staleTime: 60_000,
  });

  /**
   * El servicio elegido se **deriva** de la lista, no se guarda aparte: si el
   * preseleccionado ya no está en el catálogo activo (lo desactivaron, o el
   * `state` viene de una pantalla vieja), simplemente no cuenta como elegido y el
   * paso 1 sigue pidiendo que se elija uno, en vez de quedarse bloqueado sin
   * explicación.
   */
  const servicioElegido = servicios.find((s) => s.id === servicioId);
  const extrasElegidos = extrasCatalogo.filter((e) => extrasMarcados.includes(e.id));

  // Precio variable: el servicio trae un rango y el colaborador elige el valor.
  const tieneRango =
    servicioElegido?.precio_min !== null &&
    servicioElegido?.precio_min !== undefined &&
    servicioElegido?.precio_max !== null &&
    servicioElegido?.precio_max !== undefined;
  const precioElegido = tieneRango
    ? Number(precioVariable.replace(/[^\d]/g, '')) || Number(servicioElegido?.precio ?? 0)
    : Number(servicioElegido?.precio ?? 0);
  const precioFueraDeRango =
    tieneRango &&
    (precioElegido < Number(servicioElegido?.precio_min) ||
      precioElegido > Number(servicioElegido?.precio_max));
  const servicioConPrecio = servicioElegido
    ? { ...servicioElegido, precio: precioElegido }
    : undefined;
  const totalExtrasManuales = extrasManuales.reduce((acc, e) => acc + e.valor, 0);

  const agregarExtraManual = () => {
    const descripcion = nuevoExtraTexto.trim();
    const valor = Number(nuevoExtraValor.replace(/[^\d]/g, ''));
    if (!descripcion || !valor) {
      toast.error('Escribe qué pidió el cliente y cuánto vale.');
      return;
    }
    setExtrasManuales((prev) => [...prev, { id: Date.now(), descripcion, valor }]);
    setNuevoExtraTexto('');
    setNuevoExtraValor('');
  };

  // Servicios adicionales: sólo de la misma categoría que el principal. Un
  // servicio de otra área (p. ej. uñas tras un peinado) lo registra quien lo hace.
  const categoriaPrincipal = (servicioElegido?.categoria ?? '').trim().toLowerCase();
  const serviciosMismaArea = useMemo(
    () =>
      servicioElegido
        ? servicios.filter(
            (s) =>
              s.id !== servicioElegido.id &&
              (s.categoria ?? '').trim().toLowerCase() === categoriaPrincipal,
          )
        : [],
    [servicios, servicioElegido, categoriaPrincipal],
  );
  const otrosServicios = serviciosMismaArea.filter((s) => otrosServiciosIds.includes(s.id));

  const totalEstimado =
    precioElegido +
    totalExtrasManuales +
    extrasElegidos.reduce((acc, e) => acc + Number(e.precio ?? 0), 0) +
    otrosServicios.reduce((acc, s) => acc + Number(s.precio ?? 0), 0);

  const comisionPrincipal = estimarComisionLinea(servicioConPrecio, 1, [
    ...extrasElegidos.map((e) => ({
      monto_unitario: Number(e.precio ?? 0),
      cantidad: 1,
      // Un extra comisiona si trae porcentaje propio: el catálogo no expone
      // siempre el booleano `genera_comision`.
      comisionable: typeof e.porcentaje_comision === 'number' && e.porcentaje_comision > 0,
    })),
    // Los adicionales escritos a mano comisionan con el % del servicio.
    ...extrasManuales.map((e) => ({ monto_unitario: e.valor, cantidad: 1, comisionable: true })),
  ]);

  const comisionOtros = otrosServicios.map((s) => estimarComisionLinea(s, 1, []));
  const comision = {
    ...comisionPrincipal,
    base: comisionPrincipal.base + comisionOtros.reduce((acc, c) => acc + c.base, 0),
    monto:
      comisionPrincipal.monto === null || comisionOtros.some((c) => c.monto === null)
        ? null
        : comisionPrincipal.monto + comisionOtros.reduce((acc, c) => acc + (c.monto ?? 0), 0),
  };

  const clienteValido = modoClienteManual ? clienteNombre.trim().length > 0 : clienteId !== null;
  const puedeAvanzar = paso === 1 ? servicioElegido !== undefined : clienteValido;

  const clientesFiltrados = useMemo(() => {
    const lista = clientes.data?.data ?? [];
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return lista.slice(0, 50);
    return lista
      .filter((c) => c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q))
      .slice(0, 50);
  }, [clientes.data, busquedaCliente]);

  // ── Envío ─────────────────────────────────────────────────────────────────
  const crear = useMutation({
    mutationFn: (input: CrearComandaInput) => ComandasService.crear(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: comandasKeys.todas });
      toast.success(`Servicio enviado (${data.folio}). Recepción lo cobrará.`);
      navigate('/app', { replace: true });
    },
    onError: (err) => setErrorApi(err),
  });

  const enviar = () => {
    setErrorApi(null);
    if (!servicioElegido) {
      setPaso(1);
      toast.error('Elige el servicio que hiciste.');
      return;
    }
    if (precioFueraDeRango) {
      setPaso(2);
      toast.error('El precio del servicio está fuera del rango permitido.');
      return;
    }
    if (!clienteValido) {
      setPaso(2);
      toast.error('Indica el cliente: selecciónalo o escribe su nombre.');
      return;
    }
    /**
     * ⚠️ `colaborador_id` es obligatorio en el DTO del backend aunque el rol
     * `colaborador` sea quien crea: el servicio lo pisa con el del usuario
     * autenticado (`comandas.service.ts:74-79`), pero la validación del DTO corre
     * antes. Si el vínculo `usuarios.colaborador_id` todavía no existe (llega con
     * la migración 001), el backend responde `VALIDATION_ERROR` por un motivo que
     * no se puede adivinar desde el mensaje: aquí se corta con una explicación.
     */
    if (!user?.colaborador_id) {
      toast.error('Tu usuario aún no está vinculado a un colaborador.');
      return;
    }

    crear.mutate({
      colaboradorId: user.colaborador_id,
      clienteId: modoClienteManual ? undefined : (clienteId ?? undefined),
      clienteNombre: modoClienteManual ? clienteNombre.trim() : undefined,
      fechaServicio: minutosAtras === 0 ? undefined : instanteHace(minutosAtras),
      observaciones: observaciones.trim() || undefined,
      enviar: true,
      clienteReferido: porcentajeReferido !== null && clienteReferido,
      items: [
        {
          servicioId: servicioElegido.id,
          cantidad: 1,
          precioUnitario: tieneRango ? precioElegido : undefined,
          extras: [
            ...extrasElegidos.map((e) => ({ adicionalId: e.id, cantidad: 1 })),
            ...extrasManuales.map((e) => ({
              descripcion: e.descripcion,
              montoUnitario: e.valor,
              cantidad: 1,
            })),
          ],
        },
        ...otrosServicios.map((s) => ({ servicioId: s.id, cantidad: 1 })),
      ],
    });
  };

  const alternarExtra = (id: number) => {
    setExtrasMarcados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const hayDatos =
    servicioElegido !== undefined ||
    clienteValido ||
    extrasMarcados.length > 0 ||
    extrasManuales.length > 0;

  const salir = () => {
    if (hayDatos) setConfirmarSalida(true);
    else navigate('/app');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* El botón de salida lleva su propia confirmación de descarte, así que NO se
          sustituye por el enlace `volver` de `PageHeader`: ése navegaría sin avisar
          de que se pierde lo elegido. Se usa `PageHeader` sólo para el título. */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="btn-icon mt-0.5 shrink-0"
          onClick={salir}
          aria-label="Salir del registro"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div ref={refTitulo} tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <p className="text-label uppercase tracking-wide text-text-muted">Paso {paso} de 3</p>
          <PageHeader titulo={TITULOS[paso]} className="mt-0.5" />
        </div>
      </div>

      {/* Progreso: texto + color, nunca sólo color. */}
      <ol className="flex items-center gap-1.5" aria-label="Progreso del registro">
        {([1, 2, 3] as Paso[]).map((n) => (
          <li key={n} className="flex-1">
            <span
              className={`block h-1.5 rounded-full ${
                n <= paso ? 'bg-accent-from' : 'bg-surface-card'
              }`}
            />
            <span className="sr-only">{n <= paso ? `Paso ${n} hecho` : `Paso ${n} pendiente`}</span>
          </li>
        ))}
      </ol>

      {errorApi ? <AvisoApi error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}

      {paso === 1 && (
        <PasoServicio
          servicios={servicios}
          filtro={filtroServicio}
          onFiltro={setFiltroServicio}
          seleccionadoId={servicioId}
          onSeleccionar={setServicioId}
          cargando={catalogo.isPending}
        />
      )}

      {paso === 2 && (
        <div className="space-y-6">
          {/* Cliente */}
          <section className="space-y-3">
            <h2 className="text-h2 text-text-primary">Cliente</h2>

            {clientes.isError ? (
              <div className="panel p-3 text-body-sm text-text-secondary">
                No se pudo cargar la lista de clientes. Puedes escribir el nombre a mano.
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="paso2-cliente" className="label">
                Buscar cliente registrado
              </label>
              <input
                id="paso2-cliente"
                type="search"
                className="input"
                placeholder="Nombre o teléfono…"
                autoComplete="off"
                value={busquedaCliente}
                disabled={modoClienteManual}
                onChange={(e) => {
                  setBusquedaCliente(e.target.value);
                  setModoClienteManual(false);
                }}
              />

              {!modoClienteManual && (
                <ul
                  role="radiogroup"
                  aria-label="Clientes que coinciden"
                  className="max-h-64 space-y-1.5 overflow-y-auto"
                >
                  {clientes.isPending && clientesFiltrados.length === 0 ? (
                    <>
                      <li className="skeleton h-12 w-full" />
                      <li className="skeleton h-12 w-full" />
                    </>
                  ) : clientesFiltrados.length === 0 ? (
                    <li className="panel p-3 text-body-sm text-text-secondary">
                      Ningún cliente coincide. Marca «Escribir nombre manualmente» y anota el
                      nombre: en un spa lo normal es atender a alguien que no está registrado.
                    </li>
                  ) : (
                    clientesFiltrados.map((c: Cliente) => {
                      const activo = c.id === clienteId;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            onClick={() => setClienteId(c.id)}
                            className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left text-body ${
                              activo
                                ? 'border-accent-from bg-accent-from/10 text-text-primary'
                                : 'border-border-subtle bg-surface-card text-text-secondary'
                            }`}
                          >
                            <span className="truncate">{c.nombre}</span>
                            {c.telefono && (
                              <span className="tabular shrink-0 text-body-sm text-text-muted">
                                {c.telefono}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>

            <label
              htmlFor="paso2-manual"
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border border-border-subtle bg-surface-card px-3 py-2"
            >
              <input
                id="paso2-manual"
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent-from)]"
                checked={modoClienteManual}
                onChange={(e) => {
                  setModoClienteManual(e.target.checked);
                  if (e.target.checked) setClienteId(null);
                }}
              />
              <span className="text-body text-text-primary">Escribir nombre manualmente</span>
            </label>

            {modoClienteManual && (
              <div>
                <label htmlFor="paso2-nombre" className="label">
                  Nombre del cliente *
                </label>
                <input
                  id="paso2-nombre"
                  type="text"
                  className="input"
                  placeholder="María"
                  autoComplete="off"
                  value={clienteNombre}
                  aria-invalid={clienteNombre.trim().length === 0}
                  onChange={(e) => setClienteNombre(e.target.value)}
                />
                <p className="field-help">Basta con el nombre: recepción lo verá al cobrar.</p>
              </div>
            )}
            {porcentajeReferido !== null && (
              <label
                htmlFor="paso2-referido"
                className="flex min-h-12 cursor-pointer items-start gap-3 rounded-sm border border-border-subtle bg-surface-card px-3 py-2"
              >
                <input
                  id="paso2-referido"
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--color-accent-from)]"
                  checked={clienteReferido}
                  onChange={(e) => setClienteReferido(e.target.checked)}
                />
                <span>
                  <span className="block text-body text-text-primary">
                    Este cliente lo traje yo
                  </span>
                  <span className="block text-body-sm text-text-secondary">
                    Cliente referido: tu comisión es del{' '}
                    {formatPorcentaje(Number(porcentajeReferido))}. Recepción lo confirma al cobrar.
                  </span>
                </span>
              </label>
            )}
          </section>

          {/* Otro servicio de la misma área */}
          {serviciosMismaArea.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-h2 text-text-primary">
                ¿Hiciste otro servicio?{' '}
                <span className="font-normal text-text-muted">(opcional)</span>
              </h2>
              <p className="text-body-sm text-text-secondary">
                Solo servicios de {servicioElegido?.categoria ?? 'tu misma área'}. Si el cliente
                también recibe un servicio de otra área (por ejemplo uñas después de un peinado), lo
                registra la persona que lo hace.
              </p>
              <ul className="space-y-2">
                {serviciosMismaArea.map((s) => {
                  const marcado = otrosServiciosIds.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-sm border border-border-subtle bg-surface-card px-3 py-2">
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--color-accent-from)]"
                            checked={marcado}
                            onChange={() =>
                              setOtrosServiciosIds((prev) =>
                                marcado ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                              )
                            }
                          />
                          <span className="text-body text-text-primary">{s.nombre}</span>
                        </span>
                        <span className="tabular shrink-0 text-body-sm text-text-secondary">
                          {formatMoney(s.precio)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Precio variable (p. ej. cepillado según el largo) */}
          {tieneRango && servicioElegido && (
            <section className="space-y-2">
              <h2 className="text-h2 text-text-primary">Precio del servicio</h2>
              <label htmlFor="precio-variable" className="label">
                {servicioElegido.nombre}: entre {formatMoney(Number(servicioElegido.precio_min))} y{' '}
                {formatMoney(Number(servicioElegido.precio_max))}
              </label>
              <input
                id="precio-variable"
                inputMode="numeric"
                className="input tabular"
                placeholder={String(servicioElegido.precio)}
                value={precioVariable}
                aria-invalid={precioFueraDeRango}
                onChange={(e) => setPrecioVariable(e.target.value)}
              />
              <p className={precioFueraDeRango ? 'field-error' : 'field-help'}>
                {precioFueraDeRango
                  ? 'Ese valor está fuera del rango del servicio.'
                  : `Se cobrará ${formatMoney(precioElegido)}. Recepción lo confirma al cobrar.`}
              </p>
            </section>
          )}

          {/* Adicional que pidió el cliente (escrito a mano) */}
          <section className="space-y-3">
            <h2 className="text-h2 text-text-primary">
              ¿El cliente pidió algo más?{' '}
              <span className="font-normal text-text-muted">(opcional)</span>
            </h2>
            <p className="text-body-sm text-text-secondary">
              Por ejemplo «mechón» o «producto X». Escribe qué fue y cuánto vale; recepción lo
              confirma al cobrar y comisiona con el mismo porcentaje del servicio.
            </p>
            {extrasManuales.length > 0 && (
              <ul className="space-y-2">
                {extrasManuales.map((e) => (
                  <li
                    key={e.id}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-sm border border-accent-from bg-accent-soft px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-body text-text-primary">
                      {e.descripcion}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-body-sm text-text-primary">
                        {formatMoney(e.valor)}
                      </span>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Quitar ${e.descripcion}`}
                        onClick={() =>
                          setExtrasManuales((prev) => prev.filter((x) => x.id !== e.id))
                        }
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <input
                className="input"
                placeholder="Qué pidió"
                aria-label="Qué pidió el cliente"
                value={nuevoExtraTexto}
                onChange={(e) => setNuevoExtraTexto(e.target.value)}
              />
              <input
                className="input tabular"
                inputMode="numeric"
                placeholder="Valor"
                aria-label="Valor del adicional"
                value={nuevoExtraValor}
                onChange={(e) => setNuevoExtraValor(e.target.value)}
              />
            </div>
            <button type="button" className="btn-secondary w-full" onClick={agregarExtraManual}>
              Agregar adicional
            </button>
          </section>

          {/* Extras */}
          <section className="space-y-3">
            <h2 className="text-h2 text-text-primary">
              Extras <span className="font-normal text-text-muted">(opcional)</span>
            </h2>

            {catalogo.isPending ? (
              <div className="skeleton h-14 w-full" />
            ) : extrasCatalogo.length === 0 ? (
              <div className="panel p-3">
                <p className="text-body font-semibold text-text-primary">
                  No hay extras en el catálogo
                </p>
                <p className="mt-1 text-body-sm text-text-secondary">
                  Sólo se pueden marcar extras dados de alta por administración (piedras calientes,
                  aceites, aromaterapia…). Si el cliente pidió otra cosa, agrégala arriba.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {extrasCatalogo.map((extra: ItemCatalogo) => {
                  const marcado = extrasMarcados.includes(extra.id);
                  return (
                    <li key={extra.id}>
                      <label
                        htmlFor={`extra-${extra.id}`}
                        className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-sm border px-3 py-2 ${
                          marcado
                            ? 'border-accent-from bg-accent-from/10'
                            : 'border-border-subtle bg-surface-card'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <input
                            id={`extra-${extra.id}`}
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-[var(--color-accent-from)]"
                            checked={marcado}
                            onChange={() => alternarExtra(extra.id)}
                          />
                          <span className="truncate text-body text-text-primary">
                            {extra.nombre}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-label text-text-secondary">
                          {descripcionExtra(extra)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="field-help">Los precios ya están incluidos en el total.</p>
          </section>

          {/* Hora */}
          <section>
            <label htmlFor="paso2-hora" className="label">
              Hora del servicio
            </label>
            <div className="relative">
              <select
                id="paso2-hora"
                className="select appearance-none pr-9"
                value={minutosAtras}
                onChange={(e) => setMinutosAtras(Number(e.target.value))}
              >
                {OPCIONES_HORA.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
            </div>
          </section>
        </div>
      )}

      {paso === 3 && servicioElegido && (
        <div className="space-y-6">
          <section className="panel p-4">
            <h2 className="flex items-center gap-2 text-h2 text-text-primary">
              <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
              Resumen
            </h2>

            <ul className="mt-3 space-y-2 text-body">
              <li className="flex items-start justify-between gap-3">
                <span className="text-text-primary">{servicioElegido.nombre}</span>
                <span className="tabular shrink-0 text-text-primary">
                  {formatMoney(precioElegido)}
                </span>
              </li>
              {otrosServicios.map((s) => (
                <li key={`srv-${s.id}`} className="flex items-start justify-between gap-3">
                  <span className="text-text-primary">{s.nombre}</span>
                  <span className="tabular shrink-0 text-text-primary">
                    {formatMoney(s.precio)}
                  </span>
                </li>
              ))}
              {extrasManuales.map((e) => (
                <li key={`man-${e.id}`} className="flex items-start justify-between gap-3 pl-4">
                  <span className="text-text-secondary">+ {e.descripcion}</span>
                  <span className="tabular shrink-0 text-text-secondary">
                    {formatMoney(e.valor)}
                  </span>
                </li>
              ))}
              {extrasElegidos.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 pl-4">
                  <span className="text-text-secondary">+ {e.nombre}</span>
                  <span className="tabular shrink-0 text-text-secondary">
                    {formatMoney(e.precio)}
                  </span>
                </li>
              ))}
            </ul>

            <hr className="divider my-3" />

            <dl className="space-y-2 text-body">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Cliente</dt>
                <dd className="flex items-center gap-1.5 text-text-primary">
                  <UserRound size={14} aria-hidden="true" />
                  {modoClienteManual
                    ? clienteNombre.trim()
                    : ((clientes.data?.data ?? []).find((c) => c.id === clienteId)?.nombre ?? '—')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-text-secondary">Hora</dt>
                <dd className="text-text-primary">
                  {OPCIONES_HORA.find((o) => o.valor === minutosAtras)?.etiqueta ?? 'Ahora mismo'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
                <dt className="font-semibold text-text-primary">Total estimado</dt>
                <dd className="tabular text-h2 text-text-primary">{formatMoney(totalEstimado)}</dd>
              </div>
            </dl>
          </section>

          {/* Comisión estimada */}
          <section className="panel p-4">
            <h2 className="flex items-center gap-2 text-h2 text-text-primary">
              <Info size={16} className="text-info" aria-hidden="true" />
              Tu comisión estimada
            </h2>
            {comision.monto === null ? (
              <p className="mt-2 text-body text-text-secondary">
                {comision.comisiona
                  ? 'No se puede estimar aquí: el porcentaje aplicable se define en el servicio o en tu ficha de colaborador. Lo calculará la base de datos al confirmarse el cobro.'
                  : 'Este servicio no genera comisión.'}
              </p>
            ) : (
              <p className="tabular mt-2 text-2xl font-bold text-accent-from">
                {formatMoney(comision.monto)}
              </p>
            )}
            <p className="mt-2 text-body-sm text-text-muted">
              Es una <strong>estimación orientativa</strong> sobre {formatMoney(comision.base)} de
              base
              {comision.porcentaje !== null ? ` al ${formatPorcentaje(comision.porcentaje)}` : ''}.
              El valor definitivo lo calcula la base de datos al confirmar el cobro y puede cambiar
              si recepción aplica un descuento o cambia la forma de pago.
            </p>
          </section>

          <section>
            <label htmlFor="paso3-notas" className="label">
              Notas <span className="font-normal text-text-muted">(opcional)</span>
            </label>
            <textarea
              id="paso3-notas"
              rows={3}
              className="textarea scroll-mb-48"
              placeholder="Algo que recepción deba saber al cobrar…"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </section>

          <div className="banner banner-info" role="status">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Al enviar, el servicio entra en la bandeja de recepción. Es recepción o caja quien
              confirma el cobro: tú no puedes cobrarlo.
            </span>
          </div>

          {!user?.colaborador_id && (
            <div className="banner banner-warning" role="status">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Tu usuario todavía no está vinculado a una ficha de colaborador, así que el envío
                fallará. Es lo que desbloquea la migración <code>001</code>; avisa a administración.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Acciones */}
      {/*
        En el resumen (paso 3) la barra deja de flotar: flotando tapaba «Notas»
        al abrir el teclado del celular. En los pasos 1 y 2 sigue fija para que
        «Siguiente» esté siempre a mano.
      */}
      <footer
        className={`${
          paso === 3 ? 'mt-4' : 'sticky bottom-24 z-10 lg:bottom-4'
        } flex gap-2 rounded-md border border-border-subtle bg-bg-elevated/95 p-3 backdrop-blur-md`}
      >
        {paso > 1 && (
          <button
            type="button"
            className="btn-secondary min-h-12 flex-1"
            onClick={() => setPaso((p) => (p === 3 ? 2 : 1))}
            disabled={crear.isPending}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Atrás
          </button>
        )}

        {paso < 3 ? (
          <button
            type="button"
            className="btn-primary min-h-12 flex-1"
            onClick={() => setPaso((p) => (p === 1 ? 2 : 3))}
            disabled={!puedeAvanzar}
          >
            Siguiente
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary min-h-12 flex-1"
            onClick={enviar}
            disabled={crear.isPending || !clienteValido || !servicioElegido}
          >
            {crear.isPending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
            Enviar servicio
          </button>
        )}
      </footer>

      {/* Salida con datos sin guardar */}
      {confirmarSalida && (
        <>
          <div
            className="drawer-backdrop"
            onClick={() => setConfirmarSalida(false)}
            aria-hidden="true"
          />
          <div
            className="sheet-panel p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Descartar el registro"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h2 text-text-primary">¿Descartar el registro?</h2>
                <p className="mt-1 text-body-sm text-text-secondary">
                  Si sales ahora se pierde lo que llevas elegido. El servicio no se ha enviado.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setConfirmarSalida(false)}
                aria-label="Seguir en el registro"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-ghost min-h-12 flex-1"
                onClick={() => setConfirmarSalida(false)}
              >
                Seguir aquí
              </button>
              <Link to="/app" className="btn-danger min-h-12 flex-1" replace>
                Descartar
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
