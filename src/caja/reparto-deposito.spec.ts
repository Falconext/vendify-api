import {
  esEfectivo,
  sugerenciaConComprobante,
  validarReparto,
} from './reparto-deposito';

describe('Reparto del depósito de caja entre cuentas', () => {
  it('acepta un reparto que suma exacto el efectivo (caso IRBA, S/ 865.20)', () => {
    expect(
      validarReparto(
        [
          { cuentaBancariaId: 1, monto: 600.2 },
          { cuentaBancariaId: 2, monto: 265 },
        ],
        865.2,
      ),
    ).toBeNull();
  });

  it('tolera el redondeo de decimales', () => {
    expect(
      validarReparto(
        [
          { cuentaBancariaId: 1, monto: 0.1 },
          { cuentaBancariaId: 2, monto: 0.2 },
        ],
        0.3,
      ),
    ).toBeNull();
  });

  it('dice cuánto falta si el reparto se queda corto', () => {
    expect(
      validarReparto(
        [
          { cuentaBancariaId: 1, monto: 500 },
          { cuentaBancariaId: 2, monto: 300 },
        ],
        865.2,
      ),
    ).toContain('faltan S/ 65.20');
  });

  it('dice cuánto sobra si se pasa', () => {
    expect(
      validarReparto(
        [
          { cuentaBancariaId: 1, monto: 600 },
          { cuentaBancariaId: 2, monto: 300 },
        ],
        865.2,
      ),
    ).toContain('se pasa por S/ 34.80');
  });

  it('rechaza la misma cuenta dos veces, montos en cero y una sola cuenta', () => {
    expect(
      validarReparto(
        [
          { cuentaBancariaId: 1, monto: 400 },
          { cuentaBancariaId: 1, monto: 465.2 },
        ],
        865.2,
      ),
    ).toContain('misma cuenta');
    expect(
      validarReparto(
        [
          { cuentaBancariaId: 1, monto: 865.2 },
          { cuentaBancariaId: 2, monto: 0 },
        ],
        865.2,
      ),
    ).toContain('mayor a cero');
    expect(validarReparto([{ cuentaBancariaId: 1, monto: 865.2 }], 865.2)).toContain(
      'al menos dos',
    );
  });

  it('la sugerencia no pasa del efectivo declarado ni baja de cero', () => {
    expect(sugerenciaConComprobante(1200, 865.2)).toBe(865.2);
    expect(sugerenciaConComprobante(-5, 865.2)).toBe(0);
    expect(sugerenciaConComprobante(412.456, 865.2)).toBe(412.46);
  });

  it('reconoce el efectivo con los mismos nombres que el arqueo', () => {
    expect(esEfectivo('EFECTIVO')).toBe(true);
    expect(esEfectivo(null)).toBe(true);
    expect(esEfectivo('cash')).toBe(true);
    expect(esEfectivo('Yape')).toBe(false);
    expect(esEfectivo('TARJETA')).toBe(false);
  });
});
