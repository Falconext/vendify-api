import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ResellerService } from './reseller.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { SedeService } from '../sede/sede.service';
import { S3Service } from '../s3/s3.service';
import { QpseClient } from '../common/utils/qpse.client';
import { EmpresaService } from '../empresa/empresa.service';

/**
 * Regresiones de seguridad del cobro reseller→plataforma:
 *  - Punto 1: pasar un cliente de DEMO→PRODUCCIÓN por la pantalla de
 *    Configuración (updateClientConfig) DEBE cobrar la activación, igual que
 *    updateClient/updateClientAmbiente. Antes esta ruta no cobraba.
 *  - Punto 2: el descuento de saldo debe ser atómico y condicional, de modo que
 *    nunca deje el saldo negativo (anti-sobregiro / carrera TOCTOU).
 */
describe('ResellerService - seguridad de cobros', () => {
  let service: ResellerService;

  const txMock = {
    reseller: { findUnique: jest.fn(), updateMany: jest.fn() },
    empresa: { count: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    plan: { findUnique: jest.fn() },
    resellerMovimiento: { create: jest.fn(), findFirst: jest.fn() },
    usuario: { update: jest.fn(), findMany: jest.fn() },
  };

  const prismaMock = {
    empresa: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    reseller: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(txMock)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResellerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: NotificacionesService, useValue: {} },
        { provide: SedeService, useValue: {} },
        { provide: S3Service, useValue: {} },
        { provide: QpseClient, useValue: {} },
        { provide: EmpresaService, useValue: {} },
      ],
    }).compile();

    service = module.get<ResellerService>(ResellerService);

    // Defaults comunes usados por cobrarActivacionCliente.
    txMock.reseller.findUnique.mockResolvedValue({
      saldo: 100,
      porcentajeDescuento: 20,
    });
    txMock.empresa.count.mockResolvedValue(0); // clientesActuales en producción
    txMock.empresa.update.mockResolvedValue({
      billingProvider: 'QPSE',
      usaDemo: false,
      usuarioPse: 'u',
      contrasenaPse: 'p',
    });
    txMock.empresa.findUnique.mockResolvedValue({ id: 10, usaDemo: false });
  });

  const empresaDemo = (overrides: Record<string, any> = {}) => ({
    id: 10,
    razonSocial: 'Cliente SAC',
    usaDemo: true,
    planId: 1,
    billingProvider: 'QPSE',
    usuarioPse: 'u',
    contrasenaPse: 'p',
    plan: { nombre: 'Negocio', costo: 30 },
    usuarios: [],
    ...overrides,
  });

  // ---- Punto 1 ----------------------------------------------------------

  it('cobra la activación al pasar DEMO→PRODUCCIÓN vía /config', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaDemo());
    txMock.reseller.updateMany.mockResolvedValue({ count: 1 });

    await service.updateClientConfig(5, 10, {
      usaDemo: false,
      usuarioPse: 'u',
      contrasenaPse: 'p',
    });

    // Se descontó el saldo (cobro atómico) y se registró el movimiento ACTIVACION.
    expect(txMock.reseller.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.resellerMovimiento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'ACTIVACION', monto: -30 }),
      }),
    );
  });

  it('NO cobra si el cliente NO cambia de demo a producción (sin usaDemo)', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaDemo());

    await service.updateClientConfig(5, 10, { adminNombre: 'Nuevo Nombre' });

    expect(txMock.reseller.updateMany).not.toHaveBeenCalled();
    expect(txMock.resellerMovimiento.create).not.toHaveBeenCalled();
  });

  it('NO cobra si el cliente ya estaba en producción (usaDemo:false→false)', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(
      empresaDemo({ usaDemo: false }),
    );

    await service.updateClientConfig(5, 10, {
      usaDemo: false,
      usuarioPse: 'u',
      contrasenaPse: 'p',
    });

    expect(txMock.reseller.updateMany).not.toHaveBeenCalled();
    expect(txMock.resellerMovimiento.create).not.toHaveBeenCalled();
  });

  // ---- Punto 2 ----------------------------------------------------------

  it('el cobro es atómico condicional: usa updateMany con saldo>=costo', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaDemo());
    txMock.reseller.updateMany.mockResolvedValue({ count: 1 });

    await service.updateClientConfig(5, 10, {
      usaDemo: false,
      usuarioPse: 'u',
      contrasenaPse: 'p',
    });

    expect(txMock.reseller.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 5,
          saldo: { gte: 30 },
        }),
        data: { saldo: { decrement: 30 } },
      }),
    );
  });

  it('si el descuento atómico no aplica (count 0), lanza error y NO registra movimiento (anti-sobregiro)', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaDemo());
    // Simula perder la carrera / saldo insuficiente: la condición saldo>=costo
    // no matchea ninguna fila, por lo que NO se descuenta nada.
    txMock.reseller.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateClientConfig(5, 10, {
        usaDemo: false,
        usuarioPse: 'u',
        contrasenaPse: 'p',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(txMock.resellerMovimiento.create).not.toHaveBeenCalled();
    // Nunca se ejecuta un decremento incondicional que pudiera dejar saldo negativo.
    expect(txMock.reseller.updateMany).toHaveBeenCalledTimes(1);
  });

  // ---- #3: upgrade de plan en producción cobra diferencia prorrateada -------

  const empresaProd = (overrides: Record<string, any> = {}) => ({
    id: 10,
    razonSocial: 'Cliente SAC',
    usaDemo: false,
    planId: 1,
    cicloFacturacion: 'MENSUAL',
    fechaExpiracion: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    plan: { nombre: 'Negocio', costo: 30 },
    usuarios: [],
    ...overrides,
  });

  it('#3 cobra un diferencial > 0 al subir de plan (Negocio→Corporativo) en producción', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(empresaProd());
    txMock.plan.findUnique.mockResolvedValue({
      id: 2,
      nombre: 'Corporativo',
      costo: 45,
    });
    txMock.reseller.updateMany.mockResolvedValue({ count: 1 });

    await service.updateClient(5, 10, { planId: 2 });

    expect(txMock.reseller.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 5, saldo: expect.anything() }),
        data: { saldo: { decrement: expect.any(Number) } },
      }),
    );
    const mov = txMock.resellerMovimiento.create.mock.calls[0][0].data;
    expect(mov.tipo).toBe('UPGRADE');
    expect(mov.monto).toBeLessThan(0);
  });

  it('#3 NO cobra al bajar de plan (Corporativo→Negocio)', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(
      empresaProd({ planId: 2, plan: { nombre: 'Corporativo', costo: 45 } }),
    );
    txMock.plan.findUnique.mockResolvedValue({
      id: 1,
      nombre: 'Negocio',
      costo: 30,
    });

    await service.updateClient(5, 10, { planId: 1 });

    expect(txMock.reseller.updateMany).not.toHaveBeenCalled();
    expect(txMock.resellerMovimiento.create).not.toHaveBeenCalled();
  });

  it('#3 NO cobra upgrade si el cliente sigue en DEMO', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue(
      empresaProd({ usaDemo: true }),
    );
    txMock.plan.findUnique.mockResolvedValue({
      id: 2,
      nombre: 'Corporativo',
      costo: 45,
    });

    await service.updateClient(5, 10, { planId: 2 });

    expect(txMock.reseller.updateMany).not.toHaveBeenCalled();
    expect(txMock.resellerMovimiento.create).not.toHaveBeenCalled();
  });

  // ---- #4: no reactivar un cliente vencido ----------------------------------

  it('#4 rechaza reactivar (→ACTIVO) un cliente VENCIDO', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: 10,
      fechaExpiracion: new Date(Date.now() - 24 * 60 * 60 * 1000), // ayer
    });

    await expect(
      service.toggleClientStatus(5, 10, 'ACTIVO'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  });

  it('#4 permite reactivar (→ACTIVO) un cliente VIGENTE', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: 10,
      fechaExpiracion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // futuro
    });
    prismaMock.empresa.update.mockResolvedValue({ id: 10, estado: 'ACTIVO' });

    await service.toggleClientStatus(5, 10, 'ACTIVO');
    expect(prismaMock.empresa.update).toHaveBeenCalledTimes(1);
  });

  it('#4 permite suspender (→INACTIVO) aunque esté vencido', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: 10,
      fechaExpiracion: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    prismaMock.empresa.update.mockResolvedValue({ id: 10, estado: 'INACTIVO' });

    await service.toggleClientStatus(5, 10, 'INACTIVO');
    expect(prismaMock.empresa.update).toHaveBeenCalledTimes(1);
  });

  // ---- #5: la renovación cuenta SOLO clientes en producción -----------------

  it('#5 la renovación manual cuenta el tramo con usaDemo:false (no infla con demos)', async () => {
    jest
      .spyOn(service as any, 'notifyResellerUsers')
      .mockResolvedValue(undefined);

    prismaMock.empresa.findFirst.mockResolvedValue({
      id: 10,
      razonSocial: 'Cliente SAC',
      usaDemo: false,
      fechaExpiracion: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      cicloFacturacion: 'MENSUAL',
      plan: { id: 1, nombre: 'Negocio', costo: 30 },
    });
    prismaMock.reseller.findUnique.mockResolvedValue({
      id: 5,
      saldo: 100,
      porcentajeDescuento: 20,
    });
    prismaMock.empresa.count.mockResolvedValue(0);
    txMock.reseller.updateMany.mockResolvedValue({ count: 1 });

    const res: any = await service.renovarCliente(5, 10);

    expect(prismaMock.empresa.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usaDemo: false }),
      }),
    );
    expect(res.ok).toBe(true);
  });

  it('#5b la renovación manual NO cobra si el saldo no alcanza', async () => {
    jest
      .spyOn(service as any, 'notifyResellerUsers')
      .mockResolvedValue(undefined);

    prismaMock.empresa.findFirst.mockResolvedValue({
      id: 10,
      razonSocial: 'Cliente SAC',
      usaDemo: false,
      fechaExpiracion: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      cicloFacturacion: 'MENSUAL',
      plan: { id: 1, nombre: 'Negocio', costo: 30 },
    });
    prismaMock.reseller.findUnique.mockResolvedValue({
      id: 5,
      saldo: 1,
      porcentajeDescuento: 20,
    });
    prismaMock.empresa.count.mockResolvedValue(0);
    // El cobro condicional no encuentra saldo suficiente.
    txMock.reseller.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.renovarCliente(5, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(txMock.empresa.update).not.toHaveBeenCalled();
    expect(txMock.resellerMovimiento.create).not.toHaveBeenCalled();
  });

  it('#5c las cuentas demo no se pueden renovar', async () => {
    prismaMock.empresa.findFirst.mockResolvedValue({
      id: 10,
      razonSocial: 'Cliente SAC',
      usaDemo: true,
      fechaExpiracion: new Date(),
      cicloFacturacion: 'MENSUAL',
      plan: { id: 1, nombre: 'Negocio', costo: 30 },
    });

    await expect(service.renovarCliente(5, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
