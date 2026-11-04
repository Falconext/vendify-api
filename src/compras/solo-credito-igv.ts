import { BadRequestException } from '@nestjs/common';

/**
 * Compras registradas solo por su crédito de IGV (KREZKA, 02-11).
 *
 * El socio las registra "para el tema de IGV": son facturas que la empresa no
 * pagó. Entraban como gasto (compras de consumo) y bajaban la ganancia y la
 * caja: el mes mostraba S/ 2,402 de gastos cuando los operativos eran 1,578.
 * Marcadas así, siguen en el registro de compras y en el crédito fiscal, pero
 * no restan en ningún lado donde se mira dinero.
 */

/** Para el `where` de Compra en cualquier suma de dinero. */
export const COMPRA_CON_DINERO = { soloCreditoIgv: false } as const;

/** Para el `where` de PagoCompra: solo pagos de compras que pagó la empresa. */
export const PAGO_DE_COMPRA_CON_DINERO = { compra: COMPRA_CON_DINERO } as const;

/**
 * El valor a guardar. Una compra con productos del catálogo entró al
 * inventario: la empresa la tiene, así que no puede ser "solo IGV".
 */
export function resolverSoloCreditoIgv(
  pedido: boolean | undefined,
  detalles: { productoId?: number | null }[],
): boolean | undefined {
  if (pedido !== true) return pedido;
  if (detalles.some((d) => d.productoId)) {
    throw new BadRequestException(
      'Una compra con productos del catálogo entra al inventario: no puede ser solo para crédito de IGV.',
    );
  }
  return true;
}
