/**
 * Lo que una venta descontó de verdad.
 *
 * Sin stock y sin saldo negativo permitido, la SALIDA dice "salieron 3" pero el
 * stock se recorta a 0: lo que faltó nunca se descontó y solo queda anotado en
 * el movimiento. Quien devuelve stock (anulación, nota de crédito, edición) debe
 * leer esa nota: si devolviera la cantidad vendida, inventaría unidades. Vender
 * 2 con stock 0 y anular dejaba el stock en 2.
 */
export const avisoNoDescontado = (faltante: number): string =>
  `No se descontaron ${faltante} unidad(es): no había stock suficiente y la empresa no permite saldo negativo.`;

export const cantidadNoDescontada = (observacion?: string | null): number => {
  const nota = /No se descontaron ([\d.]+) unidad/.exec(observacion ?? '');
  return nota ? Number(nota[1]) : 0;
};

interface MovimientoDeStock {
  productoId: number;
  tipoMovimiento: string;
  cantidad: unknown;
  observacion?: string | null;
}

/**
 * Cuánto se puede devolver por producto: lo descontado por las salidas de la
 * venta, menos lo ya devuelto. En `devoluciones` un INGRESO resta y una SALIDA
 * suma, porque es la devolución de una nota de crédito descartada que se deshizo.
 */
export const saldoPorDevolver = (
  salidas: MovimientoDeStock[],
  devoluciones: MovimientoDeStock[],
): Map<number, number> => {
  const saldo = new Map<number, number>();
  const sumar = (productoId: number, cantidad: number) =>
    saldo.set(productoId, (saldo.get(productoId) ?? 0) + cantidad);
  for (const m of salidas) {
    sumar(m.productoId, Number(m.cantidad) - cantidadNoDescontada(m.observacion));
  }
  for (const m of devoluciones) {
    sumar(m.productoId, m.tipoMovimiento === 'INGRESO' ? -Number(m.cantidad) : Number(m.cantidad));
  }
  return saldo;
};
