/**
 * Utilidad por día, completa.
 *
 * `resumenDiario` del P&L solo trae los días que tuvieron ventas o gastos, y la
 * pantalla mostraba siete. Para el reporte día por día se completan TODOS los
 * días del período (hasta hoy, si el período no terminó) con ceros, así el
 * empresario ve también los días que no vendió.
 *
 * La suma de los días no siempre es la ganancia neta del período: los otros
 * ingresos y los gastos sin fecha (los del mes) no caen en ningún día. Esa
 * diferencia se informa aparte como ajuste, para que el total cuadre con
 * Rentabilidad al centavo.
 */

export interface DiaUtilidad {
  fecha: string;
  ventasNetas: number;
  costoMercaderia: number;
  gananciaBruta: number;
  margenBruto: number;
  publicidad: number;
  otrosGastos: number;
  gastosOperativos: number;
  gananciaNeta: number;
  margenNeto: number;
  pedidos: number;
}

export interface TotalUtilidad {
  ventasNetas: number;
  costoMercaderia: number;
  gananciaBruta: number;
  margenBruto: number;
  gastosOperativos: number;
  gananciaNeta: number;
  margenNeto: number;
  pedidos: number;
  diasConVenta: number;
  diasSinVenta: number;
  /** Ganancia neta del período − la suma de los días. */
  ajustesSinDia: number;
  gananciaNetaPeriodo: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (parte: number, total: number) =>
  total > 0 ? r2((parte / total) * 100) : 0;

const DIA_VACIO = (fecha: string): DiaUtilidad => ({
  fecha,
  ventasNetas: 0,
  costoMercaderia: 0,
  gananciaBruta: 0,
  margenBruto: 0,
  publicidad: 0,
  otrosGastos: 0,
  gastosOperativos: 0,
  gananciaNeta: 0,
  margenNeto: 0,
  pedidos: 0,
});

/** YYYY-MM-DD del día siguiente, sin pasar por zona horaria. */
const siguiente = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + 1));
  return f.toISOString().slice(0, 10);
};

/**
 * Todos los días de `inicio` a `fin` (o a `hoy`, si es antes), del más
 * reciente al más antiguo como el resto del P&L.
 */
export function completarDias(
  dias: Array<Partial<DiaUtilidad> & { fecha: string }>,
  inicio: string,
  fin: string,
  hoy: string,
): DiaUtilidad[] {
  const tope = fin < hoy ? fin : hoy;
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const salida: DiaUtilidad[] = [];
  // Tope de seguridad: un rango mal armado no debe colgar el servidor.
  for (let k = inicio, n = 0; k <= tope && n < 1100; k = siguiente(k), n++) {
    const d = porFecha.get(k);
    salida.push(d ? { ...DIA_VACIO(k), ...d, fecha: k } : DIA_VACIO(k));
  }
  // Un día con datos fuera del rango (no debería pasar) no se pierde.
  for (const d of dias) {
    if (d.fecha < inicio || d.fecha > tope) {
      salida.push({ ...DIA_VACIO(d.fecha), ...d });
    }
  }
  return salida.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function totalizarDias(
  dias: DiaUtilidad[],
  gananciaNetaPeriodo: number,
): TotalUtilidad {
  const suma = (k: keyof DiaUtilidad) =>
    r2(dias.reduce((acc, d) => acc + Number(d[k] || 0), 0));
  const ventasNetas = suma('ventasNetas');
  const gananciaBruta = suma('gananciaBruta');
  const gananciaNeta = suma('gananciaNeta');
  const diasConVenta = dias.filter((d) => d.pedidos > 0).length;
  return {
    ventasNetas,
    costoMercaderia: suma('costoMercaderia'),
    gananciaBruta,
    margenBruto: pct(gananciaBruta, ventasNetas),
    gastosOperativos: suma('gastosOperativos'),
    gananciaNeta,
    margenNeto: pct(gananciaNeta, ventasNetas),
    pedidos: dias.reduce((acc, d) => acc + (d.pedidos || 0), 0),
    diasConVenta,
    diasSinVenta: dias.length - diasConVenta,
    ajustesSinDia: r2(gananciaNetaPeriodo - gananciaNeta),
    gananciaNetaPeriodo: r2(gananciaNetaPeriodo),
  };
}
