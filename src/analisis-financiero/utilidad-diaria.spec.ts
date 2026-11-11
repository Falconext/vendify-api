import { completarDias, totalizarDias } from './utilidad-diaria';

const dia = (fecha: string, ventas: number, costo: number, gastos = 0, pedidos = 1) => ({
  fecha,
  ventasNetas: ventas,
  costoMercaderia: costo,
  gananciaBruta: ventas - costo,
  margenBruto: 0,
  publicidad: 0,
  otrosGastos: gastos,
  gastosOperativos: gastos,
  gananciaNeta: ventas - costo - gastos,
  margenNeto: 0,
  pedidos,
});

describe('completarDias', () => {
  it('rellena los días sin venta y ordena del más reciente', () => {
    const r = completarDias([dia('2026-11-03', 100, 60)], '2026-11-01', '2026-11-30', '2026-11-04');
    expect(r.map((d) => d.fecha)).toEqual(['2026-11-04', '2026-11-03', '2026-11-02', '2026-11-01']);
    expect(r[1].ventasNetas).toBe(100);
    expect(r[0].ventasNetas).toBe(0);
  });
  it('un mes pasado va completo, con cambio de mes y año bisiesto', () => {
    expect(completarDias([], '2028-02-01', '2028-02-29', '2028-05-01')).toHaveLength(29);
    expect(completarDias([], '2026-12-30', '2027-01-02', '2027-05-01').map((d) => d.fecha)).toEqual([
      '2027-01-02', '2027-01-01', '2026-12-31', '2026-12-30',
    ]);
  });
  it('un período futuro no inventa días', () => {
    expect(completarDias([], '2026-12-01', '2026-12-31', '2026-11-07')).toHaveLength(0);
  });
});

describe('totalizarDias', () => {
  it('suma, calcula márgenes y cuadra con la ganancia del período', () => {
    const dias = completarDias(
      [dia('2026-11-01', 100, 60, 10), dia('2026-11-03', 300, 150, 0, 2)],
      '2026-11-01', '2026-11-03', '2026-11-30',
    );
    const t = totalizarDias(dias, 150);
    expect(t.ventasNetas).toBe(400);
    expect(t.costoMercaderia).toBe(210);
    expect(t.gananciaBruta).toBe(190);
    expect(t.margenBruto).toBe(47.5);
    expect(t.gananciaNeta).toBe(180);
    expect(t.pedidos).toBe(3);
    expect(t.diasConVenta).toBe(2);
    expect(t.diasSinVenta).toBe(1);
    // gasto del mes sin día: 180 − 30 = 150
    expect(t.ajustesSinDia).toBe(-30);
    expect(t.gananciaNetaPeriodo).toBe(150);
  });
});
