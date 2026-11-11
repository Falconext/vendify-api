/**
 * Depositar el efectivo de caja repartido entre varias cuentas.
 *
 * Pedido de IRBA (10-11): la venta del día mezcla cobros con factura/boleta y
 * cobros con nota de venta, y cada parte va a una cuenta distinta. Hasta acá un
 * cierre se depositaba entero a una sola cuenta.
 *
 * Sin Prisma, para poder probarlo entero.
 */

export const MAX_CUENTAS_REPARTO = 5;
/** Tolerancia de redondeo al comparar el reparto con el efectivo. */
const TOLERANCIA = 0.009;

export interface ParteReparto {
  cuentaBancariaId: number;
  monto: number;
  numeroOperacion?: string | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Valida el reparto contra el efectivo a depositar. Devuelve el mensaje de
 * error para el usuario, o null si está bien.
 */
export function validarReparto(
  partes: ParteReparto[],
  totalEfectivo: number,
): string | null {
  if (partes.length < 2) return 'Un reparto necesita al menos dos cuentas.';
  if (partes.length > MAX_CUENTAS_REPARTO)
    return `Puedes repartir en hasta ${MAX_CUENTAS_REPARTO} cuentas.`;

  const ids = new Set(partes.map((p) => p.cuentaBancariaId));
  if (ids.size !== partes.length)
    return 'Elegiste la misma cuenta dos veces: junta esos montos en una sola fila.';

  if (partes.some((p) => !(Number(p.monto) > 0)))
    return 'Cada cuenta tiene que llevar un monto mayor a cero.';

  const suma = redondear(partes.reduce((s, p) => s + Number(p.monto), 0));
  const total = redondear(totalEfectivo);
  if (Math.abs(suma - total) > TOLERANCIA) {
    const dif = redondear(total - suma);
    return dif > 0
      ? `El reparto suma S/ ${suma.toFixed(2)}: faltan S/ ${dif.toFixed(2)} para llegar a los S/ ${total.toFixed(2)} del efectivo.`
      : `El reparto suma S/ ${suma.toFixed(2)}: se pasa por S/ ${(-dif).toFixed(2)} de los S/ ${total.toFixed(2)} del efectivo.`;
  }
  return null;
}

/** Normaliza el texto de medio de pago como lo hace el arqueo del turno. */
export function esEfectivo(medioPago?: string | null): boolean {
  const m = (medioPago || 'EFECTIVO').toString().toUpperCase().trim();
  return !['YAPE', 'PLIN', 'TRANSFERENCIA', 'TRANSFER', 'TARJETA', 'CARD'].includes(m);
}

/**
 * Cuánto del efectivo depositado corresponde a lo cobrado con factura/boleta.
 * Se topa en el efectivo declarado: lo que la persona contó en el cajón es lo
 * que se lleva al banco, y una sugerencia mayor no se podría depositar.
 */
export function sugerenciaConComprobante(
  efectivoConComprobante: number,
  totalEfectivo: number,
): number {
  return redondear(Math.min(Math.max(efectivoConComprobante, 0), totalEfectivo));
}
