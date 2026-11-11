/**
 * Cuándo vence lo que falta cobrar de un comprobante.
 *
 * Cuentas por cobrar contaba los días desde la EMISIÓN y marcaba "vencido" a
 * los 30: una factura a 60 o 90 días salía vencida el día 31 sin que le tocara
 * pagar todavía, y no había forma de ver lo que está por vencer (empresa de
 * servicios que factura a crédito 30–90 días, 10-11).
 *
 * Ahora se mira la fecha real:
 *  - Con cuotas: la de la primera cuota que el saldo todavía no cubre. Lo
 *    abonado se aplica a las cuotas en orden de vencimiento.
 *  - Sin cuotas pero con `fechaVencimientoCredito`: esa.
 *  - Al contado (sin fecha de crédito): emisión + 30 días, que es lo que ya
 *    mostraba la pantalla para estos.
 */

export type SituacionCobro = 'VENCIDO' | 'POR_VENCER' | 'AL_DIA';

export interface VencimientoCobro {
  /** YYYY-MM-DD */
  fecha: string;
  /** Días que faltan; negativo = días de atraso. */
  dias: number;
  situacion: SituacionCobro;
  origen: 'CUOTA' | 'CREDITO' | 'SIN_CREDITO';
  /** Número de la cuota que vence (1 = primera), si va por cuotas. */
  cuota?: number;
  totalCuotas?: number;
}

/** Ventana de "por vencer": hoy y los próximos 7 días. */
export const DIAS_POR_VENCER = 7;
const PLAZO_SIN_CREDITO = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Fecha calendario en Lima de un instante. */
export function fechaLima(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

/** Fecha guardada como "solo día" (cuota o vencimiento de crédito). */
function soloDia(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))
    return v.slice(0, 10);
  const d = new Date(v as any);
  // Se guardan a medianoche UTC: el día es el de UTC, no el de Lima (que
  // caería en la víspera).
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const [a, b] = [desde, hasta].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / DIA_MS);
}

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DIA_MS)
    .toISOString()
    .slice(0, 10);
}

export function vencimientoCobro(
  c: {
    fechaEmision: Date | string;
    fechaVencimientoCredito?: Date | string | null;
    cuotas?: unknown;
    saldo?: number | string | null;
  },
  hoy: string = fechaLima(new Date()),
): VencimientoCobro {
  const cuotas = (Array.isArray(c.cuotas) ? c.cuotas : [])
    .map((q: any) => ({
      monto: Number(q?.monto ?? 0),
      fecha: soloDia(q?.fechaVencimiento),
    }))
    .filter(
      (q): q is { monto: number; fecha: string } => !!q.fecha && q.monto > 0,
    )
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  let fecha: string;
  let origen: VencimientoCobro['origen'];
  let cuota: number | undefined;

  if (cuotas.length) {
    // Lo cobrado contra las cuotas: el saldo pendiente es lo último que se
    // debe, así que lo pagado cubre las cuotas desde la primera.
    const totalCuotas = cuotas.reduce((s, q) => s + q.monto, 0);
    const saldo = Number(c.saldo ?? totalCuotas);
    let pagado = Math.max(0, totalCuotas - saldo);
    let i = 0;
    while (i < cuotas.length - 1 && pagado >= cuotas[i].monto - 0.005) {
      pagado -= cuotas[i].monto;
      i++;
    }
    fecha = cuotas[i].fecha;
    origen = 'CUOTA';
    cuota = i + 1;
  } else if (soloDia(c.fechaVencimientoCredito)) {
    fecha = soloDia(c.fechaVencimientoCredito)!;
    origen = 'CREDITO';
  } else {
    fecha = sumarDias(fechaLima(c.fechaEmision), PLAZO_SIN_CREDITO);
    origen = 'SIN_CREDITO';
  }

  const dias = diasEntre(hoy, fecha);
  return {
    fecha,
    dias,
    situacion:
      dias < 0 ? 'VENCIDO' : dias <= DIAS_POR_VENCER ? 'POR_VENCER' : 'AL_DIA',
    origen,
    ...(cuota ? { cuota, totalCuotas: cuotas.length } : {}),
  };
}
