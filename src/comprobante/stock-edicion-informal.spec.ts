import { stockEnEdicion } from './stock-edicion-informal';

describe('stockEnEdicion', () => {
  it('una NV mueve la diferencia como siempre', () => {
    expect(stockEnEdicion({ tipoDoc: 'NV', yaDescontoStock: true })).toEqual({
      contarAnterior: true,
      contarNueva: true,
    });
    // Una NV solo de servicios no tiene SALIDAs y sigue la misma regla.
    expect(stockEnEdicion({ tipoDoc: 'NV', yaDescontoStock: false })).toEqual({
      contarAnterior: true,
      contarNueva: true,
    });
  });

  it('una NP que nunca descontó y se marca la casilla descuenta todo lo nuevo', () => {
    expect(
      stockEnEdicion({ tipoDoc: 'NP', yaDescontoStock: false, descontarStock: true }),
    ).toEqual({ contarAnterior: false, contarNueva: true });
  });

  it('una NP que nunca descontó, sin casilla, no toca el stock aunque cambie la cantidad', () => {
    expect(stockEnEdicion({ tipoDoc: 'NP', yaDescontoStock: false })).toEqual({
      contarAnterior: false,
      contarNueva: false,
    });
  });

  it('una NP que ya descontó mueve la diferencia y desmarcar no la devuelve', () => {
    expect(
      stockEnEdicion({ tipoDoc: 'NP', yaDescontoStock: true, descontarStock: false }),
    ).toEqual({ contarAnterior: true, contarNueva: true });
  });

  it('una OT sin descuento sigue sin descontar al editarse', () => {
    expect(
      stockEnEdicion({ tipoDoc: 'OT', yaDescontoStock: false, descontarStock: true }),
    ).toEqual({ contarAnterior: false, contarNueva: false });
  });
});
