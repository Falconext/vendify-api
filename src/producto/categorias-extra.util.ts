/**
 * Un producto puede estar en varias categorías.
 *
 * La categoría PRINCIPAL sigue en `Producto.categoriaId` y manda en reportes,
 * rentabilidad, ficha técnica, SEO y el Excel. Las ADICIONALES viven en
 * `ProductoCategoriaExtra` y solo sirven para encontrarlo: filtros del
 * inventario, POS, kardex y la tienda. Nunca se repite la principal como extra,
 * así contar "principal + extra" no cuenta dos veces el mismo producto.
 */
import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Tope por producto: más que esto ya no ordena el catálogo, lo ensucia. */
export const MAX_CATEGORIAS_EXTRA = 10;

/** Select reutilizable para devolver las adicionales junto al producto. */
export const SELECT_CATEGORIAS_EXTRA = {
  select: {
    categoria: {
      select: { id: true, nombre: true, padre: { select: { nombre: true } } },
    },
  },
  orderBy: { categoria: { nombre: 'asc' } },
} satisfies Prisma.Producto$categoriasExtraArgs;

export interface CategoriaResumen {
  id: number;
  nombre: string;
  padre?: { nombre: string } | null;
}

/** `[{ categoria: {id, nombre} }]` (fila de la tabla puente) → `[{id, nombre}]`. */
export function aplanarCategoriasExtra(
  filas: Array<{ categoria: CategoriaResumen | null }> | null | undefined,
): CategoriaResumen[] {
  return (filas ?? [])
    .map((f) => f.categoria)
    .filter((c): c is CategoriaResumen => !!c);
}

/**
 * Limpia lo que llega del cliente. `undefined` = no tocar (se devuelve
 * `undefined`); `null` o `[]` = quitar todas. Descarta lo que no sea un entero
 * positivo, repetidos y la categoría principal. Más de MAX es un error, no un
 * recorte silencioso: el usuario tiene que saber cuáles quedaron.
 */
export function sanitizarCategoriasExtraIds(
  valor: unknown,
  categoriaPrincipalId: number | null | undefined,
): number[] | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  const principal = Number(categoriaPrincipalId) || null;
  const ids: number[] = [];
  for (const crudo of lista) {
    const n = Number(crudo);
    if (!Number.isInteger(n) || n <= 0) continue;
    if (n === principal || ids.includes(n)) continue;
    ids.push(n);
  }
  if (ids.length > MAX_CATEGORIAS_EXTRA) {
    throw new BadRequestException(
      `Un producto puede tener como máximo ${MAX_CATEGORIAS_EXTRA} categorías adicionales.`,
    );
  }
  return ids;
}

/**
 * Filtro "está en esta categoría": la principal, una adicional, o —para las
 * variantes, que no guardan adicionales propias— una adicional del padre.
 * Se combina SIEMPRE dentro de un `AND`: el `where` suele traer ya un `OR`
 * de búsqueda y pisarlo cambiaría el resultado.
 */
export function filtroPorCategoria(
  categoriaId: number,
): Prisma.ProductoWhereInput {
  // Una categoría con subcategorías incluye lo de sus hijas: filtrar por
  // "Peluches" trae también "Peluches > Osos".
  const hija = { padreId: categoriaId };
  return {
    OR: [
      { categoriaId },
      { categoria: hija },
      { categoriasExtra: { some: { categoriaId } } },
      { categoriasExtra: { some: { categoria: hija } } },
      { productoPadre: { categoriasExtra: { some: { categoriaId } } } },
      { productoPadre: { categoriasExtra: { some: { categoria: hija } } } },
    ],
  };
}

/** Agrega `filtroPorCategoria` al `AND` de un where sin perder lo que ya tenía. */
export function agregarFiltroCategoria<T extends { AND?: unknown }>(
  where: T,
  categoriaId: number | null | undefined,
): T {
  const id = Number(categoriaId);
  if (!Number.isInteger(id) || id <= 0) return where;
  const previo = where.AND;
  const and = Array.isArray(previo) ? previo : previo ? [previo] : [];
  return { ...where, AND: [...and, filtroPorCategoria(id)] };
}

type PrismaTx = Pick<
  PrismaClient,
  'categoria' | 'productoCategoriaExtra' | '$transaction'
>;

/** 400 si algún id no es una categoría de la empresa. */
export async function validarCategoriasExtra(
  prisma: Pick<PrismaClient, 'categoria'>,
  empresaId: number,
  ids: number[] | undefined,
): Promise<void> {
  if (!ids || ids.length === 0) return;
  const propias = await prisma.categoria.findMany({
    where: { id: { in: ids }, empresaId },
    select: { id: true },
  });
  if (propias.length !== ids.length) {
    throw new BadRequestException(
      'Alguna de las categorías adicionales no existe en tu empresa.',
    );
  }
}

/**
 * Reemplaza las categorías adicionales del producto. `ids` ya debe venir de
 * `sanitizarCategoriasExtraIds`. Rechaza ids de otra empresa (400) antes de
 * escribir nada.
 */
export async function guardarCategoriasExtra(
  prisma: PrismaTx,
  params: { productoId: number; empresaId: number; ids: number[] },
): Promise<void> {
  const { productoId, empresaId, ids } = params;
  await validarCategoriasExtra(prisma, empresaId, ids);
  await prisma.$transaction([
    prisma.productoCategoriaExtra.deleteMany({ where: { productoId } }),
    ...(ids.length > 0
      ? [
          prisma.productoCategoriaExtra.createMany({
            data: ids.map((categoriaId) => ({ productoId, categoriaId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);
}

/**
 * Si la principal cambió a una que el producto ya tenía como adicional, se
 * quita de las adicionales para no tenerla dos veces.
 */
export async function quitarPrincipalDeExtras(
  prisma: Pick<PrismaClient, 'productoCategoriaExtra'>,
  productoId: number,
  categoriaPrincipalId: number | null | undefined,
): Promise<void> {
  if (!categoriaPrincipalId) return;
  await prisma.productoCategoriaExtra.deleteMany({
    where: { productoId, categoriaId: categoriaPrincipalId },
  });
}

/**
 * Condiciones (para un `OR`) de "está en alguna de estas categorías", por
 * NOMBRE y sin distinguir mayúsculas: así filtra la tienda pública
 * (`?category=Polos,Ofertas`). "Sliders › Honda" pide solo esa subcategoría, y
 * no la Honda que cuelgue de otra madre.
 */
export function condicionesCategoriaPorNombre(
  nombres: string[],
): Prisma.ProductoWhereInput[] {
  return nombres.flatMap((nombre) => {
    const igual = { equals: nombre, mode: 'insensitive' as const };
    const [madre, hija] = separarRutaCategoria(nombre.replace(/›/g, '>'));
    const enRama = hija
      ? {
          nombre: { equals: hija, mode: 'insensitive' as const },
          padre: { nombre: { equals: madre, mode: 'insensitive' as const } },
        }
      : null;
    return [
      { categoria: { nombre: igual } },
      { categoriasExtra: { some: { categoria: { nombre: igual } } } },
      // Elegir la categoría madre trae también lo de sus subcategorías.
      { categoria: { padre: { nombre: igual } } },
      { categoriasExtra: { some: { categoria: { padre: { nombre: igual } } } } },
      ...(enRama
        ? [
            { categoria: enRama },
            { categoriasExtra: { some: { categoria: enRama } } },
          ]
        : []),
    ];
  });
}

type CategoriaDeProducto = {
  nombre: string;
  imagenUrl: string | null;
  padre?: { nombre: string; imagenUrl: string | null } | null;
} | null | undefined;

/**
 * Menú de categorías de la tienda: solo las principales, cada una con sus
 * `subcategorias`. Así el inicio, la cabecera y la ficha de todas las plantillas
 * muestran las principales sin tocar cada una; el catálogo abre las hijas.
 */
export function categoriasParaMenu(categorias: CategoriaDeProducto[]) {
  const menu = new Map<
    string,
    {
      nombre: string;
      imagenUrl: string | null;
      hijas: Map<string, { nombre: string; imagenUrl: string | null }>;
    }
  >();
  const fila = (nombre: string, imagenUrl: string | null) => {
    let actual = menu.get(nombre);
    if (!actual) {
      actual = { nombre, imagenUrl, hijas: new Map() };
      menu.set(nombre, actual);
    }
    return actual;
  };

  for (const categoria of categorias) {
    if (!categoria?.nombre) continue;
    const madre = categoria.padre;
    if (!madre?.nombre) {
      fila(categoria.nombre, categoria.imagenUrl);
      continue;
    }
    // La madre sale en el menú aunque sus productos estén todos en hijas.
    fila(madre.nombre, madre.imagenUrl).hijas.set(categoria.nombre, {
      nombre: categoria.nombre,
      imagenUrl: categoria.imagenUrl,
    });
  }
  return Array.from(menu.values()).map(({ hijas, ...resto }) => ({
    ...resto,
    subcategorias: Array.from(hijas.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre),
    ),
  }));
}

/**
 * Celda CATEGORIAS_EXTRA del Excel → nombres. Se separan con `|` (lo que
 * escribe el export); si la celda no trae `|`, también vale `,` o `;`, que es
 * lo que alguien escribe a mano. Sin vacíos ni repetidos (sin importar
 * mayúsculas).
 */
export function separarNombresCategorias(valor: unknown): string[] {
  const texto = String(valor ?? '').trim();
  if (!texto) return [];
  const partes = texto.includes('|') ? texto.split('|') : texto.split(/[,;]/);
  const vistos = new Set<string>();
  const nombres: string[] = [];
  for (const parte of partes) {
    const nombre = parte.replace(/\s+/g, ' ').trim();
    const clave = nombre.toLowerCase();
    if (!nombre || vistos.has(clave)) continue;
    vistos.add(clave);
    nombres.push(nombre);
  }
  return nombres;
}

/** Nombres de las adicionales como van en la columna CATEGORIAS_EXTRA. */
export function unirNombresCategorias(categorias: CategoriaResumen[]): string {
  return categorias.map((c) => c.nombre).join(' | ');
}

/**
 * Celda CATEGORIA del Excel con subcategoría: "Peluches > Osos" →
 * ["Peluches", "Osos"]. Sin ">", un solo nombre. Más de un nivel se recorta a
 * los dos primeros (solo hay un nivel de subcategorías).
 */
export function separarRutaCategoria(valor: string): string[] {
  const partes = String(valor ?? '')
    .split('>')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return partes.slice(0, 2);
}
