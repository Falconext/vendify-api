import { OlvaService } from './olva.service';

describe('trackConCache', () => {
  it('encuentra el despacho aunque la guía se haya guardado con el año', async () => {
    const findFirst = jest.fn(async () => ({ id: 5 }));
    const update = jest.fn(async () => ({}));
    const prisma = { envioDespacho: { findFirst, update } };
    const api = {
      track: jest.fn(async () => ({
        data: { status: 'REGISTERED', events: [{ detail: 'Registrado' }] },
      })),
    };
    await new OlvaService(prisma as any, api as any).trackConCache('2965869-26');

    const donde = (findFirst.mock.calls[0] as any)[0].where;
    expect(donde.OR).toContainEqual({ nroOrden: { startsWith: '2965869-' } });
    expect((update.mock.calls[0] as any)[0].data.olvaEstado).toBe('registrado');
  });
});

describe('crearGuiaDesdeDespacho', () => {
  const agencias = [
    { codigo: '7', nombre: 'ORIGEN', label: 'ORIGEN', sedeId: '43' },
    { codigo: '145', nombre: 'MIRAFLORES', label: 'MIRAFLORES', sedeId: '43' },
  ];
  const montar = (envio: any = {}) => {
    const update = jest.fn(async ({ data }: any) => data);
    const prisma = {
      empresa: {
        findUnique: jest.fn(async () => ({
          ruc: '20100000001',
          razonSocial: 'MODA & LINEA S.A.C.',
          whatsappTienda: '999888777',
          olvaAgenciaOrigenCodigo: '7',
          plan: { features: [{ featureKey: 'tieneOlvaGuias', enabled: true }] },
        })),
      },
      usuario: {
        findFirst: jest.fn(async () => ({ email: 'dueno@mail.com' })),
      },
      envioDespacho: {
        findFirst: jest.fn(async () => ({
          id: 5,
          olvaAgenciaDestinoCodigo: '145',
          dniDestinatario: '47065472',
          nombreDestinatario: 'CLIENTE PRUEBA',
          celularDest: '991065217',
          pesoKg: 0.7,
          contenidoPaquete: 'Polos',
          comprobante: { mtoImpVenta: 80, detalles: [], cliente: {} },
          ...envio,
        })),
        update,
      },
    };
    const api = {
      configurado: true,
      getAgencias: jest.fn(async () => ({ data: agencias })),
      crearEnvio: jest.fn(async () => ({
        data: { trackingNumber: '2965869-26', securityPin: '4200' },
      })),
    };
    return { servicio: new OlvaService(prisma as any, api as any), api, update };
  };

  it('registra con el contrato vigente y guarda guía y clave', async () => {
    const { servicio, api, update } = montar();
    await servicio.crearGuiaDesdeDespacho(1, 1);

    const [cuerpo, llave] = api.crearEnvio.mock.calls[0] as unknown as [any, string];
    expect(cuerpo.sender.email).toBe('dueno@mail.com');
    expect(cuerpo.origin).toEqual({ headquarterId: '43' });
    expect(cuerpo.package).toMatchObject({ weightKg: 1, sizeId: 'extra-small' });
    expect(llave).toMatch(/^despacho-5-/);
    expect(update.mock.calls[0][0].data).toMatchObject({
      nroOrden: '2965869-26',
      codigoGuia: '2965869-26',
      claveEnvio: '4200',
    });
  });

  it('el mismo pedido repite la llave; con forzar crea otra', async () => {
    const { servicio, api } = montar();
    await servicio.crearGuiaDesdeDespacho(1, 1);
    await servicio.crearGuiaDesdeDespacho(1, 1);
    await servicio.crearGuiaDesdeDespacho(1, 1, { forzar: true });
    const llaves = api.crearEnvio.mock.calls.map((c: any) => c[1]);
    expect(llaves[0]).toBe(llaves[1]);
    expect(llaves[2]).not.toBe(llaves[0]);
  });

  it.each([
    ['domicilio', { tipoEnvio: 'DOMICILIO' }, /retiro en agencia/],
    ['sin celular', { celularDest: '' }, /celular/],
    ['más de 10 kg', { pesoKg: 12 }, /10 kg/],
    ['documento que no es DNI ni RUC', { dniDestinatario: '123' }, /DNI o RUC/],
  ])('%s: no llama a Olva', async (_n, envio, mensaje) => {
    const { servicio, api } = montar(envio);
    await expect(servicio.crearGuiaDesdeDespacho(1, 1)).rejects.toThrow(mensaje);
    expect(api.crearEnvio).not.toHaveBeenCalled();
  });
});
