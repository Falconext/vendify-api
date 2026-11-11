/**
 * Estado de fabricación de una orden de trabajo (Comprobante.estadoOT).
 *
 * La OT nace PENDIENTE; las antiguas pueden tener null, que cuenta igual. El
 * panel solo mostraba el estado del despacho y no había dónde marcar en qué va
 * la fabricación (Pierre, 10-11).
 */
export const ESTADOS_OT = [
  'PENDIENTE',
  'EN_PROCESO',
  'LISTO',
  'ENTREGADO',
] as const;
export type EstadoOT = (typeof ESTADOS_OT)[number];

export const esEstadoOT = (v: unknown): v is EstadoOT =>
  ESTADOS_OT.includes(v as EstadoOT);

/** Condición de Prisma para listar las OT en un estado; null si no aplica. */
export function filtroEstadoOT(estado?: string | null) {
  if (!esEstadoOT(estado)) return null;
  if (estado === 'PENDIENTE')
    return { OR: [{ estadoOT: null }, { estadoOT: 'PENDIENTE' }] };
  return { estadoOT: estado };
}
