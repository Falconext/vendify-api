/**
 * Corregir el método de pago de una nota ya cobrada (pedido MEDICA DEL SUR
 * 2026-11-04: NV01-169 se registró con el método equivocado).
 *
 * Es una corrección, no un cobro: no entra plata nueva, así que el monto y la
 * fecha de cada pago no cambian. Editar la nota no sirve para esto: con saldo 0
 * no ofrece métodos, y fecharPagosEdicion le pondría fecha de hoy a lo que
 * cambie de medio, sacando el cobro del turno en que entró.
 */

export const MEDIOS_CORREGIBLES = ['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA'];
export const MEDIOS_CON_CUENTA = ['YAPE', 'PLIN', 'TRANSFERENCIA'];

export const normalizarMedio = (m?: string | null) =>
  String(m ?? '')
    .trim()
    .toUpperCase();

const r2 = (n: number) => Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
const num = (v: unknown) => Number(v) || 0;

/**
 * Sin N° de operación, el pago guarda el propio documento como referencia
 * ("NV01-169" o "NV-NV01-169"). Eso no debe salir como Op/Voucher en el ticket.
 */
export function referenciaReal(
  referencia: string | null | undefined,
  comp: { tipoDoc?: string | null; serie: string; correlativo: number },
): string {
  const ref = String(referencia ?? '').trim();
  const doc = `${comp.serie}-${comp.correlativo}`;
  return ref === doc || ref === `${comp.tipoDoc}-${doc}` ? '' : ref;
}

/** Misma etiqueta que imprime el POS: el alias, o banco + últimos 4 dígitos. */
export function etiquetaCuenta(
  cuenta?: { alias?: string | null; banco?: string | null; numeroCuenta?: string | null } | null,
): string {
  if (!cuenta) return '';
  if (cuenta.alias?.trim()) return cuenta.alias.trim();
  const fin = String(cuenta.numeroCuenta ?? '').replace(/\D/g, '').slice(-4);
  return `${cuenta.banco || ''}${fin ? ` ····${fin}` : ''}`.trim();
}

export interface TurnoCerrable {
  desde: Date | string;
  hasta: Date | string;
}

/** El turno ya cerrado en el que entró un cobro, si lo hay. */
export function turnoQueContiene<T extends TurnoCerrable>(fecha: Date | string, turnos: T[]): T | null {
  const t = new Date(fecha).getTime();
  return (
    turnos.find((c) => new Date(c.desde).getTime() <= t && t <= new Date(c.hasta).getTime()) ?? null
  );
}

export interface LineaCorregida {
  monto: number;
  medioPago: string;
  cuentaBancariaId: number | null;
  cuentaBancariaLabel: string;
  referencia: string | null;
}

/**
 * Cómo queda el comprobante con los pagos corregidos. `paymentDetails` importa
 * tanto como las filas de Pago: de ahí salen el ticket, los reportes y lo ya
 * cobrado cuando se vuelve a editar la nota.
 */
export function comprobanteCorregido(
  comp: { medioPago?: string | null; formaPagoTipo?: string | null; paymentDetails?: any; vuelto?: number | null },
  lineas: LineaCorregida[],
): { medioPago: string; paymentDetails: Record<string, any>; vuelto: number } {
  let pd = comp.paymentDetails;
  if (typeof pd === 'string') {
    try {
      pd = JSON.parse(pd);
    } catch {
      pd = null;
    }
  }
  pd = pd && typeof pd === 'object' ? pd : {};

  const juntas: LineaCorregida[] = [];
  for (const l of lineas) {
    const igual = juntas.find(
      (j) => j.medioPago === l.medioPago && j.cuentaBancariaId === l.cuentaBancariaId,
    );
    if (igual) {
      igual.monto = r2(igual.monto + num(l.monto));
      if (!igual.referencia) igual.referencia = l.referencia;
    } else {
      juntas.push({ ...l, monto: r2(num(l.monto)) });
    }
  }

  // El vuelto solo existe si hubo efectivo: un Yape no da vuelto.
  const hayEfectivo = juntas.some((l) => l.medioPago === 'EFECTIVO');
  const meta: Record<string, any> = {};
  if (pd.pagoAnterior != null) meta.pagoAnterior = pd.pagoAnterior;
  if (pd.devolucion != null) meta.devolucion = pd.devolucion;
  if (hayEfectivo && pd.recibido != null) meta.recibido = pd.recibido;

  const aDetalle = (l: LineaCorregida) => ({
    method: l.medioPago,
    amount: l.monto,
    cuentaBancariaId: l.cuentaBancariaId,
    ...(l.cuentaBancariaLabel ? { cuentaBancariaLabel: l.cuentaBancariaLabel } : {}),
    ...(l.referencia ? { referencia: l.referencia } : {}),
    ...(l.medioPago === 'TARJETA' && pd.tarjetaMarca ? { tarjetaMarca: pd.tarjetaMarca } : {}),
    ...(l.medioPago === 'TARJETA' && pd.tarjetaTipo ? { tarjetaTipo: pd.tarjetaTipo } : {}),
    ...(l.medioPago === 'TARJETA' && pd.tarjetaUltimos4 ? { tarjetaUltimos4: pd.tarjetaUltimos4 } : {}),
  });

  const esCredito =
    normalizarMedio(comp.formaPagoTipo) === 'CREDITO' || normalizarMedio(comp.medioPago) === 'CREDITO';
  const medio = juntas.length === 1 ? juntas[0].medioPago : 'MIXTO';
  return {
    // Una venta a crédito sigue siendo crédito: cambia solo cómo se pagó lo cobrado.
    medioPago: esCredito ? String(comp.medioPago ?? medio) : medio,
    paymentDetails:
      juntas.length === 1
        ? { mode: 'SIMPLE', ...aDetalle(juntas[0]), ...meta }
        : { mode: 'MIXTO', splitPayments: juntas.map(aDetalle), ...meta },
    vuelto: hayEfectivo ? r2(num(comp.vuelto)) : 0,
  };
}
