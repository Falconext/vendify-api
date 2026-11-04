/**
 * KREZKA (02-11): facturas registradas "para el tema de IGV" entraban como
 * gasto y bajaban la ganancia y la caja (S/ 2,402 de gastos contra 1,578 reales).
 */
import { BadRequestException } from '@nestjs/common';
import {
  COMPRA_CON_DINERO,
  PAGO_DE_COMPRA_CON_DINERO,
  resolverSoloCreditoIgv,
} from './solo-credito-igv';

describe('compras solo para crédito de IGV', () => {
  it('se marca en una compra sin productos del catálogo', () => {
    expect(resolverSoloCreditoIgv(true, [{ productoId: null }, {}])).toBe(true);
  });

  it('una compra con productos entró al inventario: no puede ser solo IGV', () => {
    expect(() =>
      resolverSoloCreditoIgv(true, [{ productoId: null }, { productoId: 5 }]),
    ).toThrow(BadRequestException);
  });

  it('false o sin enviar pasan tal cual (sin enviar = no tocar al editar)', () => {
    expect(resolverSoloCreditoIgv(false, [{ productoId: 5 }])).toBe(false);
    expect(
      resolverSoloCreditoIgv(undefined, [{ productoId: 5 }]),
    ).toBeUndefined();
  });

  it('los filtros de dinero las dejan fuera', () => {
    expect(COMPRA_CON_DINERO).toEqual({ soloCreditoIgv: false });
    expect(PAGO_DE_COMPRA_CON_DINERO).toEqual({
      compra: { soloCreditoIgv: false },
    });
  });
});
