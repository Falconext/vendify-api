import { filaResumenAnual, totalResumenAnual } from './resumen-anual';

/** Pedido KREZKA 02-11: ganancia con y sin IGV por mes, y el total del año. */
describe('resumen anual de ganancias', () => {
  const pnl = (o: Partial<any> = {}) => ({
    ventasNetas: 1000,
    ventasConIgv: 1180,
    igvVentas: 180,
    costoMercaderia: 400,
    gananciaBruta: 600,
    otrosIngresos: 0,
    gastosTotales: 300,
    comprasConsumo: 100,
    gananciaNeta: 300,
    margenNeto: 30,
    ...o,
  });

  it('con IGV = ganancia neta + IGV cobrado; gastos operativos sin las compras', () => {
    const f = filaResumenAnual(1, pnl());
    expect(f).toMatchObject({
      mes: 1,
      gananciaNeta: 300,
      gananciaConIgv: 480,
      gastosOperativos: 200,
      comprasConsumo: 100,
    });
  });

  it('el total suma los meses y el margen sale de los totales', () => {
    const t = totalResumenAnual([
      filaResumenAnual(1, pnl()),
      filaResumenAnual(
        2,
        pnl({
          ventasNetas: 3000,
          gananciaNeta: -100,
          igvVentas: 540,
          margenNeto: -3.33,
        }),
      ),
    ]);
    expect(t.gananciaNeta).toBe(200);
    expect(t.gananciaConIgv).toBe(200 + 720);
    expect(t.margenNeto).toBe(5);
  });

  it('un mes sin ventas no rompe el margen', () => {
    expect(totalResumenAnual([]).margenNeto).toBe(0);
  });
});
