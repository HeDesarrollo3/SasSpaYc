// src/pages/app/MisMetasPage.tsx
//
// `/app/metas` — las metas del colaborador (spec §5).
//
// ## Para qué existe
// El resumen de `/app` pinta una barra contra **la meta del día**. La tabla
// `metas` está vacía y no había ninguna pantalla para llenarla, así que la barra
// no podía existir nunca. Esta es esa pantalla.
//
// ## Lo que se puede y lo que no
// · **Personales** (`origen: 'personal'`): se crean, se editan, se pausan y se
//   borran. Son del colaborador.
// · **De administración** (`origen: 'administracion'`): **sólo lectura**, sin
//   botones. Las fija el negocio y su bono (si lo tiene) es informativo.
// · **Sin campo de bono en las personales**: el `CHECK`
//   `metas_bono_solo_administracion` rechaza una meta personal con bono, así que
//   ofrecerlo sería ofrecer algo que la base va a tirar.
//
// ## El CRUD va por el backend, y por eso está activo
// La pantalla ya no lee ni escribe `metas` directo en Supabase: usa
// `GET/POST/PATCH/DELETE /api/v1/me/metas`. La migración 016 revoca
// `INSERT/UPDATE/DELETE` a `authenticated` —y **no se arregla con un `GRANT`**,
// porque la RLS de `metas` aísla por empresa, no por dueño—, así que la escritura
// pasa por el backend con `service_role`, que sí aplica las reglas.
//
// Antes había aquí un sondeo (`usePuedeEscribirMetas`) que **probaba** si la base
// dejaba escribir y dejaba la lista en sólo lectura cuando no. Ya no hace falta:
// se puede escribir siempre que el usuario tenga ficha de colaborador, y la API lo
// dice con `403 NO_ES_COLABORADOR` si no la tiene.
//
// ## Tono
// Motivacional, no financiero: «qué quieres conseguir», no «cuánto te van a
// pagar». La única cifra con dinero es lo que administración haya puesto de bono.
import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, Plus, Sparkles, Target, X } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '../../components/PageHeader';
import { AvisoApi } from '../../components/portal/AvisoApi';
import { MetaCard } from '../../components/portal/MetaCard';
import {
  useActualizarMeta,
  useBorrarMeta,
  useCrearMeta,
  useMetasDelColaborador,
} from '../../components/portal/metas';
import {
  PERIODOS_META,
  TIPOS_MEDIBLES,
  etiquetaPeriodo,
  etiquetaTipo,
  parsearObjetivo,
  unidadDeTipo,
  vigenciaCoherente,
  type MetaFila,
  type MetaPeriodo,
  type MetaTipo,
} from '../../components/portal/metaAvance';
import { aISODate, formatMoney } from '../../lib/format';

/** El formulario guarda el objetivo como texto: es lo que teclea la persona. */
interface FormularioMeta {
  tipo: MetaTipo;
  periodo: MetaPeriodo;
  objetivo: string;
  vigenteDesde: string;
  /** Cadena vacía = sin fecha de fin. */
  vigenteHasta: string;
}

function formularioVacio(hoy: string): FormularioMeta {
  return { tipo: 'comision', periodo: 'dia', objetivo: '', vigenteDesde: hoy, vigenteHasta: '' };
}

export function MisMetasPage() {
  const hoy = aISODate(new Date());

  const metas = useMetasDelColaborador();
  const crear = useCrearMeta();
  const actualizar = useActualizarMeta();
  const borrar = useBorrarMeta();

  const [formulario, setFormulario] = useState<FormularioMeta | null>(null);
  const [editando, setEditando] = useState<MetaFila | null>(null);
  const [aBorrar, setABorrar] = useState<MetaFila | null>(null);
  const [errorApi, setErrorApi] = useState<unknown>(null);
  const [errorObjetivo, setErrorObjetivo] = useState<string | null>(null);
  const [errorFechas, setErrorFechas] = useState<string | null>(null);

  const ocupada = crear.isPending || actualizar.isPending || borrar.isPending;

  /** Esc cierra la confirmación de borrado, como en el resto de la aplicación. */
  useEffect(() => {
    if (!aBorrar) return;
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setABorrar(null);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [aBorrar]);

  // ── Datos ─────────────────────────────────────────────────────────────────
  /**
   * `true` si el usuario tiene ficha de colaborador, que es la única condición
   * para poder guardar: una meta «personal» sin dueño no es de nadie y el `CHECK`
   * `metas_personal_con_dueno` la rechaza. El servidor lo comprueba igual
   * (`403 NO_ES_COLABORADOR`); aquí sólo se evita ofrecer un botón que va a
   * fallar.
   */
  const puedeEscribir = metas.colaboradorId !== null;

  const todas = metas.data ?? [];
  /** Lo mío: personales (mías por definición) y las que administración me asignó. */
  const mias = todas.filter((m) => m.colaborador_id === metas.colaboradorId);
  /** Metas del negocio, sin dueño: se ven, no se tocan. */
  const delNegocio = todas.filter((m) => m.colaborador_id === null);

  const cargando = metas.isPending && metas.colaboradorId !== null;
  /**
   * Sin ficha de colaborador no hay meta personal posible (lo impone el `CHECK`
   * `metas_personal_con_dueno`). La consulta sí se hace —el backend responde
   * `propias: []` y las de empresa—, así que hay que decirlo en pantalla en vez
   * de dejar un esqueleto o un «no tienes metas» engañoso.
   */
  const sinFicha = metas.colaboradorId === null;

  // ── Acciones ──────────────────────────────────────────────────────────────
  const abrirCrear = () => {
    setEditando(null);
    setErrorObjetivo(null);
    setErrorFechas(null);
    setErrorApi(null);
    setFormulario(formularioVacio(hoy));
  };

  const abrirEditar = (meta: MetaFila) => {
    setEditando(meta);
    setErrorObjetivo(null);
    setErrorFechas(null);
    setErrorApi(null);
    setFormulario({
      tipo: meta.tipo,
      periodo: meta.periodo,
      objetivo: String(Math.round(Number(meta.objetivo))),
      vigenteDesde: meta.vigente_desde.slice(0, 10),
      vigenteHasta: (meta.vigente_hasta ?? '').slice(0, 10),
    });
  };

  const cerrarFormulario = () => {
    setFormulario(null);
    setEditando(null);
  };

  const guardar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!formulario) return;

    setErrorApi(null);
    setErrorObjetivo(null);
    setErrorFechas(null);

    const objetivo = parsearObjetivo(formulario.objetivo);
    if (objetivo === null) {
      setErrorObjetivo('Escribe un objetivo mayor que cero, en pesos y sin puntos.');
      return;
    }

    const hasta = formulario.vigenteHasta || null;
    if (!vigenciaCoherente(formulario.vigenteDesde, hasta)) {
      setErrorFechas('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }

    const input = {
      tipo: formulario.tipo,
      periodo: formulario.periodo,
      objetivo,
      vigenteDesde: formulario.vigenteDesde,
      vigenteHasta: hasta,
    };

    const alGuardar = {
      onSuccess: () => {
        toast.success(editando ? 'Meta actualizada.' : 'Meta creada. Ya aparece en tu inicio.');
        cerrarFormulario();
      },
      onError: (err: unknown) => setErrorApi(err),
    };

    if (editando) actualizar.mutate({ id: editando.id, cambios: input }, alGuardar);
    else crear.mutate(input, alGuardar);
  };

  const alternarActiva = (meta: MetaFila) => {
    setErrorApi(null);
    actualizar.mutate(
      { id: meta.id, cambios: { activa: !meta.activa } },
      {
        onSuccess: () =>
          toast.success(meta.activa ? 'Meta en pausa.' : 'Meta reactivada.'),
        onError: (err: unknown) => setErrorApi(err),
      },
    );
  };

  const confirmarBorrado = () => {
    if (!aBorrar) return;
    setErrorApi(null);
    borrar.mutate(aBorrar.id, {
      onSuccess: () => {
        toast.success('Meta borrada.');
        setABorrar(null);
      },
      onError: (err: unknown) => {
        setErrorApi(err);
        setABorrar(null);
      },
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const objetivoNum = formulario ? parsearObjetivo(formulario.objetivo) : null;
  const esMoneda = formulario ? unidadDeTipo(formulario.tipo) === 'moneda' : true;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Mis metas"
        descripcion="Un objetivo claro hace que el día tenga dirección. Tú decides cuál."
        icono={Target}
        acciones={
          puedeEscribir && !formulario && !cargando ? (
            <button type="button" className="btn-primary min-h-12" onClick={abrirCrear}>
              <Plus size={16} aria-hidden="true" />
              Nueva meta
            </button>
          ) : null
        }
      />

      {errorApi ? <AvisoApi error={errorApi} onDescartar={() => setErrorApi(null)} /> : null}
      {metas.isError ? <AvisoApi error={metas.error} /> : null}

      {/* Formulario */}
      {formulario && (
        <form className="panel space-y-4 p-4" onSubmit={guardar} aria-labelledby="titulo-form-meta">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 id="titulo-form-meta" className="text-h2 text-text-primary">
                {editando ? 'Editar meta' : 'Nueva meta personal'}
              </h2>
              <p className="mt-1 text-body-sm text-text-secondary">
                {editando
                  ? 'Cambiar el objetivo no borra lo que llevas: sólo mueve la barra.'
                  : 'Es tu propósito para el periodo. Nadie más lo cambia y no lleva dinero asociado.'}
              </p>
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={cerrarFormulario}
              aria-label="Cerrar el formulario"
            >
              <X size={16} />
            </button>
          </div>

          <div>
            <label htmlFor="meta-tipo" className="label">
              ¿Qué quieres medir?
            </label>
            <select
              id="meta-tipo"
              className="select"
              value={formulario.tipo}
              onChange={(e) =>
                setFormulario({ ...formulario, tipo: e.target.value as MetaTipo })
              }
            >
              {TIPOS_MEDIBLES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {etiquetaTipo(tipo)}
                </option>
              ))}
            </select>
            <p className="field-help">
              Son los dos que el portal puede medir con lo que ya registras.
            </p>
          </div>

          <div>
            <label htmlFor="meta-periodo" className="label">
              ¿En cuánto tiempo?
            </label>
            <select
              id="meta-periodo"
              className="select"
              value={formulario.periodo}
              onChange={(e) =>
                setFormulario({ ...formulario, periodo: e.target.value as MetaPeriodo })
              }
            >
              {PERIODOS_META.map((periodo) => (
                <option key={periodo} value={periodo}>
                  {etiquetaPeriodo(periodo)}
                </option>
              ))}
            </select>
            <p className="field-help">
              La meta de <strong>hoy</strong> es la que se pinta en tu pantalla de inicio.
            </p>
          </div>

          <div>
            <label htmlFor="meta-objetivo" className="label">
              {esMoneda ? '¿Cuánto quieres ganar?' : '¿Cuántos servicios quieres hacer?'}
            </label>
            <input
              id="meta-objetivo"
              type="number"
              // `step="any"` a propósito: con un `step` fijo, un objetivo como
              // 45550 dispara `stepMismatch` y el navegador **bloquea el envío en
              // silencio** (ni error, ni nada).
              step="any"
              min="1"
              inputMode={esMoneda ? 'decimal' : 'numeric'}
              className="input tabular"
              value={formulario.objetivo}
              onChange={(e) => setFormulario({ ...formulario, objetivo: e.target.value })}
              aria-invalid={errorObjetivo !== null}
              aria-describedby="meta-objetivo-ayuda"
            />
            {errorObjetivo && (
              <p className="field-error" role="alert">
                {errorObjetivo}
              </p>
            )}
            <p id="meta-objetivo-ayuda" className="field-help">
              {esMoneda
                ? objetivoNum === null
                  ? 'En pesos, sin puntos ni comas. Por ejemplo: 400000'
                  : `Se guardará como ${formatMoney(objetivoNum)} (el peso no usa centavos).`
                : objetivoNum === null
                  ? 'Un número de servicios. Por ejemplo: 5'
                  : `Se guardará como ${objetivoNum} servicio${objetivoNum === 1 ? '' : 's'}.`}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="meta-desde" className="label">
                Desde
              </label>
              <input
                id="meta-desde"
                type="date"
                className="input tabular"
                value={formulario.vigenteDesde}
                max={formulario.vigenteHasta || undefined}
                onChange={(e) => setFormulario({ ...formulario, vigenteDesde: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="meta-hasta" className="label">
                Hasta <span className="font-normal text-text-muted">(opcional)</span>
              </label>
              <input
                id="meta-hasta"
                type="date"
                className="input tabular"
                value={formulario.vigenteHasta}
                min={formulario.vigenteDesde || undefined}
                onChange={(e) => setFormulario({ ...formulario, vigenteHasta: e.target.value })}
              />
            </div>
          </div>
          {errorFechas && (
            <p className="field-error" role="alert">
              {errorFechas}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary min-h-12 flex-1"
              onClick={cerrarFormulario}
              disabled={ocupada}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary min-h-12 flex-1" disabled={ocupada}>
              {ocupada ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : null}
              {editando ? 'Guardar cambios' : 'Crear meta'}
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Cargando tus metas…</span>
          <div className="skeleton h-40 w-full" />
          <div className="skeleton h-40 w-full" />
        </div>
      ) : sinFicha ? (
        <div className="panel p-5 text-center">
          <Target size={20} className="mx-auto text-text-muted" aria-hidden="true" />
          <p className="mt-2 text-body font-semibold text-text-primary">
            Tu usuario aún no está vinculado a una ficha de colaborador
          </p>
          <p className="mt-1 text-body-sm text-text-secondary">
            Sin ese vínculo no se puede guardar una meta personal: una meta «personal» sin dueño no
            es de nadie, y la base lo rechaza. Avisa a administración; se arregla en tu ficha.
          </p>
        </div>
      ) : metas.isError ? null : (
        <>
          <section className="space-y-3" aria-label="Mis metas">
            <h2 className="text-h2 text-text-primary">Mis metas</h2>

            {mias.length === 0 ? (
              <div className="panel p-5 text-center">
                <Sparkles size={20} className="mx-auto text-text-muted" aria-hidden="true" />
                <p className="mt-2 text-body font-semibold text-text-primary">
                  Todavía no tienes metas
                </p>
                <p className="mt-1 text-body-sm text-text-secondary">
                  Elige qué quieres medir y en cuánto tiempo. Aparecerá en tu pantalla de inicio con
                  una barra de avance, para que veas cómo va el día sin tener que sumar nada.
                </p>
                {puedeEscribir && !formulario && (
                  <button
                    type="button"
                    className="btn-primary mt-4 min-h-12 w-full"
                    onClick={abrirCrear}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Crear mi primera meta
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-3">
                {mias.map((meta) => (
                  <li key={meta.id}>
                    <MetaCard
                      meta={meta}
                      editable={puedeEscribir && meta.origen === 'personal'}
                      notaSoloLectura={
                        meta.origen === 'administracion'
                          ? 'La fija administración, así que aquí se ve en sólo lectura. Si algo no cuadra, habla con ellos.'
                          : 'Esta meta se ve en sólo lectura.'
                      }
                      ocupada={ocupada}
                      onEditar={abrirEditar}
                      onAlternarActiva={alternarActiva}
                      onBorrar={setABorrar}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {delNegocio.length > 0 && (
            <section className="space-y-3" aria-label="Metas del negocio">
              <h2 className="text-h2 text-text-primary">Del negocio</h2>
              <p className="text-body-sm text-text-secondary">
                Las que se propuso el spa. No son tuyas: se ven para que sepas hacia dónde va el
                equipo.
              </p>
              <ul className="space-y-3">
                {delNegocio.map((meta) => (
                  <li key={meta.id}>
                    <MetaCard
                      meta={meta}
                      editable={false}
                      notaSoloLectura="Meta del negocio: se ve, no se toca."
                      ocupada={false}
                      onEditar={abrirEditar}
                      onAlternarActiva={alternarActiva}
                      onBorrar={setABorrar}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Confirmación de borrado */}
      {aBorrar && (
        <>
          <div className="drawer-backdrop" onClick={() => setABorrar(null)} aria-hidden="true" />
          <div
            className="sheet-panel p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Borrar la meta"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-h2 text-text-primary">¿Borrar esta meta?</h2>
                <p className="mt-1 text-body-sm text-text-secondary">
                  Se borra <strong>{etiquetaTipo(aBorrar.tipo)}</strong> de{' '}
                  {etiquetaPeriodo(aBorrar.periodo).toLowerCase()} y desaparece de tu inicio. No se
                  puede deshacer. Si sólo quieres parar de momento, usa «Pausar».
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setABorrar(null)}
                aria-label="Cancelar el borrado"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-secondary min-h-12 flex-1"
                onClick={() => setABorrar(null)}
                disabled={borrar.isPending}
              >
                Conservarla
              </button>
              <button
                type="button"
                className="btn-danger min-h-12 flex-1"
                onClick={confirmarBorrado}
                disabled={borrar.isPending}
              >
                {borrar.isPending ? (
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                ) : null}
                Borrar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
