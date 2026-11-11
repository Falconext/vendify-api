import { ForbiddenException } from '@nestjs/common';
import { verificarSinDescuentos } from './sin-descuentos.util';

const cajero = { rol: 'USUARIO_EMPRESA', bloquearDescuentos: true };
const linea = (precio: number, lista?: number, descuento = 0) => ({
  nuevoValorUnitario: precio,
  ...(lista != null ? { precioUnitarioOriginal: lista } : {}),
  descuento,
});

describe('verificarSinDescuentos', () => {
  it('venta a precio de lista pasa', () => {
    expect(() =>
      verificarSinDescuentos(cajero, { descuento: 0, detalles: [linea(10, 10)] }),
    ).not.toThrow();
  });
  it('descuento por línea se rechaza', () => {
    expect(() =>
      verificarSinDescuentos(cajero, { detalles: [linea(9, 10, 10)] }),
    ).toThrow(ForbiddenException);
  });
  it('línea más barata que su lista cuenta como descuento', () => {
    expect(() =>
      verificarSinDescuentos(cajero, { detalles: [linea(9, 10)] }),
    ).toThrow(ForbiddenException);
  });
  it.each(['descuento', 'montoDescuentoGlobal', 'cotizDescuento', 'descuentoOT', 'descuentoPorcOT'])(
    'descuento global en %s se rechaza',
    (campo) => {
      expect(() =>
        verificarSinDescuentos(cajero, { [campo]: 5, detalles: [linea(10, 10)] }),
      ).toThrow(ForbiddenException);
    },
  );
  it('redondeo del precio no cuenta como descuento', () => {
    expect(() =>
      verificarSinDescuentos(cajero, { detalles: [linea(9.999, 10)] }),
    ).not.toThrow();
  });
  it('sin el candado o siendo admin no se revisa', () => {
    const dto = { descuento: 5, detalles: [linea(9, 10, 10)] };
    expect(() =>
      verificarSinDescuentos({ rol: 'USUARIO_EMPRESA', bloquearDescuentos: false }, dto),
    ).not.toThrow();
    expect(() =>
      verificarSinDescuentos({ rol: 'ADMIN_EMPRESA', bloquearDescuentos: true }, dto),
    ).not.toThrow();
  });
});
