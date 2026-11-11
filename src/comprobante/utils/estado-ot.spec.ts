import { esEstadoOT, filtroEstadoOT } from './estado-ot';

describe('estado de fabricación de la OT', () => {
  it('pendiente incluye las OT antiguas sin estado', () => {
    expect(filtroEstadoOT('PENDIENTE')).toEqual({
      OR: [{ estadoOT: null }, { estadoOT: 'PENDIENTE' }],
    });
  });
  it('los demás filtran por su valor', () => {
    expect(filtroEstadoOT('LISTO')).toEqual({ estadoOT: 'LISTO' });
  });
  it('vacío o desconocido no filtra', () => {
    expect(filtroEstadoOT('')).toBeNull();
    expect(filtroEstadoOT('TODOS')).toBeNull();
    expect(filtroEstadoOT(undefined)).toBeNull();
    expect(esEstadoOT('FABRICANDO')).toBe(false);
  });
});
