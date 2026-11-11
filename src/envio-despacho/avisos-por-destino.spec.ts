import { EnvioDespachoService } from './envio-despacho.service';
import { EstadoDespacho } from './dto/envio-despacho.dto';

// El aviso "en camino" y "entregado" de Lima (motorizado) no es el mismo texto
// que el de provincia (agencia). Se prueba qué texto sale.
const CONFIG = {
  mensajeEnCamino: 'Lima: {{nombre}}, {{repartidor}} va con tu pedido {{pedido}}',
  mensajeEnCaminoAgencia:
    'Provincia: {{nombre}}, tu pedido {{pedido}} va a {{agencia}}. Clave {{clave}}',
  mensajeEntregado: 'Lima: entregado {{pedido}}',
  mensajeEntregadoAgencia: 'Provincia: recogiste {{pedido}} en {{agencia}}',
  notificarEnCamino: true,
  notificarEntregado: true,
};
const ENVIO_LIMA = {
  tipoEnvio: 'DOMICILIO',
  transportista: 'PROPIOS',
  agenciaDestino: null,
  claveEnvio: null,
};
const ENVIO_SHALOM = {
  tipoEnvio: 'AGENCIA',
  transportista: 'SHALOM_PRO',
  agenciaDestino: 'Shalom Cusco Centro',
  claveEnvio: '4321',
};

function armar(opts: {
  config?: Record<string, unknown> | null;
  envio?: Record<string, unknown>;
  telefono?: string | null;
}) {
  const envio = { ...ENVIO_LIMA, ...opts.envio };
  const telefono = opts.telefono === undefined ? '987654321' : opts.telefono;
  const comp = {
    id: 1,
    empresaId: 1,
    serie: 'NV01',
    correlativo: 7,
    cliente: { nombre: 'Ana', telefono },
  };
  const prisma = {
    comprobante: { findFirst: jest.fn(async () => comp) },
    empresa: { findUnique: jest.fn(async () => ({ razonSocial: 'HS SAC' })) },
    despachoMensajeTemplate: {
      findUnique: jest.fn(async () =>
        opts.config === null ? null : { ...CONFIG, ...opts.config },
      ),
    },
    envioDespacho: {
      findFirst: jest.fn(async () => envio),
      findUnique: jest.fn(async () => ({ repartidor: { nombre: 'Luis' } })),
    },
  };
  const whatsapp = {
    enviarTexto: jest.fn(async () => ({ success: true })),
  };
  const servicio = new EnvioDespachoService(
    prisma as never,
    {} as never,
    whatsapp as never,
  );
  const vista = async (estado: string) =>
    (await servicio.mensajeParaEstado(1, 1, estado)).texto;
  return { servicio, whatsapp, vista };
}

describe('avisos de despacho: Lima vs provincia', () => {
  it('en camino a domicilio en Lima → texto general', async () => {
    expect(await armar({}).vista(EstadoDespacho.EN_CAMINO)).toBe(
      'Lima: Ana, Luis va con tu pedido NV01-00000007',
    );
  });

  it('en camino por Shalom → texto de provincia con agencia y clave', async () => {
    expect(
      await armar({ envio: ENVIO_SHALOM }).vista(EstadoDespacho.EN_CAMINO),
    ).toBe(
      'Provincia: Ana, tu pedido NV01-00000007 va a Shalom Cusco Centro. Clave 4321',
    );
  });

  it('provincia sin texto propio (vacío) → sale el general', async () => {
    const { vista } = armar({
      envio: ENVIO_SHALOM,
      config: { mensajeEnCaminoAgencia: '  ', mensajeEntregadoAgencia: null },
    });
    expect(await vista(EstadoDespacho.EN_CAMINO)).toMatch(/^Lima: Ana/);
    expect(await vista(EstadoDespacho.ENTREGADO)).toBe(
      'Lima: entregado NV01-00000007',
    );
  });

  it('clave apagada: {{clave}} queda vacío en el aviso de provincia', async () => {
    const { vista } = armar({
      envio: ENVIO_SHALOM,
      config: { claveEnAvisos: false },
    });
    expect(await vista(EstadoDespacho.EN_CAMINO)).toBe(
      'Provincia: Ana, tu pedido NV01-00000007 va a Shalom Cusco Centro. Clave',
    );
  });

  it('el envío real manda el texto de provincia a WhatsApp', async () => {
    const { servicio, whatsapp } = armar({ envio: ENVIO_SHALOM });
    await (servicio as any).notificarCambioEstado(
      1,
      1,
      EstadoDespacho.ENTREGADO,
      null,
    );
    expect(whatsapp.enviarTexto).toHaveBeenCalledWith(
      '987654321',
      'Provincia: recogiste NV01-00000007 en Shalom Cusco Centro',
    );
  });

  it('con el aviso apagado no sale nada aunque haya texto de provincia', async () => {
    const { servicio, whatsapp } = armar({
      envio: ENVIO_SHALOM,
      config: { notificarEnCamino: false },
    });
    await (servicio as any).notificarCambioEstado(
      1,
      1,
      EstadoDespacho.EN_CAMINO,
      null,
    );
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });
});

describe('vista previa del aviso', () => {
  it('armar el mensaje no lo envía', async () => {
    const { vista, whatsapp } = armar({});
    await vista(EstadoDespacho.ENTREGADO);
    expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
  });

  it('En destino propone el texto de agencia', async () => {
    const { vista } = armar({ envio: ENVIO_SHALOM });
    expect(await vista(EstadoDespacho.EN_DESTINO)).toContain(
      'ya está en Shalom Cusco Centro',
    );
  });

  it('estado sin aviso propio → mensaje simple editable', async () => {
    const { vista } = armar({});
    expect(await vista(EstadoDespacho.DEVUELTO)).toBe(
      'Hola Ana, tu pedido NV01-00000007 está devuelto.',
    );
  });

  it('cliente sin celular → sin mensaje', async () => {
    const { servicio } = armar({ telefono: null });
    expect(
      await servicio.mensajeParaEstado(1, 1, EstadoDespacho.EN_CAMINO),
    ).toEqual({ telefono: null, texto: null });
  });

  it('el editado sale tal cual; si WhatsApp falla, avisa', async () => {
    const { servicio, whatsapp } = armar({});
    expect(
      await servicio.enviarMensajeCliente(1, 1, '987654321', ' Hola '),
    ).toEqual({ enviado: true });
    expect(whatsapp.enviarTexto).toHaveBeenCalledWith('987654321', 'Hola');
    whatsapp.enviarTexto.mockResolvedValueOnce({
      success: false,
      error: 'WhatsApp no configurado',
    } as never);
    await expect(
      servicio.enviarMensajeCliente(1, 1, '987654321', 'Hola'),
    ).rejects.toThrow('WhatsApp no configurado');
  });
});
