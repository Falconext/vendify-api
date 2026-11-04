/**
 * Entregas parciales de una orden de compra (pedido 2026-11-03).
 *
 * El proveedor extranjero factura todo de una vez pero despacha por partes.
 * La factura (deuda/pago) se registra una sola vez, en la primera recepción;
 * cada llegada solo suma stock por lo que de verdad llegó. La orden queda
 * PARCIAL hasta que todas sus líneas alcanzan lo pedido.
 *
 * Vive aparte del servicio para poder probarse sin Prisma.
 */

export interface LineaPorRecibir {
  id: number;
  descripcion?: string | null;
  cantidad: unknown;
  cantidadRecibida?: unknown;
}

export interface LlegadaDeLinea {
  detalleId: number;
  cantidad: unknown;
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r4 = (x: number) => Math.round(x * 10000) / 10000;

export const pendienteDe = (l: LineaPorRecibir) =>
  Math.max(0, r4(n(l.cantidad) - n(l.cantidadRecibida)));

/**
 * Valida lo que llega en esta entrega y devuelve cuánto entra por línea (en el
 * orden de `lineas`, 0 si esa línea no trae nada) y si con esto la orden queda
 * completa. Lanza Error con un mensaje para el usuario si algo no cuadra.
 *
 * `llegan` vacío o sin enviar = llegó todo lo pendiente.
 */
export function repartirEntrega(
  lineas: LineaPorRecibir[],
  llegan?: LlegadaDeLinea[] | null,
): { cantidades: number[]; completa: boolean } {
  const pendientes = lineas.map(pendienteDe);
  if (!llegan || llegan.length === 0) {
    return { cantidades: pendientes, completa: true };
  }
  const porId = new Map<number, number>();
  for (const l of llegan) {
    const id = Number(l.detalleId);
    if (!lineas.some((x) => x.id === id)) {
      throw new Error('Una de las líneas no pertenece a esta orden.');
    }
    const c = n(l.cantidad);
    if (c < 0) throw new Error('Las cantidades que llegan no pueden ser negativas.');
    porId.set(id, r4((porId.get(id) ?? 0) + c));
  }
  const cantidades = lineas.map((l, i) => {
    const c = porId.get(l.id) ?? 0;
    if (c > pendientes[i] + 1e-9) {
      throw new Error(
        `De "${l.descripcion ?? 'un producto'}" faltan ${pendientes[i]}: no pueden llegar ${c}.`,
      );
    }
    return c;
  });
  if (cantidades.every((c) => c <= 0)) {
    throw new Error('Indica cuánto llegó de al menos un producto.');
  }
  const completa = cantidades.every((c, i) => c >= pendientes[i] - 1e-9);
  return { cantidades, completa };
}
