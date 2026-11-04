import { comprobanteCorregido, etiquetaCuenta, referenciaReal, turnoQueContiene, type LineaCorregida } from './corregir-medio-pago';

const linea = (o: Partial<LineaCorregida> = {}): LineaCorregida => ({
  monto: 98,
  medioPago: 'YAPE',
  cuentaBancariaId: 7,
  cuentaBancariaLabel: 'BCP ····7046',
  referencia: null,
  ...o,
});

describe('etiquetaCuenta', () => {
  it('usa el alias o banco + últimos 4 dígitos, sin guiones', () => {
    expect(etiquetaCuenta({ alias: ' Caja Yape ', banco: 'BCP', numeroCuenta: '191' })).toBe('Caja Yape');
    expect(etiquetaCuenta({ banco: 'BCP', numeroCuenta: '191-1234567-0-29' })).toBe('BCP ····7029');
    expect(etiquetaCuenta(null)).toBe('');
  });
});

describe('referenciaReal', () => {
  const comp = { tipoDoc: 'NV', serie: 'NV01', correlativo: 69 };
  it('el documento no es un N° de operación, en ninguno de sus dos formatos', () => {
    expect(referenciaReal('NV01-69', comp)).toBe('');
    expect(referenciaReal('NV-NV01-69', comp)).toBe('');
    expect(referenciaReal(null, comp)).toBe('');
  });
  it('un N° de operación real se conserva', () => {
    expect(referenciaReal(' OP-555 ', comp)).toBe('OP-555');
  });
});

describe('turnoQueContiene', () => {
  const turnos = [{ id: 1, desde: '2026-11-03T13:00:00Z', hasta: '2026-11-03T23:00:00Z' }];
  it('encuentra el turno cerrado del cobro', () => {
    expect(turnoQueContiene('2026-11-03T18:14:00Z', turnos)?.id).toBe(1);
  });
  it('un cobro fuera del turno no cuenta como cerrado', () => {
    expect(turnoQueContiene('2026-11-04T01:00:00Z', turnos)).toBeNull();
    expect(turnoQueContiene('2026-11-03T12:00:00Z', turnos)).toBeNull();
    expect(turnoQueContiene('2026-11-03T18:00:00Z', [])).toBeNull();
  });
});

describe('comprobanteCorregido', () => {
  it('de efectivo a Yape: cambia el medio, pone la cuenta y quita el vuelto', () => {
    const r = comprobanteCorregido(
      { medioPago: 'EFECTIVO', formaPagoTipo: 'Contado', vuelto: 2, paymentDetails: { mode: 'SIMPLE', method: 'EFECTIVO', amount: 100, recibido: 100 } },
      [linea()],
    );
    expect(r.medioPago).toBe('YAPE');
    expect(r.vuelto).toBe(0);
    expect(r.paymentDetails).toEqual({ mode: 'SIMPLE', method: 'YAPE', amount: 98, cuentaBancariaId: 7, cuentaBancariaLabel: 'BCP ····7046' });
  });

  it('a efectivo: no queda una cuenta bancaria colgada en el ticket', () => {
    const r = comprobanteCorregido(
      { medioPago: 'YAPE', formaPagoTipo: 'Contado', vuelto: 0, paymentDetails: JSON.stringify({ mode: 'SIMPLE', method: 'YAPE', amount: 98, cuentaBancariaId: 7, cuentaBancariaLabel: 'BCP ····7046', referencia: '123' }) },
      [linea({ medioPago: 'EFECTIVO', cuentaBancariaId: null, cuentaBancariaLabel: '' })],
    );
    expect(r.medioPago).toBe('EFECTIVO');
    expect(r.paymentDetails.cuentaBancariaLabel).toBeUndefined();
    expect(r.paymentDetails.referencia).toBeUndefined();
  });

  it('dos cobros con distinto medio quedan como mixto y conservan el vuelto si hay efectivo', () => {
    const r = comprobanteCorregido(
      { medioPago: 'EFECTIVO', formaPagoTipo: 'Contado', vuelto: 5, paymentDetails: {} },
      [linea({ monto: 40, medioPago: 'EFECTIVO', cuentaBancariaId: null, cuentaBancariaLabel: '' }), linea({ monto: 58 })],
    );
    expect(r.medioPago).toBe('MIXTO');
    expect(r.vuelto).toBe(5);
    expect(r.paymentDetails.splitPayments.map((l: any) => [l.method, l.amount])).toEqual([['EFECTIVO', 40], ['YAPE', 58]]);
  });

  it('dos cobros que terminan en el mismo medio y cuenta dejan de ser mixto', () => {
    const r = comprobanteCorregido(
      { medioPago: 'MIXTO', formaPagoTipo: 'Contado', paymentDetails: { mode: 'MIXTO', splitPayments: [] } },
      [linea({ monto: 40 }), linea({ monto: 58 })],
    );
    expect(r.medioPago).toBe('YAPE');
    expect(r.paymentDetails).toMatchObject({ mode: 'SIMPLE', amount: 98 });
  });

  it('una venta a crédito sigue siendo crédito', () => {
    const r = comprobanteCorregido({ medioPago: 'CREDITO', formaPagoTipo: 'CREDITO', paymentDetails: {} }, [linea({ monto: 30 })]);
    expect(r.medioPago).toBe('CREDITO');
    expect(r.paymentDetails.method).toBe('YAPE');
  });

  it('conserva lo pagado antes de una edición', () => {
    const r = comprobanteCorregido({ medioPago: 'EFECTIVO', formaPagoTipo: 'Contado', paymentDetails: { pagoAnterior: 20.8, recibido: 50 } }, [linea()]);
    expect(r.paymentDetails.pagoAnterior).toBe(20.8);
    expect(r.paymentDetails.recibido).toBeUndefined();
  });

  it('los datos de tarjeta solo se quedan si sigue siendo tarjeta', () => {
    const pd = { tarjetaMarca: 'VISA', tarjetaUltimos4: '1234' };
    const tarjeta = linea({ medioPago: 'TARJETA', cuentaBancariaId: null, cuentaBancariaLabel: '' });
    expect(comprobanteCorregido({ paymentDetails: pd }, [tarjeta]).paymentDetails.tarjetaMarca).toBe('VISA');
    expect(comprobanteCorregido({ paymentDetails: pd }, [linea()]).paymentDetails.tarjetaMarca).toBeUndefined();
  });
});
