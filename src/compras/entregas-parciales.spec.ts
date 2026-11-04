import { pendienteDe, repartirEntrega } from './entregas-parciales';

const lineas = [
  { id: 1, descripcion: 'Zapato 38', cantidad: 100, cantidadRecibida: 0 },
  { id: 2, descripcion: 'Zapato 39', cantidad: 50, cantidadRecibida: 20 },
];

describe('entregas parciales', () => {
  it('pendiente = pedido − recibido', () => {
    expect(pendienteDe(lineas[0])).toBe(100);
    expect(pendienteDe(lineas[1])).toBe(30);
  });

  it('sin indicar cantidades llega todo lo pendiente', () => {
    expect(repartirEntrega(lineas)).toEqual({ cantidades: [100, 30], completa: true });
  });

  it('una entrega parcial deja la orden incompleta', () => {
    expect(
      repartirEntrega(lineas, [{ detalleId: 1, cantidad: 60 }]),
    ).toEqual({ cantidades: [60, 0], completa: false });
  });

  it('completar lo que falta cierra la orden', () => {
    expect(
      repartirEntrega(lineas, [
        { detalleId: 1, cantidad: 100 },
        { detalleId: 2, cantidad: 30 },
      ]).completa,
    ).toBe(true);
  });

  it('no deja recibir más de lo que falta', () => {
    expect(() => repartirEntrega(lineas, [{ detalleId: 2, cantidad: 31 }])).toThrow(
      'De "Zapato 39" faltan 30',
    );
  });

  it('rechaza una entrega vacía, negativa o de otra orden', () => {
    expect(() => repartirEntrega(lineas, [{ detalleId: 1, cantidad: 0 }])).toThrow('al menos un producto');
    expect(() => repartirEntrega(lineas, [{ detalleId: 1, cantidad: -1 }])).toThrow('negativas');
    expect(() => repartirEntrega(lineas, [{ detalleId: 9, cantidad: 1 }])).toThrow('no pertenece');
  });
});
