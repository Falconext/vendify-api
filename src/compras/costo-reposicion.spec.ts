/**
 * Dólar y márgenes (pedido 2026-11-03): el empresario compra en dólares y no
 * sabe a cuánto vender cuando el TC se movió desde la compra. El costo del
 * producto queda en soles al TC de la compra; esto calcula lo que cuesta
 * reponerlo hoy y el precio que deja el margen buscado.
 */
import { CostoReposicionService, ORIGEN_AVISO_TC } from './costo-reposicion.service';
import { calcularFila, ordenarFilas, redondearPrecio, valorSinIgv } from './costo-reposicion';

const producto = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  codigo: 'LAP-1',
  descripcion: 'Laptop',
  moneda: 'PEN',
  precioUnitario: 500,
  tipoAfectacionIGV: '10',
  igvPorcentaje: 18,
  stock: 4,
  ...extra,
});
const compra = (tipoCambio: number) => ({ costoUsd: 100, tipoCambio, fecha: '2026-10-01', documento: 'F001-77' });
const CONFIG = { umbralPct: 3, margenObjetivoPct: 30, colchonTc: 0 };

describe('calcularFila', () => {
  it('el dólar subió de 3.40 a 3.76: reponer cuesta más y el precio ya no deja el margen', () => {
    const f = calcularFila(producto(), compra(3.4), 3.76, CONFIG);
    expect(f).toMatchObject({
      costoCompraSoles: 340,
      costoReposicionSoles: 376,
      variacionTcPct: 10.6,
      precioActualSoles: 500,
      margenCompraPct: 19.8,
      margenReposicionPct: 11.3,
      estado: 'riesgo',
    });
    // 100 × 3.76 ÷ 0.70 = 537.14 neto → con IGV 633.83 → redondeo hacia arriba.
    expect(f.precioSugerido).toBe(633.9);
  });

  it('el dólar bajó de 3.76 a 3.40: reponer cuesta menos y el precio sigue dejando margen', () => {
    const f = calcularFila(producto({ precioUnitario: 633.9 }), compra(3.76), 3.4, CONFIG);
    expect(f).toMatchObject({ costoReposicionSoles: 340, variacionTcPct: -9.6, estado: 'bajo' });
    expect(f.margenReposicionPct).toBeGreaterThan(30);
    // Quedan 4 comprados a 3.76: el sugerido no baja de lo que deja margen sobre lo pagado.
    expect(f).toMatchObject({ sugeridoSobre: 'compra', precioSugerido: 633.9 });
    // Sin stock, el precio ya puede seguir al dólar.
    expect(calcularFila(producto({ precioUnitario: 633.9, stock: 0 }), compra(3.76), 3.4, CONFIG)).toMatchObject({
      sugeridoSobre: 'reposicion',
      precioSugerido: 573.2,
    });
  });

  it('sin movimiento del dólar pero con precio corto, avisa margen bajo', () => {
    expect(calcularFila(producto({ precioUnitario: 420 }), compra(3.76), 3.77, CONFIG).estado).toBe('margen-bajo');
    expect(calcularFila(producto({ precioUnitario: 700 }), compra(3.76), 3.77, CONFIG).estado).toBe('ok');
  });

  it('el colchón sube el TC con que se sugiere el precio, no el costo de reponer', () => {
    const f = calcularFila(producto(), compra(3.4), 3.76, { ...CONFIG, colchonTc: 0.1 });
    expect(f.costoReposicionSoles).toBe(376);
    expect(f.precioSugerido).toBe(650.7);
  });

  it('exonerado: el sugerido no suma IGV', () => {
    const f = calcularFila(producto({ tipoAfectacionIGV: '20' }), compra(3.4), 3.76, CONFIG);
    expect(f.gravado).toBe(false);
    expect(f.precioSugerido).toBe(537.2);
  });

  it('precio en dólares: se compara al TC de hoy y el sugerido sale en dólares', () => {
    const f = calcularFila(producto({ moneda: 'USD', precioUnitario: 200 }), compra(3.4), 3.76, CONFIG);
    expect(f.precioActualSoles).toBe(752);
    expect(f.estado).toBe('ok');
    expect(f.precioSugerido).toBe(168.6);
  });

  it('primero lo que está en riesgo', () => {
    const filas = [
      calcularFila(producto({ id: 1, precioUnitario: 900 }), compra(3.76), 3.4, CONFIG),
      calcularFila(producto({ id: 2 }), compra(3.4), 3.76, CONFIG),
    ];
    expect(ordenarFilas(filas).map((f) => f.productoId)).toEqual([2, 1]);
  });

  it('redondeo y valor sin IGV', () => {
    expect(redondearPrecio(633.83)).toBe(633.9);
    expect(redondearPrecio(633.9)).toBe(633.9);
    expect(valorSinIgv(118, '10', 18)).toBe(100);
    expect(valorSinIgv(118, '20', 18)).toBe(118);
  });
});

describe('CostoReposicionService', () => {
  const linea = (tc: number, precio = 500) => ({
    productoId: 1,
    precioUnitario: 100,
    compra: { tipoCambio: tc, fechaEmision: new Date('2026-10-01'), serie: 'F001', numero: '77' },
    producto: producto({ precioUnitario: precio }),
  });

  const armar = (avisosHoy = 0, lineas = [linea(3.4)]) => {
    const prisma: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ tcAlertaUmbralPct: 3, margenObjetivoPct: 30, tcColchon: 0 }) },
      detalleCompra: { findMany: jest.fn().mockResolvedValue(lineas) },
      notificacion: { count: jest.fn().mockResolvedValue(avisosHoy) },
      producto: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, precioUnitario: 500, tipoAfectacionIGV: '10', igvPorcentaje: 18 }]),
        update: jest.fn((args) => args),
      },
      $transaction: jest.fn(async (ops) => ops),
    };
    const tipoCambio: any = { consultar: jest.fn().mockResolvedValue({ venta: 3.76, fecha: '2026-11-03' }) };
    const notificaciones: any = { notificarAdminsEmpresa: jest.fn() };
    return { servicio: new CostoReposicionService(prisma, tipoCambio, notificaciones), prisma, notificaciones };
  };

  it('lista con el TC de hoy y el resumen', async () => {
    const { servicio, prisma } = armar();
    const r = await servicio.listar(7);
    expect(r.tcHoy).toBe(3.76);
    expect(r.resumen).toEqual({ total: 1, riesgo: 1, margenBajo: 0, bajo: 0 });
    expect(r.filas[0].documentoCompra).toBe('F001-77');
    // Solo compras en dólares vigentes que entraron al inventario.
    expect(prisma.detalleCompra.findMany.mock.calls[0][0].where.compra).toEqual({
      empresaId: 7, moneda: 'USD', estado: 'REGISTRADO', esGasto: false,
    });
  });

  it('aplicar precios guarda el valor sin IGV y devuelve los anteriores para deshacer', async () => {
    const { servicio, prisma } = armar();
    const r = await servicio.aplicarPrecios(7, [{ productoId: 1, precio: 633.9 }]);
    expect(r.anteriores).toEqual([{ productoId: 1, precio: 500 }]);
    expect(prisma.producto.update.mock.calls[0][0].data).toEqual({ precioUnitario: 633.9, valorUnitario: 537.2034 });
    expect(prisma.producto.findMany.mock.calls[0][0].where).toEqual({ id: { in: [1] }, empresaId: 7 });
  });

  it('no toca productos de otra empresa', async () => {
    const { servicio, prisma } = armar();
    prisma.producto.findMany.mockResolvedValue([]);
    await expect(servicio.aplicarPrecios(7, [{ productoId: 99, precio: 10 }])).rejects.toThrow(/no es de tu empresa/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('el aviso diario sale una vez y solo si hay productos en riesgo', async () => {
    const enRiesgo = armar();
    expect(await enRiesgo.servicio.avisarEmpresa(7, 3.76)).toBe(true);
    expect(enRiesgo.notificaciones.notificarAdminsEmpresa.mock.calls[0][0]).toMatchObject({
      titulo: 'El dólar subió: 1 producto con el margen en riesgo',
      metaData: { origen: ORIGEN_AVISO_TC },
    });

    const yaAvisado = armar(1);
    expect(await yaAvisado.servicio.avisarEmpresa(7, 3.76)).toBe(false);

    const sinRiesgo = armar(0, [linea(3.76, 900)]);
    expect(await sinRiesgo.servicio.avisarEmpresa(7, 3.76)).toBe(false);
    expect(sinRiesgo.notificaciones.notificarAdminsEmpresa).not.toHaveBeenCalled();
  });
});
