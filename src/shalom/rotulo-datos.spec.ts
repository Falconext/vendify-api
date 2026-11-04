import { lineasDelRotulo } from './rotulo-datos';

/** HELOUSHOP 02-11: el rótulo lleva el detalle para alistar el pedido. */
describe('productos del rótulo', () => {
  it('una línea por producto, con su cantidad; los repetidos se juntan', () => {
    expect(
      lineasDelRotulo([
        { descripcion: 'TRIPODE SMAR TRACK', cantidad: 1 },
        { descripcion: '  tripode   smar track ', cantidad: '2' },
        { descripcion: 'CABLE DE CARGA (REGALO)', cantidad: 1 },
      ]),
    ).toEqual([
      { descripcion: 'TRIPODE SMAR TRACK', cantidad: 3 },
      { descripcion: 'CABLE DE CARGA (REGALO)', cantidad: 1 },
    ]);
  });

  it('sin descripción o sin cantidad no sale', () => {
    expect(lineasDelRotulo([{ descripcion: '', cantidad: 1 }, { descripcion: 'X', cantidad: 0 }])).toEqual([]);
  });
});
