/**
 * Disponibilidad y prioridad de venta: cómo se leen del Excel.
 *
 * El empresario no escribe enums. En la columna pone "BAJO PEDIDO", "bajo
 * pedido", "Muy Alta" o "3", y el importador tiene que entenderlo igual. Estas
 * funciones son puras para poder probar esas variantes sin levantar nada.
 */
import { DisponibilidadProducto } from '@prisma/client';

/** Texto comparable: sin tildes, sin mayúsculas, sin guiones ni dobles espacios. */
function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DISPONIBILIDADES: Record<string, DisponibilidadProducto> = {
  inmediata: 'INMEDIATA',
  inmediato: 'INMEDIATA',
  disponible: 'INMEDIATA',
  si: 'INMEDIATA',
  'en stock': 'INMEDIATA',
  'bajo pedido': 'BAJO_PEDIDO',
  'bajo reserva': 'BAJO_PEDIDO',
  'por encargo': 'BAJO_PEDIDO',
  encargo: 'BAJO_PEDIDO',
  'no disponible': 'NO_DISPONIBLE',
  agotado: 'NO_DISPONIBLE',
  'sin stock': 'NO_DISPONIBLE',
  no: 'NO_DISPONIBLE',
  // Descontinuado: distinto de agotado. Agotado puede volver; esto no, y por
  // eso no genera lista de espera.
  'no comercial': 'NO_COMERCIAL',
  descontinuado: 'NO_COMERCIAL',
  discontinuado: 'NO_COMERCIAL',
  'ya no se vende': 'NO_COMERCIAL',
  'fuera de catalogo': 'NO_COMERCIAL',
};

/**
 * Lee la columna DISPONIBILIDAD del Excel. `null` cuando viene vacía o no se
 * reconoce: el producto se queda sin valor explícito y la disponibilidad se
 * deduce del stock, que es el comportamiento de siempre.
 */
export function leerDisponibilidad(
  valor: unknown,
): DisponibilidadProducto | null {
  const limpio = normalizar(valor);
  if (!limpio) return null;
  return DISPONIBILIDADES[limpio] ?? null;
}

/**
 * Cuatro niveles, como los pidió el negocio. Antes eran tres y "baja" no
 * existía: un producto que se quiere mover poco quedaba igual que uno sin
 * preferencia.
 */
const PRIORIDADES: Record<string, number> = {
  'muy alta': 4,
  alta: 3,
  media: 2,
  normal: 2,
  baja: 1,
  '4': 4,
  '3': 3,
  '2': 2,
  '1': 1,
};

/**
 * Lee la columna PRIORIDAD. Acepta palabras o el número directo. `null` si
 * viene vacía o fuera de rango: sin prioridad, el producto se ordena por
 * relevancia como cualquier otro.
 */
export function leerPrioridadVenta(valor: unknown): number | null {
  const limpio = normalizar(valor);
  if (!limpio) return null;
  const prioridad = PRIORIDADES[limpio];
  return prioridad ?? null;
}

/** Cómo se escribe de vuelta en el Excel exportado (ida y vuelta sin pérdida). */
export function escribirPrioridadVenta(prioridad: number | null): string {
  if (prioridad === 4) return 'MUY ALTA';
  if (prioridad === 3) return 'ALTA';
  if (prioridad === 2) return 'MEDIA';
  if (prioridad === 1) return 'BAJA';
  return '';
}

/**
 * La disponibilidad efectiva de un producto. Si no se fijó a mano, se deduce
 * del stock: quien lleva inventario real no tiene que mantener dos campos en
 * sincronía.
 */
export function disponibilidadEfectiva(producto: {
  disponibilidad?: DisponibilidadProducto | null;
  stock?: unknown;
}): DisponibilidadProducto {
  if (producto.disponibilidad) return producto.disponibilidad;
  return Number(producto.stock ?? 0) > 0 ? 'INMEDIATA' : 'NO_DISPONIBLE';
}
