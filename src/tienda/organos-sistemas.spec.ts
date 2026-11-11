import { contarOrganosSistemas, filtroOrganosSistemas, separarValores, valoresParaGuardar } from './organos-sistemas';
import { filtroBusquedaTienda, sinTildes } from './busqueda-tienda.util';

describe('órganos y sistemas', () => {
  it('separa por coma o punto y coma, sin vacíos ni repetidos', () => {
    expect(separarValores('Hígado,  Colon ;corazón, hígado,')).toEqual(['Hígado', 'Colon', 'corazón']);
    expect(separarValores(null)).toEqual([]);
  });

  it('guarda el texto limpio; vacío es null y undefined no toca el campo', () => {
    expect(valoresParaGuardar(' Hígado ,Colon ')).toBe('Hígado, Colon');
    expect(valoresParaGuardar('  , ')).toBeNull();
    expect(valoresParaGuardar(null)).toBeNull();
    expect(valoresParaGuardar(undefined)).toBeUndefined();
  });

  it('cuenta los chips de todo el catálogo, el más frecuente primero', () => {
    const r = contarOrganosSistemas([
      { organos: 'Hígado, Colon', sistemas: 'Sistema Digestivo' },
      { organos: 'hígado', sistemas: 'Sistema Digestivo, Sistema Inmune' },
      { organos: null, sistemas: null },
    ]);
    expect(r.organos).toEqual([
      { nombre: 'Hígado', cantidad: 2 },
      { nombre: 'Colon', cantidad: 1 },
    ]);
    expect(r.sistemas[0]).toEqual({ nombre: 'Sistema Digestivo', cantidad: 2 });
  });

  it('filtra con OR dentro del grupo y AND entre órganos y sistemas', () => {
    expect(filtroOrganosSistemas('Hígado,Colon', 'Sistema Inmune')).toEqual([
      {
        OR: [
          { organos: { contains: 'Hígado', mode: 'insensitive' } },
          { organos: { contains: 'Colon', mode: 'insensitive' } },
        ],
      },
      { OR: [{ sistemas: { contains: 'Sistema Inmune', mode: 'insensitive' } }] },
    ]);
    expect(filtroOrganosSistemas('', '')).toEqual([]);
  });

  it('el buscador también mira órganos y sistemas', () => {
    const [palabra] = filtroBusquedaTienda('próstata');
    expect(palabra.OR).toEqual(
      expect.arrayContaining([
        { organos: { contains: 'próstata', mode: 'insensitive' } },
        { sistemas: { contains: 'próstata', mode: 'insensitive' } },
      ]),
    );
  });

  it('sin tildes encuentra el órgano con tilde, y con tilde también el nombre sin ella', () => {
    expect(sinTildes('Hígado Riñón')).toBe('Higado Rinon');
    const [higado] = filtroBusquedaTienda('higado', ['Hígado', 'Sistema Digestivo']);
    expect(higado.OR).toEqual(expect.arrayContaining([{ organos: { contains: 'Hígado', mode: 'insensitive' } }]));
    const [conTilde] = filtroBusquedaTienda('hígado');
    expect(conTilde.OR).toEqual(expect.arrayContaining([{ descripcion: { contains: 'higado', mode: 'insensitive' } }]));
  });
});
