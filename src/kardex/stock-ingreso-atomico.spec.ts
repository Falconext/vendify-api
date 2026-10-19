import { KardexService } from './kardex.service';

/**
 * Stock por sede y global tras cada movimiento.
 *
 * - Un ingreso suma de forma atómica (`increment`): con el valor absoluto
 *   calculado antes, dos anulaciones simultáneas dejaban dos INGRESO en el
 *   Kardex y una sola devolución en el stock (QA mype 2026-10-19).
 * - Una salida también deja `Producto.stock` = suma de sedes (en mype la
 *   regresión 42154b5 lo rompió; aquí se fija para que no pase).
 */
describe('actualizarStockYCosto: stock de sede y global', () => {
  const montar = (stockPrevio = 0) => {
    const updates: any[] = [];
    const prisma: any = {
      productoStock: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ stock: stockPrevio }),
        update: jest.fn((a: any) => {
          updates.push(a.data);
          return Promise.resolve({});
        }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { stock: 0 } }),
      },
      producto: {
        findUnique: jest.fn().mockResolvedValue({ costoPromedio: 0, productoPadreId: null }),
        update: jest.fn(),
      },
    };
    const service = new KardexService(prisma, {} as any, {} as any);
    return { service, prisma, updates };
  };

  it('un ingreso suma de forma atómica (no pisa una venta simultánea)', async () => {
    const { service, updates } = montar(7);
    await (service as any).actualizarStockYCosto(30173, 67, 10, 'INGRESO', 0, 3);
    expect(updates[0].stock).toEqual({ increment: 3 });
    expect(updates[0].visibleEnSede).toBe(true);
  });

  it('un ajuste sigue escribiendo el valor calculado', async () => {
    const { service, updates } = montar(7);
    await (service as any).actualizarStockYCosto(30173, 67, 4, 'AJUSTE', 0, -3);
    expect(updates[0].stock).toBe(4);
  });

  it('una venta sincroniza el stock global con la suma de sedes', async () => {
    const { service, prisma } = montar(5);
    prisma.productoStock.aggregate.mockResolvedValue({ _sum: { stock: 4 } });
    await (service as any).actualizarStockYCosto(30173, 67, 4, 'SALIDA', 0, 1);
    expect(prisma.productoStock.updateMany).toHaveBeenCalledWith({
      where: { productoId: 30173, sedeId: 67, stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    expect(prisma.producto.update).toHaveBeenCalledWith({
      where: { id: 30173 },
      data: { stock: 4 },
    });
  });
});
