import { direccionSedeParaImprimir } from './direccion-sede';

describe('direccionSedeParaImprimir', () => {
  const fiscal = 'Calle Guevara Ochoa 1253 Urb San Fernando-Trujillo';

  it('oculta la sede si es la misma calle sin el distrito (ITOUCHSHOP)', () => {
    expect(direccionSedeParaImprimir('CALLE GUEVARA OCHOA 1253 URB SAN FERNANDO', fiscal)).toBe('');
  });

  it('oculta la sede idéntica, aunque cambien mayúsculas, tildes o signos', () => {
    expect(direccionSedeParaImprimir('calle guevara ochoa 1253, urb. san fernando - trujillo', fiscal)).toBe('');
    expect(direccionSedeParaImprimir('Av. Perú 120', 'AV PERU 120')).toBe('');
  });

  it('oculta la sede cuando la fiscal está contenida en ella', () => {
    expect(direccionSedeParaImprimir('AV LARCO 1116 MIRAFLORES LIMA', 'Av. Larco 1116')).toBe('');
  });

  it('muestra la sede si es otro local', () => {
    expect(direccionSedeParaImprimir('Jr. Los Alpes 385 Mz P Lt 3', fiscal)).toBe('JR. LOS ALPES 385 MZ P LT 3');
  });

  it('no confunde números parecidos (125 no es parte de 1253)', () => {
    expect(direccionSedeParaImprimir('CALLE GUEVARA OCHOA 125', fiscal)).toBe('CALLE GUEVARA OCHOA 125');
  });

  it('sin dirección de sede no imprime nada', () => {
    expect(direccionSedeParaImprimir('', fiscal)).toBe('');
    expect(direccionSedeParaImprimir(null, fiscal)).toBe('');
  });

  it('sin dirección fiscal imprime la de la sede', () => {
    expect(direccionSedeParaImprimir('Av. Perú 120', '')).toBe('AV. PERÚ 120');
  });
});
