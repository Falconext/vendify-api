/**
 * i-Touch 09-11: en el Panel de Ventas "En destino" no le avisaba al cliente.
 * Ese panel no tiene "En agencia"; para un envío que se recoge en agencia, su
 * "En destino" es el "ya llegó, puede recoger" y sale el mismo aviso.
 */
import {
  EnvioDespachoService,
  avisoComoAgencia,
} from './envio-despacho.service';

function armar(envio: Record<string, any>) {
  const svc: any = Object.create(EnvioDespachoService.prototype);
  svc.prisma = {
    envioDespacho: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          comprobanteId: 10,
          estado: 'EN_CAMINO',
          historial: [],
          ...envio,
        }),
      update: jest.fn(async () => ({ repartidor: null, ...envio })),
    },
  };
  svc.validateComprobante = jest
    .fn()
    .mockResolvedValue({ clienteId: 1, cliente: {} });
  svc.repartidorService = {
    resolveForEmpresa: jest.fn().mockResolvedValue(undefined),
  };
  svc.resolveUsuarioNombre = jest.fn().mockResolvedValue('ADMIN');
  svc.syncAdelantoDesdeEnvio = jest.fn();
  svc.backfillTelefonoCliente = jest.fn();
  svc.syncPedidoTiendaByComprobante = jest.fn();
  svc.sincronizarEmbudo = jest.fn();
  svc.notificarCambioEstado = jest.fn().mockResolvedValue(undefined);
  svc.withLegacyRepartidor = (x: any) => x;
  return svc;
}

describe('aviso de "En destino"', () => {
  it.each(['SHALOM_PRO', 'SHALOM_COD', 'OLVA'])(
    '%s: avisa como llegada a la agencia',
    async (transportista) => {
      const svc = armar({
        transportista,
        agenciaDestino: 'AREQUIPA - CERRO COLORADO',
      });
      await svc.update(10, 7, { estado: 'EN_DESTINO' });
      expect(svc.notificarCambioEstado).toHaveBeenCalledWith(
        10,
        7,
        'EN_AGENCIA',
        null,
      );
      // El estado guardado sigue siendo el que eligió el negocio.
      expect(svc.prisma.envioDespacho.update.mock.calls[0][0].data.estado).toBe(
        'EN_DESTINO',
      );
    },
  );

  it('otra agencia (con agencia destino) también avisa', async () => {
    const svc = armar({
      transportista: 'MARVISUR',
      agenciaDestino: 'Agencia Cusco',
    });
    await svc.update(10, 7, { estado: 'EN_DESTINO' });
    expect(svc.notificarCambioEstado).toHaveBeenCalledWith(
      10,
      7,
      'EN_AGENCIA',
      null,
    );
  });

  it('reparto propio sin agencia: "En destino" no manda el texto de agencia', async () => {
    const svc = armar({ transportista: 'PROPIOS', agenciaDestino: null });
    await svc.update(10, 7, { estado: 'EN_DESTINO' });
    expect(svc.notificarCambioEstado).not.toHaveBeenCalled();
  });

  it('notificar=false (el panel manda su propio texto) no duplica el aviso', async () => {
    const svc = armar({ transportista: 'SHALOM_PRO', agenciaDestino: 'X' });
    await svc.update(10, 7, { estado: 'EN_DESTINO', notificar: false });
    expect(svc.notificarCambioEstado).not.toHaveBeenCalled();
  });

  it('EN_AGENCIA y EN_CAMINO siguen igual', async () => {
    expect(
      avisoComoAgencia('EN_AGENCIA', { transportista: 'SHALOM_PRO' }),
    ).toBe(false);
    expect(avisoComoAgencia('EN_CAMINO', { transportista: 'SHALOM_PRO' })).toBe(
      false,
    );
    const svc = armar({ transportista: 'SHALOM_PRO', agenciaDestino: 'X' });
    await svc.update(10, 7, { estado: 'EN_AGENCIA' });
    expect(svc.notificarCambioEstado).toHaveBeenCalledWith(
      10,
      7,
      'EN_AGENCIA',
      null,
    );
  });
});
