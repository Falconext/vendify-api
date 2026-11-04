import { BadRequestException } from '@nestjs/common';
import {
  couriersParaCliente,
  datosDelClienteParaDespacho,
  enlaceDatosClienteVigente,
  nuevoTokenDatosCliente,
} from './datos-cliente-envio';
import { DatosEnvioClienteService } from './datos-cliente-envio.service';

describe('enlace de datos de envío del cliente', () => {
  describe('vigencia', () => {
    const base = { estado: 'PREPARANDO' };
    it('abierto mientras se prepara y no hay guía', () => {
      expect(enlaceDatosClienteVigente(base)).toBe(true);
    });
    it('se cierra al salir el paquete o con la guía hecha', () => {
      expect(enlaceDatosClienteVigente({ estado: 'EN_CAMINO' })).toBe(false);
      expect(enlaceDatosClienteVigente({ ...base, shalomGuiaCreadaEn: new Date() })).toBe(false);
      expect(enlaceDatosClienteVigente({ ...base, olvaGuiaCreadaEn: new Date() })).toBe(false);
      expect(enlaceDatosClienteVigente({ ...base, nroOrden: '123' })).toBe(false);
      expect(enlaceDatosClienteVigente({ ...base, codigoGuia: 'G-1' })).toBe(false);
      expect(enlaceDatosClienteVigente(null)).toBe(false);
    });
  });

  it('el token no se repite y viaja bien en una URL', () => {
    const a = nuevoTokenDatosCliente();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nuevoTokenDatosCliente()).not.toBe(a);
  });

  describe('qué agencias se ofrecen', () => {
    it('si el negocio ya eligió courier, solo ese', () => {
      expect(couriersParaCliente('SHALOM_COD', ['OLVA'])).toEqual(['SHALOM']);
      expect(couriersParaCliente('OLVA', [])).toEqual(['OLVA']);
    });
    it('si no, las de la tienda, y si tampoco, las dos', () => {
      expect(couriersParaCliente(null, ['OLVA'])).toEqual(['OLVA']);
      expect(couriersParaCliente('', null)).toEqual(['SHALOM', 'OLVA']);
    });
  });

  describe('lo que llenó el cliente', () => {
    const agencia = {
      nombre: '  Freddy   Ramos ',
      celular: '+51 953 504 112',
      documento: '12345678',
      modo: 'SHALOM',
      agenciaId: 'T-77',
      agenciaNombre: 'Cusco Centro - Cusco - Cusco',
    };
    const opc = { couriers: ['SHALOM', 'OLVA'] as any };

    it('agencia Shalom: queda lista para generar la guía', () => {
      expect(datosDelClienteParaDespacho(agencia, opc)).toEqual({
        transportista: 'SHALOM_PRO',
        tipoEnvio: 'AGENCIA',
        nombreDestinatario: 'Freddy Ramos',
        celularDest: '953504112',
        dniDestinatario: '12345678',
        agenciaDestino: 'Cusco Centro - Cusco - Cusco',
        shalomAgenciaDestinoId: 'T-77',
        olvaAgenciaDestinoCodigo: null,
      });
    });

    it('no le cambia Shalom COD al negocio', () => {
      const r = datosDelClienteParaDespacho(agencia, { ...opc, transportistaActual: 'SHALOM_COD' });
      expect(r.transportista).toBe('SHALOM_COD');
    });

    it('agencia Olva guarda el código de Olva', () => {
      const r: any = datosDelClienteParaDespacho({ ...agencia, modo: 'OLVA', agenciaId: 'OLV1' }, opc);
      expect(r).toMatchObject({ transportista: 'OLVA', olvaAgenciaDestinoCodigo: 'OLV1', shalomAgenciaDestinoId: null });
    });

    it('a domicilio pide dirección; el DNI es opcional', () => {
      const r: any = datosDelClienteParaDespacho(
        { nombre: 'Ana Díaz', celular: '987654321', modo: 'DOMICILIO', direccion: 'Av. Sol 123', distrito: 'Wanchaq', referencia: 'portón azul' },
        opc,
      );
      expect(r).toMatchObject({
        tipoEnvio: 'DOMICILIO',
        direccionDestino: 'Av. Sol 123',
        agenciaDestino: 'Av. Sol 123 - Wanchaq',
        distrito: 'Wanchaq',
        observaciones: 'portón azul',
      });
      expect(r.dniDestinatario).toBeUndefined();
      expect(r.transportista).toBeUndefined();
    });

    it.each([
      [{ nombre: 'A' }, /nombre/],
      [{ celular: '12345' }, /celular/],
      [{ documento: '123' }, /DNI/],
      [{ agenciaNombre: '' }, /agencia/],
      [{ modo: 'URBANO' }, /agencias de la lista/],
    ])('rechaza datos incompletos %#', (cambio, mensaje) => {
      expect(() => datosDelClienteParaDespacho({ ...agencia, ...cambio }, opc)).toThrow(mensaje);
    });

    it('no acepta un courier que el enlace no ofrece', () => {
      expect(() => datosDelClienteParaDespacho({ ...agencia, modo: 'OLVA' }, { couriers: ['SHALOM'] })).toThrow(
        BadRequestException,
      );
    });
  });
});

describe('DatosEnvioClienteService', () => {
  function despacho(extra: Record<string, unknown> = {}) {
    return {
      id: 5,
      comprobanteId: 40,
      estado: 'PREPARANDO',
      transportista: null,
      codigoGuia: null,
      nroOrden: null,
      shalomGuiaCreadaEn: null,
      olvaGuiaCreadaEn: null,
      tipoEnvio: 'AGENCIA',
      nombreDestinatario: null,
      dniDestinatario: null,
      celularDest: null,
      agenciaDestino: null,
      direccionDestino: null,
      distrito: null,
      observaciones: null,
      shalomAgenciaDestinoId: null,
      olvaAgenciaDestinoCodigo: null,
      datosClienteEn: null,
      datosClienteToken: 'tok',
      historial: [{ estado: 'PREPARANDO', nota: 'Despacho creado' }],
      comprobante: {
        empresaId: 7,
        serie: 'NV01',
        correlativo: 12,
        clienteId: 3,
        cliente: { nombre: 'Freddy', nroDoc: '12345678', telefono: null },
        detalles: [{ cantidad: 2, descripcion: 'KHAMRA QAWUA' }],
        empresa: { razonSocial: 'Aroma SAC', nombreComercial: 'Aroma360', couriersTienda: [] },
      },
      ...extra,
    };
  }

  function armar(d: any = despacho()) {
    const prisma: any = {
      comprobante: {
        findFirst: jest.fn().mockResolvedValue({ id: 40, serie: 'NV01', correlativo: 12, cliente: { nombre: 'Freddy', telefono: '953504112' } }),
      },
      envioDespacho: {
        findUnique: jest.fn().mockResolvedValue(d),
        update: jest.fn().mockResolvedValue({ datosClienteToken: 'nuevo' }),
      },
      cliente: { update: jest.fn().mockResolvedValue({}) },
    };
    const envios: any = { create: jest.fn().mockResolvedValue({}) };
    const notificaciones: any = { notificarAdminsEmpresa: jest.fn().mockResolvedValue(undefined) };
    const shalom: any = {
      getAgencias: jest.fn().mockResolvedValue({
        data: [{ terId: 'T1', nombre: 'Cusco Centro', departamento: 'Cusco', provincia: 'Cusco', distrito: 'Cusco' }],
      }),
    };
    const s = new DatosEnvioClienteService(prisma, envios, notificaciones, shalom, undefined);
    return { s, prisma, envios, notificaciones, shalom };
  }

  it('el enlace es idempotente: devuelve el mismo token', async () => {
    const { s, prisma } = armar();
    const r = await s.enlace(40, 7);
    expect(r).toMatchObject({ token: 'tok', pedido: 'NV01-00000012', telefono: '953504112' });
    expect(prisma.envioDespacho.update).not.toHaveBeenCalled();
  });

  it('sin despacho, lo crea y genera el token', async () => {
    const { s, prisma, envios } = armar();
    prisma.envioDespacho.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(despacho({ datosClienteToken: null }));
    const r = await s.enlace(40, 7, 2);
    expect(envios.create).toHaveBeenCalledWith(40, 7, { tipoEnvio: 'AGENCIA' }, 2);
    expect(r.token).toBe('nuevo');
  });

  it('con guía hecha ya no da enlace', async () => {
    const { s } = armar(despacho({ nroOrden: '999' }));
    await expect(s.enlace(40, 7)).rejects.toThrow(/ya tiene guía/);
  });

  it('el cliente ve su pedido sin montos y con lo que ya se sabe', async () => {
    const { s } = armar();
    const r: any = await s.verPorToken('tok');
    expect(r).toMatchObject({
      negocio: 'Aroma360',
      pedido: 'NV01-00000012',
      couriers: ['SHALOM', 'OLVA'],
      datos: { nombre: 'Freddy', documento: '12345678', modo: 'SHALOM' },
    });
    expect(JSON.stringify(r)).not.toMatch(/total|monto|precio/i);
  });

  it('token cerrado o inexistente: null (el controlador lo vuelve 404)', async () => {
    expect(await armar(despacho({ estado: 'EN_CAMINO' })).s.verPorToken('tok')).toBeNull();
    expect(await armar(null).s.verPorToken('x')).toBeNull();
    expect(await armar().s.verPorToken('')).toBeNull();
  });

  it('agencias: solo de los couriers que ofrece el enlace', async () => {
    const { s } = armar(despacho({ transportista: 'SHALOM_PRO' }));
    expect(await s.agenciasPorToken('tok', 'shalom')).toEqual([
      { id: 'T1', nombre: 'Cusco Centro', departamento: 'Cusco', provincia: 'Cusco', distrito: 'Cusco' },
    ]);
    await expect(s.agenciasPorToken('tok', 'OLVA')).rejects.toThrow(BadRequestException);
  });

  it('guarda en el despacho, deja rastro en el historial y avisa al negocio', async () => {
    const { s, prisma, notificaciones } = armar();
    await s.guardarPorToken('tok', {
      nombre: 'Freddy Ramos',
      celular: '953504112',
      documento: '12345678',
      modo: 'SHALOM',
      agenciaId: 'T1',
      agenciaNombre: 'Cusco Centro - Cusco - Cusco',
    });
    const data = prisma.envioDespacho.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      transportista: 'SHALOM_PRO',
      dniDestinatario: '12345678',
      shalomAgenciaDestinoId: 'T1',
      datosClienteEn: expect.any(Date),
    });
    expect(data.historial).toHaveLength(2);
    expect(data.historial[1]).toMatchObject({ usuarioNombre: 'Cliente (enlace)' });
    expect(data.historial[1].nota).toMatch(/completó.*Shalom - Cusco Centro/);
    // El cliente no tenía celular: se le completa.
    expect(prisma.cliente.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { telefono: '953504112' } });
    expect(notificaciones.notificarAdminsEmpresa).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 7, titulo: expect.stringContaining('NV01-00000012') }),
    );
  });

  it('si ya los había llenado, cuenta que los corrigió', async () => {
    const { s, notificaciones } = armar(despacho({ datosClienteEn: new Date() }));
    await s.guardarPorToken('tok', {
      nombre: 'Freddy Ramos', celular: '953504112', modo: 'DOMICILIO', direccion: 'Av. Sol 123',
    });
    expect(notificaciones.notificarAdminsEmpresa.mock.calls[0][0].titulo).toMatch(/corrigió/);
  });

  it('con datos inválidos no toca nada', async () => {
    const { s, prisma } = armar();
    await expect(s.guardarPorToken('tok', { nombre: 'Fr', modo: 'SHALOM' })).rejects.toThrow(BadRequestException);
    expect(prisma.envioDespacho.update).not.toHaveBeenCalled();
  });
});
