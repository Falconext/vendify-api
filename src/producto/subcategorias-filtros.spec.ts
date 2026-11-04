/**
 * Subcategorías y filtros del inventario (pedido 02-11).
 */
import { filtroPorCategoria, separarRutaCategoria, condicionesCategoriaPorNombre } from './categorias-extra.util';
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
