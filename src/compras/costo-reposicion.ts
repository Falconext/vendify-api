/**
 * Costo de reposición de lo que se compra en dólares (pedido 2026-11-03).
 *
 * El costo del producto queda en soles al TC de la compra (costo histórico, ver
 * compras.service): compró US$ 100 a 3.76 → S/ 376, y ahí se queda. Eso está
 * bien para la contabilidad, pero el empresario pone precios con ese número
 * aunque el dólar ya esté en 3.40 o en 4.00. La pregunta que importa para fijar
 * el precio es otra: ¿cuánto me cuesta VOLVER a comprarlo hoy?
 *
 *   reponer hoy     = costo US$ × TC de hoy
 *   precio sugerido = costo US$ × (TC de hoy + colchón) ÷ (1 − margen) [+ IGV]
 *
 * El margen es sobre el precio de venta (30 % = de cada S/ 100 vendidos quedan
 * S/ 30), que es como lo piensa quien vende. Todo neto de IGV; el IGV se suma al
 * final solo si el producto es gravado.
 *
 * Vive aparte del servicio para poder probarse sin Prisma.
 */

export interface ConfigCostoReposicion {
  /** % que tiene que moverse el dólar desde la compra para avisar. */
  umbralPct: number;
  /** Margen deseado sobre el precio de venta, en %. */
  margenObjetivoPct: number;
  /** Soles que se suman al TC del día para fijar precios (colchón). */
  colchonTc: number;
}

export const CONFIG_POR_DEFECTO: ConfigCostoReposicion = {
  umbralPct: 3,
  margenObjetivoPct: 30,
  colchonTc: 0,
};

/**
 * - riesgo: el dólar subió ≥ umbral y el margen sobre lo que cuesta reponer ya
 *   no llega al objetivo. Es el caso que hace perder plata sin darse cuenta.
 * - margen-bajo: el dólar no se movió tanto, pero el precio igual no deja el
 *   margen objetivo.
 * - bajo: el dólar bajó ≥ umbral; reponer cuesta menos (puede competir en precio).
 * - ok: nada que hacer.
 */
export type EstadoReposicion = 'riesgo' | 'margen-bajo' | 'bajo' | 'ok';

export interface ProductoReposicion {
  id: number;
  codigo: string;
  descripcion: string;
  /** Moneda del precio de venta. */
  moneda: string;
  /** Precio de venta (con IGV si es gravado), en `moneda`. */
  precioUnitario: number;
  tipoAfectacionIGV: string;
  igvPorcentaje?: number | null;
  stock?: number | null;
}

export interface UltimaCompraUsd {
  /** Costo unitario NETO (sin IGV) en US$, como se guarda en DetalleCompra. */
  costoUsd: number;
  tipoCambio: number;
  fecha: Date | string;
  documento: string;
}

export interface FilaReposicion {
  productoId: number;
  codigo: string;
  descripcion: string;
  moneda: string;
  stock: number;
  gravado: boolean;
  costoUsd: number;
  tcCompra: number;
  fechaCompra: string;
  documentoCompra: string;
  /** Costo neto en soles al TC de la compra (lo que se pagó). */
  costoCompraSoles: number;
  /** Costo neto en soles al TC de hoy (lo que costaría volver a comprarlo). */
  costoReposicionSoles: number;
  variacionTcPct: number;
  /** Precio actual con IGV, en soles (un precio en US$ se convierte al TC de hoy). */
  precioActualSoles: number;
  /** Margen del precio actual sobre lo que costó. */
  margenCompraPct: number | null;
  /** Margen del precio actual sobre lo que cuesta reponer hoy. */
  margenReposicionPct: number | null;
  /** Precio con IGV que deja el margen objetivo, en la moneda del producto. */
  precioSugerido: number;
  precioSugeridoSoles: number;
  /** Sobre qué costo se sugirió: el de reponer, o el pagado si queda stock más caro. */
  sugeridoSobre: 'reposicion' | 'compra';
  estado: EstadoReposicion;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Gravado = afectación que empieza en 1 (10 gravado, 11-17 gravado gratuito…). */
export const esGravado = (afectacion?: string | null) =>
  String(afectacion ?? '10').trim().startsWith('1');

/**
 * Redondea un precio hacia arriba a los 10 céntimos: el sugerido nunca deja
 * menos margen que el pedido por culpa del redondeo.
 */
export const redondearPrecio = (n: number) => Math.ceil(r2(n) * 10 - 1e-9) / 10;

const margen = (precioNeto: number, costo: number) =>
  precioNeto > 0 ? r1(((precioNeto - costo) / precioNeto) * 100) : null;

export function calcularFila(
  producto: ProductoReposicion,
  compra: UltimaCompraUsd,
  tcHoy: number,
  config: ConfigCostoReposicion = CONFIG_POR_DEFECTO,
): FilaReposicion {
  const gravado = esGravado(producto.tipoAfectacionIGV);
  const factorIgv = gravado ? 1 + Number(producto.igvPorcentaje ?? 18) / 100 : 1;
  const enDolares = producto.moneda === 'USD';

  const costoCompraSoles = r2(compra.costoUsd * compra.tipoCambio);
  const costoReposicionSoles = r2(compra.costoUsd * tcHoy);
  const variacionTcPct = r1(((tcHoy - compra.tipoCambio) / compra.tipoCambio) * 100);

  const precioActualSoles = r2(producto.precioUnitario * (enDolares ? tcHoy : 1));
  const precioActualNeto = precioActualSoles / factorIgv;
  const margenCompraPct = margen(precioActualNeto, costoCompraSoles);
  const margenReposicionPct = margen(precioActualNeto, costoReposicionSoles);

  // Un margen de 100 % o más no tiene precio que lo cumpla: se topa en 95 %.
  const m = Math.min(Math.max(config.margenObjetivoPct, 0), 95) / 100;
  // Si el dólar bajó pero todavía queda mercadería comprada más cara, el precio
  // se calcula sobre lo que se pagó: bajar al costo de reponer haría vender ese
  // stock con menos margen del buscado. Sin stock, manda reponer.
  const costoReponerConColchon = compra.costoUsd * (tcHoy + Math.max(config.colchonTc, 0));
  const quedaStockCaro = Number(producto.stock ?? 0) > 0 && costoCompraSoles > costoReponerConColchon;
  const costoParaPrecio = quedaStockCaro ? costoCompraSoles : costoReponerConColchon;
  const sugeridoSolesExacto = (costoParaPrecio / (1 - m)) * factorIgv;
  const precioSugerido = enDolares
    ? redondearPrecio(sugeridoSolesExacto / tcHoy)
    : redondearPrecio(sugeridoSolesExacto);
  const precioSugeridoSoles = r2(enDolares ? precioSugerido * tcHoy : precioSugerido);

  const debajoDelObjetivo =
    margenReposicionPct === null || margenReposicionPct < config.margenObjetivoPct;
  let estado: EstadoReposicion = 'ok';
  if (variacionTcPct >= config.umbralPct && debajoDelObjetivo) estado = 'riesgo';
  else if (debajoDelObjetivo) estado = 'margen-bajo';
  else if (variacionTcPct <= -config.umbralPct) estado = 'bajo';

  return {
    productoId: producto.id,
    codigo: producto.codigo,
    descripcion: producto.descripcion,
    moneda: producto.moneda,
    stock: Number(producto.stock ?? 0),
    gravado,
    costoUsd: r2(compra.costoUsd),
    tcCompra: compra.tipoCambio,
    fechaCompra: new Date(compra.fecha).toISOString(),
    documentoCompra: compra.documento,
    costoCompraSoles,
    costoReposicionSoles,
    variacionTcPct,
    precioActualSoles,
    margenCompraPct,
    margenReposicionPct,
    precioSugerido,
    precioSugeridoSoles,
    sugeridoSobre: quedaStockCaro ? 'compra' : 'reposicion',
    estado,
  };
}

/** Lo que cuesta un precio en `valorUnitario` (sin IGV), como lo guarda el producto. */
export const valorSinIgv = (precio: number, afectacion: string, igvPorcentaje?: number | null) =>
  esGravado(afectacion) ? Number((precio / (1 + Number(igvPorcentaje ?? 18) / 100)).toFixed(4)) : precio;

/** Orden de la lista: primero lo que hace perder plata. */
const PRIORIDAD: Record<EstadoReposicion, number> = { riesgo: 0, 'margen-bajo': 1, bajo: 2, ok: 3 };
export const ordenarFilas = (filas: FilaReposicion[]) =>
  [...filas].sort(
    (a, b) => PRIORIDAD[a.estado] - PRIORIDAD[b.estado] || b.variacionTcPct - a.variacionTcPct,
  );

export const resumenFilas = (filas: FilaReposicion[]) => ({
  total: filas.length,
  riesgo: filas.filter((f) => f.estado === 'riesgo').length,
  margenBajo: filas.filter((f) => f.estado === 'margen-bajo').length,
  bajo: filas.filter((f) => f.estado === 'bajo').length,
});
