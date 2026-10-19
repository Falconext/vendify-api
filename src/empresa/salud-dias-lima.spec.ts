import { diaCalendarioLima, diasCalendarioLima } from '../common/utils/fecha';

// Caso real: EILEEN SHOP (empresa 79), visto el lunes 2026-10-19 a las 9:51 a. m. de Lima.
const ahora = new Date('2026-10-19T14:51:00Z');

describe('Días calendario de Lima', () => {
  it('una venta del día anterior es "ayer" aunque hayan pasado menos de 24 h', () => {
    // Domingo 18 a las 5:57 p. m. de Lima.
    expect(diasCalendarioLima(new Date('2026-10-18T22:57:00Z'), ahora)).toBe(1);
  });

  it('una venta de esta mañana es de hoy', () => {
    expect(diasCalendarioLima(new Date('2026-10-19T13:00:00Z'), ahora)).toBe(0);
  });

  it('el día cambia a la medianoche de Lima, no a la de UTC', () => {
    // 23:30 de Lima del 18 = 04:30 UTC del 19: sigue siendo el 18.
    const tarde = new Date('2026-10-19T04:30:00Z');
    const madrugada = new Date('2026-10-19T05:30:00Z'); // 00:30 del 19 en Lima
    expect(diaCalendarioLima(madrugada) - diaCalendarioLima(tarde)).toBe(1);
    expect(diasCalendarioLima(tarde, ahora)).toBe(1);
    expect(diasCalendarioLima(madrugada, ahora)).toBe(0);
  });

  it('una semana son 7 días', () => {
    expect(diasCalendarioLima(new Date('2026-10-12T15:00:00Z'), ahora)).toBe(7);
  });
});
