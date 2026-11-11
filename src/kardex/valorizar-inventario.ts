import { CriterioIgvVentas } from '../finanzas/igv-ventas';

/**
 * Cuánto vale el stock a costo, cuánto valdría vendido y cuánto se ganaría.
 *
 * El costo se guarda NETO (es el unitario de la compra) y el precio de venta
 * CON IGV. El valor a costo que ve el empresario es "de bolsillo": a un
 * producto gravado se le suma el 18 % que pagó al proveedor, el mismo criterio
 * que ya usan la pantalla de Productos y el Dashboard de Inventario.
 *
 * La ganancia sigue el criterio de IGV de la empresa (Perfil → Análisis
 * financiero), igual que Rentabilidad:
 *  - TODOS: ganancia sin IGV (precio sin IGV − costo neto). El IGV de la venta
 *    es de SUNAT, no del negocio.
 *  - ELECTRONICOS / NINGUNO: ganancia con IGV (precio − costo de bolsillo). La
 *    mayor parte se vende con notas de venta o el IGV no se descuenta.
 *
 * Un producto sin costo o sin precio no entra en la ganancia: inflaría el
 * margen con una venta que no costó nada, o lo hundiría con una que no cobra.
 */

export type BaseGanancia = 'SIN_IGV' | 'CON_IGV';

export const baseDeGanancia = (criterio: CriterioIgvVentas): BaseGanancia =>
  criterio === 'TODOS' ? 'SIN_IGV' : 'CON_IGV';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PartidaInventario {
  stock: number;
  /** Unitario neto, como se guarda. */
  costoNeto: number;
  /** Unitario de lista, con IGV. */
  precioVenta: number;
  gravado: boolean;
}

export interface PartidaValorizada {
  costoDeBolsillo: number;
  valorCosto: number;
  valorVenta: number;
  gananciaPotencial: number;
  /** Lo que valdría vendido, en la misma base que la ganancia. */
  ventaBaseGanancia: number;
  sinCosto: boolean;
  sinPrecio: boolean;
}

export function valorizarPartida(
  p: PartidaInventario,
  base: BaseGanancia,
): PartidaValorizada {
  const costoNeto = Number(p.costoNeto) || 0;
  const precio = Number(p.precioVenta) || 0;
  const stock = Number(p.stock) || 0;
  // Mismo redondeo que el Dashboard y la pantalla de Productos (toFixed), para
  // que el valor a costo no se mueva ni un céntimo respecto de ellos.
  const costoDeBolsillo = p.gravado
    ? Number((costoNeto * 1.18).toFixed(2))
    : costoNeto;
  const sinCosto = costoNeto <= 0;
  const sinPrecio = precio <= 0;

  // Solo se gana sobre lo que hay para vender.
  const cuenta = stock > 0 && !sinCosto && !sinPrecio;
  const precioBase =
    base === 'SIN_IGV' && p.gravado ? precio / 1.18 : precio;
  const costoBase = base === 'SIN_IGV' ? costoNeto : costoDeBolsillo;

  return {
    costoDeBolsillo,
    valorCosto: stock * costoDeBolsillo,
    valorVenta: stock * precio,
    gananciaPotencial: cuenta ? stock * (precioBase - costoBase) : 0,
    ventaBaseGanancia: cuenta ? stock * precioBase : 0,
    sinCosto,
    sinPrecio,
  };
}

export const margen = (ganancia: number, venta: number): number =>
  venta > 0 ? r2((ganancia / venta) * 100) : 0;
