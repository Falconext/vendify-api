/**
 * Resumen anual de ganancias (KREZKA, 02-11): una fila por mes y el total.
 * Cada fila sale del P&L de ese mes; aquí solo se elige qué mostrar y se suma.
 */

export interface ResumenAnualMes {
  mes: number;
  ventasNetas: number;
  ventasConIgv: number;
  igvVentas: number;
  costoMercaderia: number;
  gananciaBruta: number;
  otrosIngresos: number;
  /** Gastos operativos registrados (sin las compras de consumo). */
  gastosOperativos: number;
  /** Compras de consumo propio (netas). Las de "solo IGV" no están. */
  comprasConsumo: number;
  /** Ganancia neta, sin IGV: la de Rentabilidad. */
  gananciaNeta: number;
  /** Ganancia neta + IGV cobrado en ventas: lo que debió entrar a la cuenta. */
  gananciaConIgv: number;
  margenNeto: number;
}

export interface ResumenAnual {
  anio: number;
  meses: ResumenAnualMes[];
  total: Omit<ResumenAnualMes, 'mes'>;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

interface PnlDelMes {
  ventasNetas: number;
  ventasConIgv?: number;
  igvVentas?: number;
  costoMercaderia: number;
  gananciaBruta: number;
  otrosIngresos: number;
  gastosTotales: number;
  comprasConsumo?: number;
  gananciaNeta: number;
  margenNeto: number;
}

export function filaResumenAnual(mes: number, p: PnlDelMes): ResumenAnualMes {
  const igv = Number(p.igvVentas ?? 0) || 0;
  const compras = Number(p.comprasConsumo ?? 0) || 0;
  return {
    mes,
    ventasNetas: r2(p.ventasNetas),
    ventasConIgv: r2(p.ventasConIgv ?? p.ventasNetas),
    igvVentas: r2(igv),
    costoMercaderia: r2(p.costoMercaderia),
    gananciaBruta: r2(p.gananciaBruta),
    otrosIngresos: r2(p.otrosIngresos),
    gastosOperativos: r2(p.gastosTotales - compras),
    comprasConsumo: r2(compras),
    gananciaNeta: r2(p.gananciaNeta),
    gananciaConIgv: r2(p.gananciaNeta + igv),
    margenNeto: r2(p.margenNeto),
  };
}

export function totalResumenAnual(
  meses: ResumenAnualMes[],
): ResumenAnual['total'] {
  const suma = (k: keyof ResumenAnualMes) =>
    r2(meses.reduce((a, m) => a + (Number(m[k]) || 0), 0));
  const ventasNetas = suma('ventasNetas');
  const gananciaNeta = suma('gananciaNeta');
  return {
    ventasNetas,
    ventasConIgv: suma('ventasConIgv'),
    igvVentas: suma('igvVentas'),
    costoMercaderia: suma('costoMercaderia'),
    gananciaBruta: suma('gananciaBruta'),
    otrosIngresos: suma('otrosIngresos'),
    gastosOperativos: suma('gastosOperativos'),
    comprasConsumo: suma('comprasConsumo'),
    gananciaNeta,
    gananciaConIgv: suma('gananciaConIgv'),
    // El margen del año sale de los totales, no de promediar los meses.
    margenNeto: ventasNetas > 0 ? r2((gananciaNeta / ventasNetas) * 100) : 0,
  };
}
