// src/services/parametros.service.ts
import { api, type ApiSuccess } from './api';
import { configurarFormato, type CodigoMoneda, type ConfigFormato } from '../lib/format';

/**
 * Configuración de formato del negocio, tal como la devuelve
 * `GET /parametros/formato`.
 *
 * Los valores llegan **ya tipados** (`decimales` es número, `centavos` booleano),
 * así que no hay que interpretar cadenas.
 */
export interface FormatoApi {
  moneda: {
    codigo: string;
    simbolo: string;
    locale: string;
    decimales: number;
    /** `true` si los importes se guardan en centavos. */
    centavos: boolean;
  };
  negocio: {
    nombre: string;
    zonaHoraria: string;
    /** Horario en `HH:MM`. Define el ritmo del día en las metas. */
    horaApertura: string;
    horaCierre: string;
  };
  propina: {
    habilitada: boolean;
    /** `negocio` | `colaborador` | `repartir`. */
    destino: string;
    porcentajeColaborador: number;
  };
  descuento: {
    /** % máximo descontable sin aprobación. `0` = todo descuento requiere admin. */
    umbralSinAprobacion: number;
    /** % desde el que se avisa al administrador. */
    umbralAlerta: number;
  };
  /**
   * Metas del negocio. **`0` = sin meta definida**: la UI **no** debe pintar una
   * barra de progreso contra cero — daría un `100 %` falso que haría creer que se
   * cumplió un objetivo que nadie fijó.
   */
  metas: {
    ingresosMes: number;
    ingresosDia: number;
    /** Servicios **cobrados** al día (volumen, no dinero). */
    serviciosDia: number;
    ticketPromedio: number;
    /** Días laborables del mes: sirve para deducir la meta diaria necesaria. */
    diasLaborablesMes: number;
  };
}

/** Fila cruda de `GET /parametros` (sólo administración). */
export interface Parametro {
  clave: string;
  valor: string;
  tipo: string;
  descripcion: string | null;
  updated_at: string;
}

export const ParametrosService = {
  /** Configuración que necesita la UI. Disponible para cualquier rol. */
  obtenerFormato: async (): Promise<FormatoApi> => {
    const res = await api.get<unknown, ApiSuccess<FormatoApi>>('/parametros/formato');
    return res.data;
  },

  /** Todos los parámetros en crudo. Sólo administración. */
  listar: async (): Promise<Parametro[]> => {
    const res = await api.get<unknown, ApiSuccess<Parametro[]>>('/parametros');
    return res.data ?? [];
  },

  /**
   * Cambia un parámetro.
   *
   * El valor va **como texto** y es el servidor quien lo valida contra el tipo
   * declarado en la base, así que un error de tipo vuelve como `422` con el
   * motivo, no como un fallo silencioso.
   */
  actualizar: async (clave: string, valor: string): Promise<Parametro> => {
    const res = await api.patch<unknown, ApiSuccess<Parametro>>(
      `/parametros/${encodeURIComponent(clave)}`,
      { valor },
    );
    return res.data;
  },

  /**
   * Actualiza varios parámetros **de forma atómica**.
   *
   * Una sola petición → una sola transacción en el servidor: o se aplican todos
   * o ninguno. Es lo que se usa para la moneda, que son cinco claves.
   */
  actualizarVarios: async (
    parametros: { clave: string; valor: string }[],
  ): Promise<{ clave: string; valor: string }[]> => {
    const res = await api.patch<unknown, ApiSuccess<{ clave: string; valor: string }[]>>(
      '/parametros',
      { parametros },
    );
    return res.data ?? [];
  },
};

/** Claves de moneda que forman el bloque completo. */
export const CLAVES_MONEDA = [
  'moneda',
  'moneda.simbolo',
  'moneda.locale',
  'moneda.decimales',
  'moneda.centavos',
] as const;

/**
 * Aplica la configuración al formateo global.
 *
 * A partir de esta llamada, **todo** `formatMoney()` de la app usa la moneda del
 * negocio. Se llama al arrancar la sesión.
 */
export function aplicarFormato(f: FormatoApi): void {
  const cfg: Partial<ConfigFormato> = {
    moneda: {
      codigo: f.moneda.codigo,
      simbolo: f.moneda.simbolo,
      locale: f.moneda.locale,
      decimales: f.moneda.decimales,
      centavos: f.moneda.centavos,
    },
    zonaHoraria: f.negocio?.zonaHoraria,
  };
  configurarFormato(cfg);
}

/**
 * Escribe el bloque completo de moneda **en una sola operación atómica**.
 *
 * Se mandan **las 5 claves juntas**: cambiar sólo `moneda` de `COP` a `EUR`
 * dejaría el símbolo en `$` y los decimales en `0`, o sea un euro que se ve como
 * un peso.
 *
 * ⚠️ Antes esto eran **5 `PATCH` secuenciales**. Cinco peticiones no son una
 * transacción: si la tercera fallaba, la base quedaba con `moneda = 'EUR'`,
 * símbolo `$` y cero decimales, a medias y sin forma de detectarlo desde la UI.
 * Ahora es un único `PATCH /parametros` con las cinco, que el servidor aplica
 * dentro de una transacción.
 */
export async function guardarMoneda(m: {
  codigo: CodigoMoneda | string;
  simbolo: string;
  locale: string;
  decimales: number;
  centavos: boolean;
}): Promise<void> {
  await ParametrosService.actualizarVarios([
    { clave: 'moneda', valor: String(m.codigo) },
    { clave: 'moneda.simbolo', valor: m.simbolo },
    { clave: 'moneda.locale', valor: m.locale },
    { clave: 'moneda.decimales', valor: String(m.decimales) },
    { clave: 'moneda.centavos', valor: String(m.centavos) },
  ]);
}
