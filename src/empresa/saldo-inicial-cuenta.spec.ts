import { BadRequestException } from '@nestjs/common';
import { datosSaldoInicial, gastoDesde, porCuentaDesde } from './saldo-inicial-cuenta';

describe('saldo inicial de cuenta bancaria', () => {
  const inicio = new Date('2026-11-01T05:00:00.000Z');

  it('cada cuenta filtra desde su fecha y la otra cuenta todo', () => {
    const filtro = porCuentaDesde(
      [
        { id: 1, saldoInicialFecha: inicio },
        { id: 2, saldoInicialFecha: null },
      ],
      (gte) => ({ fecha: { gte } }),
    );
    expect(filtro).toEqual([
      { cuentaBancariaId: 1, fecha: { gte: inicio } },
      { cuentaBancariaId: 2 },
    ]);
  });

  it('el gasto sin fecha usa su fecha de registro', () => {
    expect(gastoDesde(inicio)).toEqual({
      OR: [{ fecha: { gte: inicio } }, { fecha: null, creadoEn: { gte: inicio } }],
    });
  });

  it('la fecha es el inicio del día en Lima', () => {
    expect(
      datosSaldoInicial({ saldoInicial: 1500.5, saldoInicialFecha: '2026-11-01' }),
    ).toEqual({ saldoInicial: 1500.5, saldoInicialFecha: inicio });
  });

  it('acepta cero como saldo inicial', () => {
    expect(
      datosSaldoInicial({ saldoInicial: 0, saldoInicialFecha: '2026-11-01' }).saldoInicial,
    ).toBe(0);
  });

  it('sin esos campos no toca lo guardado', () => {
    expect(datosSaldoInicial({})).toEqual({});
  });

  it('null quita el saldo inicial', () => {
    expect(datosSaldoInicial({ saldoInicial: null })).toEqual({
      saldoInicial: null,
      saldoInicialFecha: null,
    });
  });

  it('exige fecha y rechaza una futura', () => {
    expect(() => datosSaldoInicial({ saldoInicial: 10 })).toThrow(BadRequestException);
    expect(() =>
      datosSaldoInicial({ saldoInicial: 10, saldoInicialFecha: '2999-01-01' }),
    ).toThrow(BadRequestException);
  });
});
