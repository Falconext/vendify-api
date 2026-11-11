import { vencimientoCobro } from './vencimiento-cobro';

const HOY = '2026-11-10';

describe('vencimiento de una cuenta por cobrar', () => {
  it('factura a 90 días emitida hace 40: no está vencida', () => {
    const v = vencimientoCobro(
      {
        fechaEmision: '2026-10-01T15:00:00.000Z',
        fechaVencimientoCredito: '2026-12-30T00:00:00.000Z',
        cuotas: [{ monto: 1000, fechaVencimiento: '2026-12-30' }],
        saldo: 1000,
      },
      HOY,
    );
    expect(v).toMatchObject({
      fecha: '2026-12-30',
      dias: 50,
      situacion: 'AL_DIA',
      origen: 'CUOTA',
    });
  });

  it('vence en 7 días o menos: por vencer; hoy también', () => {
    const base = { fechaEmision: '2026-10-10T15:00:00.000Z', saldo: 50 };
    expect(
      vencimientoCobro(
        { ...base, fechaVencimientoCredito: '2026-11-17T00:00:00.000Z' },
        HOY,
      ),
    ).toMatchObject({ dias: 7, situacion: 'POR_VENCER', origen: 'CREDITO' });
    expect(
      vencimientoCobro(
        { ...base, fechaVencimientoCredito: '2026-11-10T00:00:00.000Z' },
        HOY,
      ),
    ).toMatchObject({ dias: 0, situacion: 'POR_VENCER' });
  });

  it('pasada la fecha: vencido, con los días de atraso', () => {
    const v = vencimientoCobro(
      {
        fechaEmision: '2026-10-01T15:00:00.000Z',
        fechaVencimientoCredito: '2026-11-05T00:00:00.000Z',
        saldo: 10,
      },
      HOY,
    );
    expect(v).toMatchObject({ dias: -5, situacion: 'VENCIDO' });
  });

  it('en cuotas, lo abonado cubre las primeras y vence la siguiente', () => {
    const cuotas = [
      { monto: 300, fechaVencimiento: '2026-11-01' },
      { monto: 300, fechaVencimiento: '2026-12-01' },
      { monto: 300, fechaVencimiento: '2027-01-01' },
    ];
    const base = { fechaEmision: '2026-10-01T15:00:00.000Z', cuotas };
    // Sin pagos: la primera ya venció.
    expect(vencimientoCobro({ ...base, saldo: 900 }, HOY)).toMatchObject({
      fecha: '2026-11-01',
      situacion: 'VENCIDO',
      cuota: 1,
      totalCuotas: 3,
    });
    // Pagó la primera: ahora manda la segunda, al día.
    expect(vencimientoCobro({ ...base, saldo: 600 }, HOY)).toMatchObject({
      fecha: '2026-12-01',
      situacion: 'AL_DIA',
      cuota: 2,
    });
    // Pago parcial de la primera: sigue vencida la primera.
    expect(vencimientoCobro({ ...base, saldo: 750 }, HOY)).toMatchObject({
      cuota: 1,
      situacion: 'VENCIDO',
    });
  });

  it('al contado sin fecha de crédito: emisión + 30 días, como antes', () => {
    const v = vencimientoCobro(
      { fechaEmision: '2026-10-01T15:00:00.000Z', saldo: 20 },
      HOY,
    );
    expect(v).toMatchObject({
      fecha: '2026-10-31',
      situacion: 'VENCIDO',
      origen: 'SIN_CREDITO',
    });
    // Emitido a las 9 p. m. de Lima (ya otro día en UTC) cuenta desde el día de Lima.
    expect(
      vencimientoCobro(
        { fechaEmision: '2026-10-21T02:00:00.000Z', saldo: 20 },
        HOY,
      ).fecha,
    ).toBe('2026-11-19');
  });
});
