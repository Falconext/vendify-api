import { costoSegunCriterio, ingresoLineaSinIgv } from './igv-ventas';

describe('El costo va en la misma base que la venta (OWENSOFT, 01-11)', () => {
  // Cargador: costo S/ 15 con IGV → se guarda 12.7119 sin IGV; se vende a S/ 45.
  const COSTO = 15 / 1.18;
  const venta = (tipoDoc: string, criterio: any) =>
    ingresoLineaSinIgv(tipoDoc, { cantidad: 1, mtoPrecioUnitario: 45, mtoValorVenta: 38.14, tipAfeIgv: 10 }, criterio);
  const ganancia = (tipoDoc: string, criterio: any, afe = '10') =>
    Math.round((venta(tipoDoc, criterio) - costoSegunCriterio(COSTO, tipoDoc, criterio, afe)) * 100) / 100;

  it('nota de venta sin descontar IGV: S/ 45 − S/ 15 = S/ 30 (antes S/ 32.29)', () => {
    expect(ganancia('NV', 'ELECTRONICOS')).toBe(30);
    expect(ganancia('NV', 'NINGUNO')).toBe(30);
    expect(ganancia('03', 'NINGUNO')).toBe(30);
  });

  it('descontando IGV, todo sin IGV: S/ 38.14 − S/ 12.71 = S/ 25.43', () => {
    expect(ganancia('03', 'ELECTRONICOS')).toBe(25.43);
    expect(ganancia('NV', 'TODOS')).toBe(25.43);
  });

  it('un producto exonerado no pagó IGV al comprarse: su costo no sube', () => {
    expect(costoSegunCriterio(10, 'NV', 'NINGUNO', '20')).toBe(10);
    expect(costoSegunCriterio(10, 'NV', 'NINGUNO', null)).toBeCloseTo(11.8, 6);
  });
});
