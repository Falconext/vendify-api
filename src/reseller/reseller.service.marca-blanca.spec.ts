import { Test, TestingModule } from '@nestjs/testing';
import { ResellerService } from './reseller.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { SedeService } from '../sede/sede.service';
import { S3Service } from '../s3/s3.service';
import { QpseClient } from '../common/utils/qpse.client';
import { EmpresaService } from '../empresa/empresa.service';

/**
 * Cuota MENSUAL de marca blanca que la plataforma le cobra al reseller.
 *
 * Reglas cubiertas:
 *  - El ciclo arranca con el PRIMER cliente que pasa a producción y se cobra ahí mismo.
 *  - Tramos por cantidad de clientes en producción: <20 => 50, <50 => 70, <100 => 100, 100+ => 100.
 *  - Se repite cada mes en la misma fecha (aniversario).
 *  - Si el saldo no alcanza: queda PENDIENTE, NO avanza el aniversario y NO rompe la activación.
 *  - Idempotente: un solo cobro APLICADO por reseller y período (YYYY-MM).
 */
describe('ResellerService - cuota de marca blanca', () => {
  let service: ResellerService;

  const txMock = {
    reseller: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    empresa: { count: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    plan: { findUnique: jest.fn() },
    resellerMovimiento: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    usuario: { findMany: jest.fn(), update: jest.fn() },
  };

  const prismaMock = {
    empresa: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    reseller: { findUnique: jest.fn(), findMany: jest.fn() },
    usuario: { findMany: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(txMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResellerService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: NotificacionesService,
          useValue: { crearNotificacion: jest.fn() },
        },
        { provide: SedeService, useValue: {} },
        { provide: S3Service, useValue: {} },
        { provide: QpseClient, useValue: {} },
        { provide: EmpresaService, useValue: {} },
      ],
    }).compile();

    service = module.get<ResellerService>(ResellerService);

    txMock.reseller.updateMany.mockResolvedValue({ count: 1 });
    txMock.resellerMovimiento.findFirst.mockResolvedValue(null);
    txMock.empresa.update.mockResolvedValue({
      billingProvider: 'QPSE',
      usaDemo: false,
      usuarioPse: 'u',
      contrasenaPse: 'p',
    });
    txMock.usuario.findMany.mockResolvedValue([]);
    prismaMock.usuario.findMany.mockResolvedValue([]);
  });

  // Movimiento creado con un tipo dado (o undefined si no se creó).
  const movimiento = (tipo: string) =>
    txMock.resellerMovimiento.create.mock.calls
      .map((c: any[]) => c[0]?.data)
      .find((d: any) => d?.tipo === tipo);

  // ---- Arranque del ciclo con el primer cliente en producción ------------

  const activarPrimerCliente = async (opts?: {
    clientesPrevios?: number;
    whiteLabelDesde?: Date | null;
  }) => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: 10,
      razonSocial: 'Cliente SAC',
      usaDemo: true,
      planId: 1,
      billingProvider: 'QPSE',
      usuarioPse: 'u',
      contrasenaPse: 'p',
      plan: { nombre: 'Negocio', costo: 30 },
      usuarios: [],
    });
    txMock.reseller.findUnique.mockResolvedValue({
      saldo: 500,
      porcentajeDescuento: 20,
      whiteLabelDesde: opts?.whiteLabelDesde ?? null,
    });
    txMock.empresa.count.mockResolvedValue(opts?.clientesPrevios ?? 0);
    txMock.empresa.findUnique.mockResolvedValue({ id: 10, usaDemo: false });

    await service.updateClientConfig(5, 10, {
      usaDemo: false,
      usuarioPse: 'u',
      contrasenaPse: 'p',
    });
  };

  it('el primer cliente en producción arranca el ciclo y cobra la cuota en el acto', async () => {
    await activarPrimerCliente();

    const mov = movimiento('MARCA_BLANCA');
    expect(mov).toBeDefined();
    expect(mov.monto).toBe(-50); // 1 cliente => tramo base
    expect(mov.estado).toBe('APLICADO');
    expect(mov.periodo).toMatch(/^\d{4}-\d{2}$/);

    // Se fijó el aniversario: primer cobro hoy, siguiente en un mes.
    const update = txMock.reseller.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 5 });
    expect(update.data.whiteLabelDesde).toBeInstanceOf(Date);
    const desde = update.data.whiteLabelDesde as Date;
    const proximo = update.data.whiteLabelProximoCobro as Date;
    expect(proximo.getDate()).toBe(desde.getDate()); // mismo día del mes
    expect(proximo.getTime()).toBeGreaterThan(desde.getTime());
  });

  it('no vuelve a arrancar el ciclo si el reseller ya lo tenía iniciado', async () => {
    await activarPrimerCliente({
      whiteLabelDesde: new Date('2026-01-15T12:00:00Z'),
      clientesPrevios: 3,
    });

    expect(movimiento('MARCA_BLANCA')).toBeUndefined();
    expect(txMock.reseller.update).not.toHaveBeenCalled();
    // La activación sí se cobró: la cuota no interfiere con el flujo normal.
    expect(movimiento('ACTIVACION')).toBeDefined();
  });

  it('si el saldo no alcanza para la cuota, queda PENDIENTE y NO rompe la activación', async () => {
    // 1ª llamada (activación): cobra. 2ª (marca blanca): saldo insuficiente.
    txMock.reseller.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await activarPrimerCliente();

    const mov = movimiento('MARCA_BLANCA');
    expect(mov.estado).toBe('PENDIENTE');
    expect(mov.motivo).toContain('Saldo insuficiente');
    // La activación se completó igual (el cliente quedó en producción).
    expect(movimiento('ACTIVACION')).toBeDefined();
    expect(txMock.empresa.update).toHaveBeenCalled();
  });

  // ---- Tramos por cantidad de clientes -----------------------------------

  it.each([
    [0, -50],
    [18, -50],
    [19, -70],
    [48, -70],
    [49, -100],
    [98, -100],
    [150, -100],
  ])(
    'con %i clientes previos en producción cobra %i de cuota',
    async (clientesPrevios, montoEsperado) => {
      await activarPrimerCliente({ clientesPrevios });
      expect(movimiento('MARCA_BLANCA').monto).toBe(montoEsperado);
    },
  );

  // ---- Cobro mensual recurrente ------------------------------------------

  const correrCobroMensual = async (opts: {
    proximoCobro: Date;
    clientesActivos: number;
    saldoAlcanza?: boolean;
    yaCobrado?: boolean;
  }) => {
    prismaMock.reseller.findMany.mockResolvedValue([
      {
        id: 7,
        nombre: 'Reseller Uno',
        whiteLabelProximoCobro: opts.proximoCobro,
      },
    ]);
    prismaMock.empresa.count.mockResolvedValue(opts.clientesActivos);
    txMock.resellerMovimiento.findFirst.mockResolvedValue(
      opts.yaCobrado ? { id: 99 } : null,
    );
    txMock.reseller.updateMany.mockResolvedValue({
      count: opts.saldoAlcanza === false ? 0 : 1,
    });
    return service.procesarCobrosMarcaBlanca();
  };

  it('cobra la cuota vencida y corre el aniversario un mes', async () => {
    const res = await correrCobroMensual({
      proximoCobro: new Date('2026-03-15T12:00:00Z'),
      clientesActivos: 25,
    });

    expect(res.cobrados).toBe(1);
    expect(res.pendientes).toBe(0);
    expect(res.montoCobrado).toBe(70); // 25 clientes => tramo medio

    const mov = movimiento('MARCA_BLANCA');
    expect(mov.monto).toBe(-70);
    expect(mov.periodo).toBe('2026-03'); // período del vencimiento, no de hoy

    const nueva = txMock.reseller.update.mock.calls[0][0].data
      .whiteLabelProximoCobro as Date;
    expect(nueva.getMonth()).toBe(3); // marzo -> abril
    expect(nueva.getDate()).toBe(15); // mismo día: aniversario
  });

  it('si el saldo no alcanza deja PENDIENTE y NO avanza el aniversario (reintenta mañana)', async () => {
    const res = await correrCobroMensual({
      proximoCobro: new Date('2026-03-15T12:00:00Z'),
      clientesActivos: 25,
      saldoAlcanza: false,
    });

    expect(res.cobrados).toBe(0);
    expect(res.pendientes).toBe(1);
    expect(movimiento('MARCA_BLANCA').estado).toBe('PENDIENTE');
    expect(txMock.reseller.update).not.toHaveBeenCalled();
  });

  it('no cobra dos veces el mismo período: si ya está APLICADO solo avanza la fecha', async () => {
    const res = await correrCobroMensual({
      proximoCobro: new Date('2026-03-15T12:00:00Z'),
      clientesActivos: 25,
      yaCobrado: true,
    });

    expect(res.cobrados).toBe(1);
    expect(res.montoCobrado).toBe(0); // no se volvió a cobrar
    expect(txMock.reseller.updateMany).not.toHaveBeenCalled(); // no tocó el saldo
    expect(txMock.resellerMovimiento.create).not.toHaveBeenCalled();
    expect(txMock.reseller.update).toHaveBeenCalled(); // pero sí avanzó el ciclo
  });

  it('el aniversario 31 no se desborda: cae en el último día del mes corto', async () => {
    await correrCobroMensual({
      proximoCobro: new Date('2026-01-31T12:00:00Z'),
      clientesActivos: 5,
    });

    const nueva = txMock.reseller.update.mock.calls[0][0].data
      .whiteLabelProximoCobro as Date;
    expect(nueva.getMonth()).toBe(1); // febrero
    expect(nueva.getDate()).toBe(28); // 2026 no es bisiesto
  });
});
