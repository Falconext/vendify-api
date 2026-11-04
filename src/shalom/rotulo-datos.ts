/**
 * Productos del rótulo: "el detalle del producto nos ayuda
 * a la hora de alistar los pedidos". Una línea por producto con su cantidad;
 * los repetidos se juntan y las cantidades sin decimales de más.
 */
export function lineasDelRotulo(
  detalles: { descripcion?: string | null; cantidad?: unknown }[],
): { descripcion: string; cantidad: number }[] {
  const porNombre = new Map<string, { descripcion: string; cantidad: number }>();
  for (const d of detalles) {
    const descripcion = String(d.descripcion ?? '').replace(/\s+/g, ' ').trim();
    const cantidad = Number(d.cantidad) || 0;
    if (!descripcion || cantidad <= 0) continue;
    const clave = descripcion.toUpperCase();
    const actual = porNombre.get(clave);
    if (actual) actual.cantidad += cantidad;
    else porNombre.set(clave, { descripcion, cantidad });
  }
  return [...porNombre.values()].map((l) => ({
    ...l,
    cantidad: Math.round(l.cantidad * 1000) / 1000,
  }));
}
