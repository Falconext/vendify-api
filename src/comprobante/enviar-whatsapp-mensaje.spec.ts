import { ComprobanteService } from './comprobante.service';

/** El texto que escribió el negocio es el que acompaña al PDF en WhatsApp. */
describe('Comprobante por WhatsApp: mensaje del negocio', () => {
  const enviar = async (mensaje?: string) => {
    const service = Object.create(ComprobanteService.prototype);
    service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service.cargarComprobanteCompleto = jest.fn().mockResolvedValue({
      empresaId: 1,
      tipoDoc: 'NV',
      serie: 'NV01',
      correlativo: 7,
      mtoImpVenta: 50,
      cliente: { nombre: 'Rosa' },
      empresa: { razonSocial: 'Mi Negocio' },
    });
    service.getWhatsAppCredentials = jest
      .fn()
      .mockResolvedValue({ token: 't', phoneNumberId: 'p', source: 'META' });
    service.generarYSubirPdf = jest.fn().mockResolvedValue('https://s3/pdf');
    let enviado: any;
    (global as any).fetch = jest.fn(async (url: string, init?: any) => {
      if (url === 'https://s3/pdf') {
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
      }
      if (url.endsWith('/media')) {
        return { ok: true, json: async () => ({ id: 'm1' }) };
      }
      enviado = JSON.parse(init.body);
      return { ok: true, json: async () => ({ messages: [{ id: 'x' }] }) };
    });
    await service.enviarWhatsAppComprobante(7, '991065217', { empresaId: 1 }, mensaje);
    return enviado.document.caption;
  };

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('usa el texto escrito', async () => {
    await expect(enviar('Hola Rosa, ya salió tu pedido')).resolves.toBe('Hola Rosa, ya salió tu pedido');
  });

  it('vacío o solo espacios: el texto de siempre', async () => {
    await expect(enviar()).resolves.toContain('aquí está tu Nota de Venta NV01-00000007');
    await expect(enviar('   ')).resolves.toContain('Gracias por tu preferencia — Mi Negocio');
  });
});
