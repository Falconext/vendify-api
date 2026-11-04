/**
 * El stock de una variante en una sede.
 *
 * `Producto.stock` de una variante es la SUMA de todas sus sedes. El listado
 * ya lo resolvía por sede, pero la ficha del producto (GET /productos/:id) y
 * el escaneo del POS devolvían esa suma: el modal de edición mostraba el
 * total como si fuera el de la sede, y al guardar lo escribía en una sola
 * sede, inflándola (reporte 02-11: "me trae el stock de sede principal").
 */
export interface VarianteConStocks {
  stock?: unknown;
  stocks?: { sedeId: number; stock: unknown }[] | null;
}

/** Con sede, lo de esa sede (0 si no tiene fila); sin sede, la suma de sus sedes. */
export function stockVarianteEnSede(
  v: VarianteConStocks,
  sedeId?: number | null,
): number {
  const filas = Array.isArray(v.stocks) ? v.stocks : null;
  if (!filas) return Number(v.stock ?? 0) || 0;
  if (sedeId)
    return Number(filas.find((f) => f.sedeId === sedeId)?.stock ?? 0) || 0;
  if (!filas.length) return Number(v.stock ?? 0) || 0;
  return filas.reduce((s, f) => s + (Number(f.stock) || 0), 0);
}

/** La variante con su stock de la sede, sin las filas por sede. */
export function conStockDeSede<T extends VarianteConStocks>(
  v: T,
  sedeId?: number | null,
) {
  const { stocks: _filas, ...resto } = v;
  return { ...resto, stock: stockVarianteEnSede(v, sedeId) };
}
