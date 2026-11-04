/**
 * Stock por variante y por sede (02-11): "no está respetando el stock por
 * variante de cada sede, me trae el stock de sede principal".
 *
 * La ficha del producto traía el stock de cada variante como la suma de todas
 * las sedes, y al guardar ese número se escribía en una sola sede. Con 6 en
 * Principal y 4 en Almacén, abrir el producto viendo Almacén mostraba 10, y
 * guardar dejaba Principal en 10 (+4 que no existen).
 */
import { conStockDeSede, stockVarianteEnSede } from './stock-variante-sede';
import { sincronizarVariantes } from './variantes.util';

const PRINCIPAL = 100;
const ALMACEN = 200;

describe('stock de una variante en una sede', () => {
  const talla = { stock: 10, stocks: [{ sedeId: PRINCIPAL, stock: 6 }, { sedeId: ALMACEN, stock: 4 }] };

  it('con sede, lo de esa sede', () => {
    expect(stockVarianteEnSede(talla, PRINCIPAL)).toBe(6);
    expect(stockVarianteEnSede(talla, ALMACEN)).toBe(4);
  });

  it('una sede sin fila tiene 0, no el total', () => {
    expect(stockVarianteEnSede(talla, 999)).toBe(0);
  });

  it('sin sede, la suma de las sedes', () => {
    expect(stockVarianteEnSede(talla, null)).toBe(10);
  });

  it('sin filas cargadas, el global de siempre', () => {
    expect(stockVarianteEnSede({ stock: 7 }, ALMACEN)).toBe(7);
  });

  it('la respuesta no arrastra las filas por sede', () => {
    expect(conStockDeSede({ id: 1, ...talla }, ALMACEN)).toEqual({ id: 1, stock: 4 });
  });
});

describe('guardar un producto con variantes', () => {
  const padre = {
    id: 1, empresaId: 10, codigo: 'POLO', descripcion: 'POLO', unidadMedidaId: 1, tipoAfectacionIGV: '10',
    precioUnitario: 50, igvPorcentaje: 18, categoriaId: null, marcaId: null, porcentajeVenta: 100,
    porcentajeProvision: 0, publicarEnTienda: true, costoPromedio: 20, costoFijo: 0,
    opcionesAtributos: [{ nombre: 'Talla', valores: ['M'] }],
  };
  const sedes = [{ id: PRINCIPAL, esPrincipal: true }, { id: ALMACEN, esPrincipal: false }];
  const existente = { id: 55, codigo: 'POLO-M', valoresAtributos: { Talla: 'M' }, precioUnitario: 50, stock: 10, costoPromedio: 20, costoFijo: 0 };

  const prismaCon = () => ({
    producto: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where?.productoPadreId != null ? [existente] : [{ id: 55, codigo: 'POLO-M' }]),
      ),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { stock: 10 } }),
    },
    productoStock: {
      upsert: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { stock: 10 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  });
  const escrituras = (prisma: any) =>
    prisma.productoStock.upsert.mock.calls
      .filter(([a]: any) => a.where.productoId_sedeId.productoId === 55)
      .map(([a]: any) => ({ sede: a.where.productoId_sedeId.sedeId, update: a.update }))
      .filter((w: any) => Object.keys(w.update).length);

  it('el stock va a la sede que se está viendo, no a la principal', async () => {
    const prisma = prismaCon();
    await sincronizarVariantes(prisma as any, padre, sedes, [{ valoresAtributos: { Talla: 'M' }, stock: 5 } as any], ALMACEN);
    expect(escrituras(prisma)).toEqual([{ sede: ALMACEN, update: { stock: 5, stockMinimo: 0 } }]);
  });

  it('viendo "Todas las sedes" no se escribe stock en ninguna', async () => {
    const prisma = prismaCon();
    await sincronizarVariantes(prisma as any, padre, sedes, [{ valoresAtributos: { Talla: 'M' }, stock: 10 } as any], null);
    expect(escrituras(prisma)).toEqual([]);
  });

  it('sin stock en el formulario, no se copia el total a una sede', async () => {
    const prisma = prismaCon();
    await sincronizarVariantes(prisma as any, padre, sedes, [], PRINCIPAL);
    expect(escrituras(prisma)).toEqual([]);
  });
});
