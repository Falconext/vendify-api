/**
 * Órganos y sistemas sobre los que actúa un producto (naturistas).
 *
 * Hierba Sana, 08-11: los clientes buscan por lo que les duele ("hígado",
 * "próstata", "sistema digestivo"), no por el nombre del producto. El dato
 * venía en su Excel y solo lo tenía la IA de Ventas; la tienda no lo veía.
 *
 * Se guarda como texto separado por comas en Producto.organos/sistemas: el
 * buscador lo lee con el mismo `contains` que el nombre, y los chips del
 * filtro salen de contar los valores de todo el catálogo publicado.
 */
import type { Prisma } from '@prisma/client';

/** "Hígado, Colon;corazón" → ["Hígado", "Colon", "corazón"], sin vacíos ni repetidos. */
export function separarValores(texto: string | null | undefined): string[] {
  const vistos = new Map<string, string>();
  for (const v of String(texto ?? '').split(/[,;]/)) {
    const limpio = v.replace(/\s+/g, ' ').trim();
    if (limpio && !vistos.has(limpio.toLowerCase())) vistos.set(limpio.toLowerCase(), limpio);
  }
  return [...vistos.values()];
}

/** Lo que se guarda: los valores limpios unidos por ", ", o null si no hay ninguno. */
export function valoresParaGuardar(texto: unknown): string | null | undefined {
  if (texto === undefined) return undefined;
  if (texto === null) return null;
  const v = separarValores(String(texto)).join(', ');
  return v ? v.slice(0, 500) : null;
}

export interface OpcionFiltro {
  nombre: string;
  cantidad: number;
}

/** Cuenta cada órgano y sistema en los productos; el más frecuente primero. */
export function contarOrganosSistemas(
  productos: { organos: string | null; sistemas: string | null }[],
): { organos: OpcionFiltro[]; sistemas: OpcionFiltro[] } {
  const contar = (campo: 'organos' | 'sistemas') => {
    const cuenta = new Map<string, OpcionFiltro>();
    for (const p of productos) {
      for (const v of separarValores(p[campo])) {
        const k = v.toLowerCase();
        const o = cuenta.get(k);
        if (o) o.cantidad++;
        else cuenta.set(k, { nombre: v, cantidad: 1 });
      }
    }
    return [...cuenta.values()].sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'));
  };
  return { organos: contar('organos'), sistemas: contar('sistemas') };
}

/**
 * Filtro del catálogo: dentro de cada grupo basta uno (OR) y entre órganos y
 * sistemas deben cumplirse los dos (AND), igual que marcas y categorías.
 */
export function filtroOrganosSistemas(organo = '', sistema = ''): Prisma.ProductoWhereInput[] {
  const grupo = (campo: 'organos' | 'sistemas', lista: string) => {
    const valores = separarValores(lista);
    return valores.length
      ? [{ OR: valores.map((v) => ({ [campo]: { contains: v, mode: 'insensitive' as const } })) }]
      : [];
  };
  return [...grupo('organos', organo), ...grupo('sistemas', sistema)];
}
