import { ArqueoService } from './arqueo.service';

const nota = (id: number, monto: number, pagos: number, medioPago = 'EFECTIVO') => ({
  id,
  tipoDoc: 'NV',
  serie: 'NV01',
  correlativo: id,
  fechaEmision: new Date('2026-11-04T17:00:00Z'),
  mtoImpVenta: monto,
  medioPago,
  estadoPago: 'COMPLETADO',
  cliente: { nombre: 'CLIENTES VARIOS' },
  usuario: { nombre: 'Caja' },
  _count: { pagos },
});
const boleta = (id: number, monto: number) => ({
  id,
  tipoDoc: '03',
  serie: 'B0A1',
  correlativo: id,
  fechaEmision: new Date('2026-11-04T17:00:00Z'),
  mtoImpVenta: monto,
  medioPago: 'EFECTIVO',
});
const pago = (monto: number, medioPago = 'EFECTIVO', tipoDoc = 'NV') => ({
  id: monto,
  fecha: new Date('2026-11-04T17:00:00Z'),
  monto,
  medioPago,
  comprobante: { tipoDoc, serie: 'X', correlativo: 1, cliente: { nombre: 'CLIENTES VARIOS' } },
});

const arqueo = (informales: any[], formales: any[], pagos: any[]) => {
  const prisma = {
    comprobante: {
      findMany: jest.fn(async ({ where }: any) =>
        where.tipoDoc.in.includes('NV') ? informales : formales,
      ),
    },
    pago: { findMany: jest.fn().mockResolvedValue(pagos) },
  };
  return new ArqueoService(prisma as any).obtenerArqueoCaja(1, '2026-11-01', '2026-11-04');
};

describe('ArqueoService: cada venta entra una sola vez', () => {
  it('una nota de venta con su pago no se duplica', async () => {
    const r = await arqueo([nota(1, 50, 1)], [], [pago(50)]);
    expect(r.resumen.totalIngresos).toBe(50);
    expect(r.resumen.totalEfectivo).toBe(50);
    expect(r.movimientosCaja).toHaveLength(1);
    expect(r.movimientosCaja[0].tipo).toBe('PAGO');
  });

  it('el caso real: 3 notas cobradas suman lo cobrado, no el doble', async () => {
    const r = await arqueo(
      [nota(45, 50, 1), nota(44, 32.5, 1, 'PLIN'), nota(43, 28, 1, 'YAPE')],
      [],
      [pago(50), pago(32.5, 'PLIN'), pago(28, 'YAPE')],
    );
    expect(r.resumen.totalIngresos).toBe(110.5);
    expect(r.resumen.detalleEfectivo).toBe(50);
    expect(r.resumen.detallePlin).toBe(32.5);
    expect(r.resumen.detalleYape).toBe(28);
    expect(r.resumen.totalComprobantes).toBe(3);
    expect(r.movimientosCaja).toHaveLength(3);
  });

  it('una nota antigua sin pago registrado sigue contando por su comprobante', async () => {
    const r = await arqueo([nota(1, 80, 0, 'YAPE')], [], []);
    expect(r.resumen.totalIngresos).toBe(80);
    expect(r.resumen.detalleYape).toBe(80);
    expect(r.movimientosCaja[0].tipo).toBe('VENTA');
    expect(r.resumen.totalComprobantes).toBe(1);
  });

  it('pago mixto: cuenta cada medio una vez y el total es el de la nota', async () => {
    const r = await arqueo([nota(1, 100, 2)], [], [pago(60), pago(40, 'YAPE')]);
    expect(r.resumen.totalIngresos).toBe(100);
    expect(r.resumen.detalleEfectivo).toBe(60);
    expect(r.resumen.detalleYape).toBe(40);
    expect(r.resumen.totalComprobantes).toBe(1);
  });

  it('un abono de una nota de pedido suma solo lo abonado', async () => {
    const r = await arqueo([], [], [pago(30, 'EFECTIVO', 'NP')]);
    expect(r.resumen.totalIngresos).toBe(30);
    expect(r.resumen.totalComprobantes).toBe(0);
  });

  it('mezcla: boleta sin pago, nota con pago y nota sin pago', async () => {
    const r = await arqueo([nota(1, 10, 1), nota(2, 20, 0)], [boleta(3, 40)], [pago(10)]);
    expect(r.resumen.totalIngresos).toBe(70);
    expect(r.resumen.totalComprobantes).toBe(3);
    expect(r.comprobantesInformales).toBe(2);
    expect(r.movimientosCaja).toHaveLength(3);
  });

  it('sin movimientos todo queda en cero', async () => {
    const r = await arqueo([], [], []);
    expect(r.resumen.totalIngresos).toBe(0);
    expect(r.movimientosCaja).toEqual([]);
  });
});
