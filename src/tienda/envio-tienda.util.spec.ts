import { costoEnvioDelPedido, envioPublico } from './envio-tienda.util';

describe('envío de la tienda', () => {
  const empresa = { costoEnvioFijo: 15, envioGratisDesdeSoles: 100 };

  it('cobra el costo fijo bajo el umbral y nada al alcanzarlo', () => {
    expect(costoEnvioDelPedido(empresa, 'ENVIO', 99)).toBe(15);
    expect(costoEnvioDelPedido(empresa, 'ENVIO', 100)).toBe(0);
  });

  it('sin umbral nunca es gratis por monto', () => {
    expect(costoEnvioDelPedido({ costoEnvioFijo: 15, envioGratisDesdeSoles: 0 }, 'ENVIO', 900)).toBe(15);
  });

  it('el recojo no paga envío', () => {
    expect(costoEnvioDelPedido(empresa, 'RECOJO', 10)).toBe(0);
  });

  it('a coordinar no cobra aunque haya un costo guardado', () => {
    expect(costoEnvioDelPedido({ ...empresa, envioACoordinar: true }, 'ENVIO', 10)).toBe(0);
  });

  it('a coordinar no expone costo ni umbral en la tienda', () => {
    expect(envioPublico({ ...empresa, envioACoordinar: true })).toEqual({
      costoEnvioFijo: 0,
      envioGratisDesdeSoles: 0,
      envioACoordinar: true,
    });
    expect(envioPublico(empresa)).toBe(empresa);
  });
});
