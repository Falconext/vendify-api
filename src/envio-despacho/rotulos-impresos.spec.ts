/**
 * HELOUSHOP 02-11: al imprimir los rótulos, el pedido pasa a "Confirmado"
 * (interno) para no confundirlo con los nuevos ni imprimirlo otra vez.
 */
import { EnvioDespachoService } from './envio-despacho.service';
import { EstadoDespacho } from './dto/envio-despacho.dto';
import { enlaceDatosClienteVigente } from './datos-cliente-envio';

describe('rótulos impresos → Confirmado', () => {
  const svc: any = Object.create(EnvioDespachoService.prototype);
  beforeEach(() => {
    svc.prisma = { envioDespacho: { findMany: jest.fn().mockResolvedValue([{ comprobanteId: 10 }, { comprobanteId: 11 }]) } };
    svc.update = jest.fn().mockResolvedValue({});
  });

  it('solo los que siguen en Preparando y de la empresa, vía update (queda en el historial)', async () => {
    const r = await svc.marcarRotulosImpresos(7, [10, 11, 12, 10, -1], 3);
    expect(svc.prisma.envioDespacho.findMany.mock.calls[0][0].where).toEqual({
      comprobanteId: { in: [10, 11, 12] },
      estado: EstadoDespacho.PREPARANDO,
      comprobante: { empresaId: 7 },
    });
    expect(svc.update).toHaveBeenCalledTimes(2);
    // Sin `observaciones`: esas son las indicaciones de entrega del negocio.
    expect(svc.update).toHaveBeenCalledWith(10, 7, { estado: 'CONFIRMADO' }, 3, 'Rótulo impreso');
    expect(r).toEqual({ confirmados: 2 });
  });

  it('sin ids no hace nada', async () => {
    expect(await svc.marcarRotulosImpresos(7, [], 3)).toEqual({ confirmados: 0 });
    expect(svc.prisma.envioDespacho.findMany).not.toHaveBeenCalled();
  });

  it('confirmado sigue en el local: el cliente aún puede corregir sus datos', () => {
    expect(enlaceDatosClienteVigente({ estado: 'CONFIRMADO' } as any)).toBe(true);
    expect(enlaceDatosClienteVigente({ estado: 'EN_CAMINO' } as any)).toBe(false);
  });

  /**
   * ELEINN 03-11: imprimir pisaba "Entregar después de las 2pm" con
   * "Rótulo impreso". Pasa por el `update` real.
   */
  it('no pisa la nota de entrega: "Rótulo impreso" queda solo en el historial', async () => {
    const real: any = Object.create(EnvioDespachoService.prototype);
    const guardado: any[] = [];
    real.prisma = {
      envioDespacho: {
        findMany: jest.fn().mockResolvedValue([{ comprobanteId: 10 }]),
        findUnique: jest.fn().mockResolvedValue({
          comprobanteId: 10,
          estado: 'PREPARANDO',
          observaciones: 'Entregar después de las 2pm',
          historial: [{ estado: 'PREPARANDO', nota: 'Despacho creado' }],
        }),
        update: jest.fn(async (args: any) => { guardado.push(args.data); return { repartidor: null }; }),
      },
    };
    real.validateComprobante = jest.fn().mockResolvedValue({ clienteId: 1, cliente: {} });
    real.repartidorService = { resolveForEmpresa: jest.fn().mockResolvedValue(undefined) };
    real.resolveUsuarioNombre = jest.fn().mockResolvedValue('PIERRE');
    real.syncAdelantoDesdeEnvio = jest.fn();
    real.backfillTelefonoCliente = jest.fn();
    real.syncPedidoTiendaByComprobante = jest.fn();
    real.sincronizarEmbudo = jest.fn();
    real.notificarCambioEstado = jest.fn().mockResolvedValue(undefined);
    real.withLegacyRepartidor = (x: any) => x;

    expect(await real.marcarRotulosImpresos(7, [10], 141)).toEqual({ confirmados: 1 });
    const data = guardado[0];
    expect(data.estado).toBe('CONFIRMADO');
    expect('observaciones' in data).toBe(false);
    expect(data.historial).toHaveLength(2);
    expect(data.historial[1]).toMatchObject({ estado: 'CONFIRMADO', nota: 'Rótulo impreso', usuarioId: 141 });
    // Confirmado no le escribe al cliente.
    expect(real.notificarCambioEstado).not.toHaveBeenCalled();
  });
});
