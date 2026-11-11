/**
 * Subcategorías y filtros del inventario (pedido 02-11).
 */
import { categoriasParaMenu, filtroPorCategoria, separarRutaCategoria, condicionesCategoriaPorNombre } from './categorias-extra.util';
import { agruparAtributos, parsearFiltroVariante } from './filtro-variante';

describe('filtrar por una categoría trae también sus subcategorías', () => {
  it('la principal, la hija y las adicionales de ambas', () => {
    const or = (filtroPorCategoria(7) as any).OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { categoriaId: 7 },
        { categoria: { padreId: 7 } },
        { categoriasExtra: { some: { categoria: { padreId: 7 } } } },
      ]),
    );
  });

  it('en la tienda, elegir la madre por nombre incluye a sus hijas', () => {
    const conds = condicionesCategoriaPorNombre(['Peluches']) as any[];
    expect(conds).toContainEqual({ categoria: { padre: { nombre: { equals: 'Peluches', mode: 'insensitive' } } } });
  });
});

describe('tienda: subcategoría con su madre', () => {
  const insensible = (equals: string) => ({ equals, mode: 'insensitive' });
  const rama = { nombre: insensible('Honda'), padre: { nombre: insensible('Sliders') } };

  it.each(['Sliders › Honda', 'Sliders > Honda', 'Sliders>Honda'])('"%s" filtra por esa rama, principal o adicional', (ruta) => {
    const conds = condicionesCategoriaPorNombre([ruta]) as any[];
    expect(conds).toContainEqual({ categoria: rama });
    expect(conds).toContainEqual({ categoriasExtra: { some: { categoria: rama } } });
  });

  it('un nombre sin ruta no agrega rama', () => {
    expect(condicionesCategoriaPorNombre(['Honda'])).toHaveLength(4);
  });
});

describe('menú de categorías de la tienda', () => {
  const sliders = { nombre: 'Sliders', imagenUrl: 's.jpg' };
  const cascos = { nombre: 'Cascos', imagenUrl: null };
  const honda = { nombre: 'Honda', imagenUrl: null };

  it('solo principales; la madre sale aunque sus productos estén todos en la hija', () => {
    expect(categoriasParaMenu([{ ...honda, padre: sliders }])).toEqual([
      { nombre: 'Sliders', imagenUrl: 's.jpg', subcategorias: [honda] },
    ]);
  });

  it('el mismo nombre bajo dos madres queda en cada una, sin repetirse', () => {
    const menu = categoriasParaMenu([
      { ...honda, padre: sliders },
      { ...honda, padre: cascos },
      { ...honda, padre: sliders },
    ]);
    expect(menu.map((c) => [c.nombre, c.subcategorias.map((h) => h.nombre)])).toEqual([
      ['Sliders', ['Honda']],
      ['Cascos', ['Honda']],
    ]);
  });

  it('un nombre que es principal y también hija sale en los dos lugares', () => {
    const menu = categoriasParaMenu([{ ...honda, padre: sliders }, honda]);
    expect(menu.map((c) => c.nombre)).toEqual(['Sliders', 'Honda']);
    expect(menu[0].subcategorias).toEqual([honda]);
  });

  it('ordena las hijas e ignora productos sin categoría', () => {
    const menu = categoriasParaMenu([null, undefined, { nombre: 'Z', imagenUrl: null, padre: sliders }, { nombre: 'A', imagenUrl: null, padre: sliders }]);
    expect(menu[0].subcategorias.map((h) => h.nombre)).toEqual(['A', 'Z']);
  });
});

describe('Excel: "Madre > Hija"', () => {
  it.each([
    ['Peluches > Osos', ['Peluches', 'Osos']],
    ['  Peluches>Osos  ', ['Peluches', 'Osos']],
    ['Peluches', ['Peluches']],
    ['A > B > C', ['A', 'B']],
    ['>', []],
  ])('%s', (celda, esperado) => expect(separarRutaCategoria(celda as string)).toEqual(esperado));
});

describe('filtro por variante', () => {
  it('lee "Talla=M"', () => {
    expect(parsearFiltroVariante('Talla=M')).toEqual({ nombre: 'Talla', valor: 'M' });
    expect(parsearFiltroVariante(' Color = Rojo oscuro ')).toEqual({ nombre: 'Color', valor: 'Rojo oscuro' });
  });

  it.each(['', 'M', '=M', 'Talla=', undefined, 3])('ignora lo inválido: %s', (v) => {
    expect(parsearFiltroVariante(v)).toBeNull();
  });

  it('agrupa por atributo y ordena las tallas numéricas como números', () => {
    const r = agruparAtributos([
      { nombre: 'Talla', valor: '40', modelos: 1 },
      { nombre: 'TALLA', valor: '38', modelos: 2 },
      { nombre: 'Color', valor: 'Rojo', modelos: 3 },
      { nombre: 'Talla', valor: '9', modelos: 1 },
    ]);
    expect(r.map((g) => g.nombre)).toEqual(['Color', 'Talla']);
    expect(r[1].valores.map((v) => v.valor)).toEqual(['9', '38', '40']);
  });
});
