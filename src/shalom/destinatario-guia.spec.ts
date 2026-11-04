import { destinatarioNoCuadra } from './destinatario-guia';

const cliente = { clienteNombre: 'DIAZ ALTAMIRANO, SOLEDAD YASMINA', clienteDocumento: '73479180' };

describe('destinatario de la guía', () => {
  it('otro nombre sin DNI propio no cuadra (NV01-47 de ZABDI)', () => {
    expect(destinatarioNoCuadra({ ...cliente, nombreDestinatario: 'ALFARO AVILA, ELIZABETH' })).toBe(true);
  });

  it('otro nombre con el DNI del cliente tampoco (NV01-44 de ZABDI)', () => {
    expect(destinatarioNoCuadra({ ...cliente, nombreDestinatario: 'SANCHEZ CUBAS, SANDRA', dniDestinatario: '73479180' })).toBe(true);
  });

  it('mandarle a un tercero con su DNI es válido', () => {
    expect(destinatarioNoCuadra({ ...cliente, nombreDestinatario: 'ALFARO AVILA, ELIZABETH', dniDestinatario: '40000000' })).toBe(false);
  });

  it('el mismo cliente escrito distinto cuadra', () => {
    expect(destinatarioNoCuadra({ ...cliente, nombreDestinatario: 'Soledad Díaz' })).toBe(false);
    expect(destinatarioNoCuadra({ ...cliente, nombreDestinatario: 'SOLEDAD YASMINA DIAZ ALTAMIRANO' })).toBe(false);
  });

  it('sin destinatario escrito o con cliente genérico no aplica', () => {
    expect(destinatarioNoCuadra({ ...cliente, nombreDestinatario: '' })).toBe(false);
    expect(destinatarioNoCuadra({ clienteNombre: 'CLIENTES VARIOS', clienteDocumento: '10000000', nombreDestinatario: 'LUIS PEREZ' })).toBe(false);
    expect(destinatarioNoCuadra({ clienteNombre: 'WSP 987654321', nombreDestinatario: 'LUIS PEREZ' })).toBe(false);
  });
});
