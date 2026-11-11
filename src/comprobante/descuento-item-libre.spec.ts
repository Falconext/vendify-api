import { ComprobanteService } from './comprobante.service';

// El POS pliega el descuento por línea dentro del precio (nuevoValorUnitario) y
// manda el precio de lista en precioUnitarioOriginal. El ítem libre guardaba
// mtoDescuento = 0, así que el PDF del link (WhatsApp) salía sin descuento.
describe('descuento por línea en ítem libre', () => {
  const svc = () => {
    const prisma = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ leyAmazonia: false }) },
      producto: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const deps = Array(7).fill({}) as [any, any, any, any, any, any, any];
    return new ComprobanteService(prisma as any, ...deps) as any;
  };

  it('guarda el descuento (S/150 con -30% → mtoDescuento 45, precio 105)', async () => {
    const { detalleFinal } = await svc().cargarProductosYDetalles(
      [
        {
          productoId: null,
          descripcion: 'ATENCIÓN DE INCIDENCIA',
          cantidad: 1,
          nuevoValorUnitario: 105,
          descuento: 30,
          precioUnitarioOriginal: 150,
          unidadVenta: 'ZZ',
        },
      ],
      1,
    );
    expect(detalleFinal[0].mtoPrecioUnitario).toBe(105);
    expect(detalleFinal[0].mtoDescuento).toBe(45);
  });

  it('sin precio de lista (envío, kit) o gratuito → 0', async () => {
    const { detalleFinal } = await svc().cargarProductosYDetalles(
      [
        { productoId: null, descripcion: 'ENVÍO', cantidad: 1, nuevoValorUnitario: 10 },
        {
          productoId: null,
          descripcion: 'OBSEQUIO',
          cantidad: 1,
          nuevoValorUnitario: 20,
          precioUnitarioOriginal: 30,
          tipoAfectacionIGV: '13',
        },
      ],
      1,
    );
    expect(detalleFinal[0].mtoDescuento).toBe(0);
    expect(detalleFinal[1].mtoDescuento).toBe(0);
  });
});
