import { baseDeGanancia, margen, valorizarPartida } from './valorizar-inventario';

describe('valorizarPartida', () => {
  const gravado = { stock: 10, costoNeto: 10, precioVenta: 23.6, gravado: true };

  it('valor a costo es de bolsillo (con IGV) y a venta con el precio de lista', () => {
    const v = valorizarPartida(gravado, 'CON_IGV');
    expect(v.costoDeBolsillo).toBe(11.8);
    expect(v.valorCosto).toBeCloseTo(118);
    expect(v.valorVenta).toBeCloseTo(236);
  });

  it('ganancia con IGV = precio − costo de bolsillo', () => {
    expect(valorizarPartida(gravado, 'CON_IGV').gananciaPotencial).toBeCloseTo(118);
  });

  it('ganancia sin IGV = precio sin IGV − costo neto', () => {
    const v = valorizarPartida(gravado, 'SIN_IGV');
    expect(v.gananciaPotencial).toBeCloseTo(100); // 10 × (20 − 10)
    expect(v.ventaBaseGanancia).toBeCloseTo(200);
  });

  it('exonerado no lleva IGV en ninguna base', () => {
    const p = { stock: 5, costoNeto: 4, precioVenta: 10, gravado: false };
    expect(valorizarPartida(p, 'CON_IGV').gananciaPotencial).toBeCloseTo(30);
    expect(valorizarPartida(p, 'SIN_IGV').gananciaPotencial).toBeCloseTo(30);
    expect(valorizarPartida(p, 'CON_IGV').valorCosto).toBeCloseTo(20);
  });

  it('sin costo o sin precio no suma ganancia, pero sí se marca', () => {
    const sinCosto = valorizarPartida({ ...gravado, costoNeto: 0 }, 'CON_IGV');
    expect(sinCosto.gananciaPotencial).toBe(0);
    expect(sinCosto.sinCosto).toBe(true);
    expect(sinCosto.valorVenta).toBeCloseTo(236);
    const sinPrecio = valorizarPartida({ ...gravado, precioVenta: 0 }, 'CON_IGV');
    expect(sinPrecio.gananciaPotencial).toBe(0);
    expect(sinPrecio.sinPrecio).toBe(true);
  });

  it('stock negativo o cero no da ganancia', () => {
    expect(valorizarPartida({ ...gravado, stock: -3 }, 'CON_IGV').gananciaPotencial).toBe(0);
    expect(valorizarPartida({ ...gravado, stock: 0 }, 'CON_IGV').gananciaPotencial).toBe(0);
  });

  it('la base sigue el criterio de IGV de la empresa', () => {
    expect(baseDeGanancia('TODOS')).toBe('SIN_IGV');
    expect(baseDeGanancia('ELECTRONICOS')).toBe('CON_IGV');
    expect(baseDeGanancia('NINGUNO')).toBe('CON_IGV');
  });

  it('margen sobre la venta y 0 sin venta', () => {
    expect(margen(50, 200)).toBe(25);
    expect(margen(10, 0)).toBe(0);
  });
});
