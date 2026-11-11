import { BadRequestException } from '@nestjs/common';

type CuentaConInicio = { id: number; saldoInicialFecha: Date | null };

/**
 * Filtro por cuenta para una consulta agregada: cada cuenta cuenta desde su
 * propia fecha de saldo inicial, y la que no tiene, todo su historial.
 */
export const porCuentaDesde = <T extends object>(
  cuentas: CuentaConInicio[],
  desde: (fecha: Date) => T,
) =>
  cuentas.map((c) => ({
    cuentaBancariaId: c.id,
    ...(c.saldoInicialFecha ? desde(c.saldoInicialFecha) : {}),
  }));

/** Un gasto sin fecha cuenta por su fecha de registro, igual que en la lista. */
export const gastoDesde = (gte: Date) => ({
  OR: [{ fecha: { gte } }, { fecha: null, creadoEn: { gte } }],
});

const hoyEnLima = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

/**
 * Pasa el saldo inicial del formulario a la base. El monto y la fecha van
 * juntos: sin fecha no se sabría desde cuándo contar los movimientos.
 */
export const datosSaldoInicial = (dto: {
  saldoInicial?: number | null;
  saldoInicialFecha?: string | null;
}) => {
  if (dto.saldoInicial === undefined && dto.saldoInicialFecha === undefined) {
    return {};
  }
  if (dto.saldoInicial == null) {
    return { saldoInicial: null, saldoInicialFecha: null };
  }
  if (!dto.saldoInicialFecha) {
    throw new BadRequestException('Indica la fecha del saldo inicial');
  }
  if (dto.saldoInicialFecha > hoyEnLima()) {
    throw new BadRequestException('La fecha del saldo inicial no puede ser futura');
  }
  return {
    saldoInicial: dto.saldoInicial,
    saldoInicialFecha: new Date(`${dto.saldoInicialFecha}T00:00:00.000-05:00`),
  };
};
