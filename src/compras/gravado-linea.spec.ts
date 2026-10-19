import { ComprasService } from './compras.service';

/**
 * IGV por línea en compras. `gravado: false` en la línea manda sobre la
 * afectación del producto: lo manda la recepción de una orden emitida SIN IGV
 * y el editor de compras al reabrir una compra que se guardó sin IGV. Sin eso,
 * editarla le volvía a sumar el 18% (OWENSOFT: S/300 pactados → S/354).
 */
describe('Compras: IGV por línea', () => {
  const svc: any = Object.create(ComprasService.prototype);
  const gravadoPorProducto = new Map<number, boolean>([
    [1, true], // producto gravado
    [2, false], // producto exonerado
  ]);

  it('sin `gravado` manda la afectación del producto', () => {
    expect(svc.gravadoDeLinea({ productoId: 1 }, gravadoPorProducto)).toBe(true);
    expect(svc.gravadoDeLinea({ productoId: 2 }, gravadoPorProducto)).toBe(false);
    expect(svc.gravadoDeLinea({ productoId: 99 }, gravadoPorProducto)).toBe(true);
  });

  it('`gravado: false` en un producto gravado no suma IGV', () => {
    const g = svc.gravadoDeLinea({ productoId: 1, gravado: false }, gravadoPorProducto);
    expect(g).toBe(false);
    const { totalLinea, igvItem } = svc.montosLinea(
      { precioUnitario: 100, cantidad: 3 },
      g,
    );
    expect(igvItem).toBe(0);
    expect(totalLinea).toBe(300);
  });

  it('la misma línea gravada sí suma el 18%', () => {
    const { totalLinea } = svc.montosLinea({ precioUnitario: 100, cantidad: 3 }, true);
    expect(totalLinea).toBeCloseTo(354, 2);
  });
});
