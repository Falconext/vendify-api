import { filtroBusquedaTienda } from './busqueda-tienda.util';

const campos = (palabra: string) => ({
  OR: ['descripcion', 'descripcionLarga', 'codigo'].map((campo) => ({
    [campo]: { contains: palabra, mode: 'insensitive' },
  })),
});

describe('filtroBusquedaTienda', () => {
  it('busca cada palabra en el nombre, la descripción y el código', () => {
    expect(filtroBusquedaTienda('lavanda')).toEqual([campos('lavanda')]);
  });

  it('exige todas las palabras, en cualquier orden', () => {
    expect(filtroBusquedaTienda('  dolor   articular ')).toEqual([campos('dolor'), campos('articular')]);
  });

  it('sin texto no filtra', () => {
    expect(filtroBusquedaTienda('   ')).toEqual([]);
    expect(filtroBusquedaTienda(null)).toEqual([]);
  });
});
